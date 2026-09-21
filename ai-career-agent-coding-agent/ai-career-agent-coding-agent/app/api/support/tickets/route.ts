import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/email/resend';
import { makeTicketId, escapeHtml, SUPPORT_CATEGORIES } from '@/lib/support/tickets';

export const dynamic = 'force-dynamic';

const SUPPORT_INBOX = 'support@jobiest.com';
const CATEGORIES: readonly string[] = SUPPORT_CATEGORIES;


export async function POST(request: Request) {
  try {
    const ip = requestIp(request);
    const rl = await enforceRateLimit('support-ticket', 5, '1 h', ip);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'RATE_LIMITED', message: 'Too many tickets. Please wait before submitting another.' }, { status: 429 });
    }

    const body = (await request.json()) as {
      email?: string;
      category?: string;
      subject?: string;
      message?: string;
      conversationId?: string;
    };
    const email = String(body.email ?? '').slice(0, 200).trim();
    const category = CATEGORIES.includes(String(body.category ?? '')) ? String(body.category) : 'Other';
    const subject = String(body.subject ?? '').slice(0, 200).trim();
    const message = String(body.message ?? '').slice(0, 5000).trim();

    if (!subject || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'VALIDATION_FAILED', message: 'A valid email, subject, and message are required.' }, { status: 400 });
    }

    const user = await getUser();

    // Confirm the conversation belongs to this requester when provided.
    let conversationId: string | null = typeof body.conversationId === 'string' && body.conversationId.length > 10 ? body.conversationId : null;
    if (conversationId) {
      const { data: existing } = await supabaseAdmin
        .from('support_conversations')
        .select('id, user_id')
        .eq('id', conversationId)
        .maybeSingle();
      if (!existing || (user && existing.user_id && existing.user_id !== user.id)) conversationId = null;
    }

    const isBilling = category === 'Payments & Subscription';
    const priority = isBilling || /refund|charge|security|locked out|delete (my|the) (account|data)/i.test(message) ? 'HIGH' : 'NORMAL';

    // DATABASE WRITE FIRST: the ticket exists before we tell the user anything.
    let ticketId = makeTicketId();
    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
      const { error } = await supabaseAdmin.from('support_tickets').insert({
        id: ticketId,
        conversation_id: conversationId,
        user_id: user?.id ?? null,
        email,
        category,
        priority,
        subject,
        body: message,
        email_status: 'PENDING',
      });
      if (!error) inserted = true;
      else if (/duplicate key|unique/i.test(error.message)) ticketId = makeTicketId();
      else throw new Error(error.message);
    }
    if (!inserted) throw new Error('TICKET_ID_COLLISION');

    // Email attempt after the DB write; status is recorded either way.
    let emailStatus = 'SENT';
    let emailError: string | null = null;
    try {
      const result = await sendEmail({
        to: SUPPORT_INBOX,
        replyTo: email,
        subject: `[${ticketId}] ${category}: ${subject}`,
        text: `Ticket: ${ticketId}\nFrom: ${email}\nCategory: ${category}\nPriority: ${priority}\n\n${message}`,
        html: [
          `<p><strong>Ticket:</strong> ${ticketId}</p>`,
          `<p><strong>From:</strong> ${escapeHtml(email)}</p>`,
          `<p><strong>Category:</strong> ${escapeHtml(category)}</p>`,
          `<p><strong>Priority:</strong> ${priority}</p>`,
          `<hr /><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>`,
        ].join(''),
      });
      if (!result.ok) {
        emailStatus = 'FAILED';
        emailError = result.error ?? 'SEND_FAILED';
      }
    } catch (err) {
      emailStatus = 'FAILED';
      emailError = err instanceof Error ? err.message : 'SEND_EXCEPTION';
    }

    await supabaseAdmin.from('support_tickets').update({ email_status: emailStatus, email_error: emailError, updated_at: new Date().toISOString() }).eq('id', ticketId);
    void supabaseAdmin.from('support_analytics_events').insert({ event_type: 'TICKET_CREATED', conversation_id: conversationId, metadata: { ticketId, category, emailStatus } });

    return NextResponse.json({
      ticketId,
      emailStatus,
      message: emailStatus === 'SENT'
        ? `Ticket ${ticketId} created. A confirmation path is your ticket ID; our support team will reply to ${email}.`
        : `Ticket ${ticketId} created and saved. Email delivery to the support inbox failed (${emailError}); the ticket is safely recorded and will be handled.`,
    });
  } catch (error) {
    console.error('support ticket error', error);
    return NextResponse.json({ error: 'TICKET_FAILED', message: 'Could not create the ticket. Please try again or email support@jobiest.com directly.' }, { status: 500 });
  }
}
