import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { initializeCardAuthorization, paystackConfigured } from '@packages/billing/paystack';

/**
 * POST /api/auto-apply/activate: start the free auto-apply activation
 * (Milestone 3, owner decision D2). Zero-amount card verification via
 * Paystack purpose=ADD_CARD: the card is authenticated, never charged, and
 * (no recurring_consent) can never be charged through us afterwards.
 *
 * SECURITY / PCI hygiene: card details arrive over TLS, are held in memory
 * only, are relayed to Paystack immediately, and are NEVER stored, logged,
 * or echoed. Only the Paystack access code and (later, via the webhook)
 * last4/brand/bank are persisted. Error responses never include card data.
 */

const body = z.object({
  card: z.object({
    number: z.string().regex(/^\d{13,19}$/),
    cvv: z.string().regex(/^\d{3,4}$/),
    expiryMonth: z.string().regex(/^(0?[1-9]|1[0-2])$/),
    expiryYear: z.string().regex(/^\d{2,4}$/),
    cardholderName: z.string().trim().min(2).max(80),
  }),
});

export async function POST(req: Request) {
  if (!paystackConfigured()) {
    return Response.json({ error: 'BILLING_NOT_CONFIGURED' }, { status: 503 });
  }
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  // Verification attempts are precious (each opens a Paystack session):
  // 5 per hour per account.
  const rate = await enforceRateLimit(`activation:${requestIp(req)}:${user.id}`, 5, '1 h');
  if (!rate.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  // Deliberately vague: never repeat which card field failed.
  if (!parsed.success) return Response.json({ error: 'INVALID_CARD' }, { status: 400 });

  const { card } = parsed.data;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .maybeSingle();
  const fullName = (profile as { full_name?: string | null } | null)?.full_name ?? null;
  const firstName = fullName ? fullName.split(' ')[0] : null;
  const lastName = fullName && fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : null;

  let init;
  try {
    init = await initializeCardAuthorization({
      email: user.email ?? '',
      firstName,
      lastName,
      card: {
        number: card.number,
        cvv: card.cvv,
        expiryMonth: card.expiryMonth.padStart(2, '0'),
        expiryYear: card.expiryYear,
        cardholderName: card.cardholderName,
      },
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/auto-apply/activation`,
    });
  } catch (error) {
    // Paystack error messages never contain card data; ours must not either.
    console.error('card verification init failed', { userId: user.id, err: error instanceof Error ? error.message.slice(0, 200) : 'unknown' });
    return Response.json(
      { error: 'CARD_VERIFICATION_UNAVAILABLE', message: 'Paystack could not start the card check. Please try again.' },
      { status: 503 },
    );
  }

  // Record the pending activation, keyed by Paystack's access code so the
  // signed webhook can match the event to this user. One row per user:
  // re-verification overwrites the previous attempt.
  const { error: upsertError } = await supabaseAdmin
    .from('auto_apply_activations')
    .upsert(
      {
        user_id: user.id,
        status: 'PENDING',
        access_code: init.authorizationAccessCode,
        reference: null,
        card_last4: null,
        card_brand: null,
        bank: null,
        activated_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (upsertError) {
    return Response.json({ error: 'ACTIVATION_RECORD_FAILED' }, { status: 500 });
  }

  return Response.json({ redirectUrl: init.value });
}
