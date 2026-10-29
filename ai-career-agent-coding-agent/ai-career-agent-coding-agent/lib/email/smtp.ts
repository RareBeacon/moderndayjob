import nodemailer from 'nodemailer';

type SendArgs = { to: string; subject: string; html: string; text?: string; from?: string; replyTo?: string };

const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASSWORD?.trim();
const EMAIL_FROM = process.env.EMAIL_FROM?.trim() || 'Jobiest <notifications@jobiest.com>';
const SMTP_ENABLED = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transport: any = null;

function smtpTransport() {
  if (!SMTP_ENABLED) return null;
  if (transport) return transport;
  transport = (nodemailer as any).createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER!, pass: SMTP_PASS! },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
  });
  return transport;
}

export async function sendViaSmtp(input: SendArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  const tx = smtpTransport();
  if (!tx) return { ok: false, error: 'SMTP_NOT_CONFIGURED' };
  try {
    await tx.verify().catch(()=>{});
    const info = await tx.sendMail({
      from: input.from ?? EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      headers: { 'X-Jobiest-Mail': 'true' },
    });
    return { ok: true, id: info.messageId };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
export function isSmtpConfigured(): boolean { return SMTP_ENABLED; }
