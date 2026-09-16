import { SITE_URL } from '@/lib/site';

/**
 * Jobiest branded transactional email design system.
 *
 * Email-safe HTML: tables for structure, inline styles, 600px max width,
 * no flexbox/grid, no webfonts, no SVG (logo is PNG), bulletproof CTA
 * buttons (table + bgcolor), readable at 320px, tested palette from the
 * product brand (navy #111C35, gold #F8D64D, ink on white).
 *
 * Every template composes from these primitives so verification, welcome,
 * password reset, security and support emails all look like one product.
 */

export const BRAND = {
  navy: '#111C35',
  navySoft: '#1B2A4A',
  gold: '#F8D64D',
  goldDark: '#B98F0B',
  ink: '#1A2233',
  muted: '#5A6579',
  line: '#E4E8F0',
  cardBg: '#F6F8FC',
  alertBg: '#FFF6DE',
  alertLine: '#E7CE7B',
  white: '#FFFFFF',
};

const LOGO_URL = `${SITE_URL}/images/email-logo.png`;
const FONT = `font-family:Arial,Helvetica,'Helvetica Neue',sans-serif;`;

export function escapeHtmlEmail(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Outer document: preheader, centered card, 600px, responsive down to 320px. */
export function emailDocument(opts: { preheader: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Jobiest</title>
</head>
<body style="margin:0;padding:0;background:#EDF1F8;${FONT}-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtmlEmail(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDF1F8;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
${opts.body}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Branded header with the Jobiest logo (PNG, HTTPS, alt text). */
export function emailHeader(): string {
  return `<tr><td style="padding:0 0 20px;">
<a href="${SITE_URL}" style="text-decoration:none;">
<img src="${LOGO_URL}" width="180" height="48" alt="Jobiest" style="display:block;border:0;width:180px;height:48px;max-width:100%;">
</a>
</td></tr>`;
}

export function emailHero(text: string): string {
  return `<tr><td style="padding:0 0 18px;">
<div style="display:inline-block;background:${BRAND.navy};color:${BRAND.gold};padding:6px 12px;border-radius:8px;font-size:12px;font-weight:bold;letter-spacing:1.5px;">${escapeHtmlEmail(text.toUpperCase())}</div>
</td></tr>`;
}

export function emailHeading(text: string): string {
  return `<tr><td style="padding:0 0 14px;font-size:25px;font-weight:bold;color:${BRAND.ink};line-height:1.25;">${escapeHtmlEmail(text)}</td></tr>`;
}

export function emailParagraph(text: string, opts: { muted?: boolean } = {}): string {
  const color = opts.muted ? BRAND.muted : '#333D52';
  return `<tr><td style="padding:0 0 14px;font-size:15px;line-height:1.65;color:${color};">${text}</td></tr>`;
}

/** Bulletproof CTA button (works without CSS support). */
export function emailButton(label: string, url: string): string {
  return `<tr><td style="padding:6px 0 22px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:${BRAND.gold};border-radius:10px;">
<a href="${escapeHtmlEmail(url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:bold;color:${BRAND.navy};text-decoration:none;border-radius:10px;">${escapeHtmlEmail(label)}</a>
</td>
</tr></table>
</td></tr>`;
}

/** Secondary link line for the CTA (email clients strip buttons sometimes). */
export function emailButtonLinkHint(url: string): string {
  return `<tr><td style="padding:0 0 18px;font-size:13px;line-height:1.6;color:${BRAND.muted};">
Or paste this link into your browser:<br>
<a href="${escapeHtmlEmail(url)}" style="color:#2B5BD7;word-break:break-all;">${escapeHtmlEmail(url)}</a>
</td></tr>`;
}

export function emailInfoCard(title: string, lines: string[]): string {
  const rows = lines
    .map((l) => `<div style="padding:5px 0;font-size:14px;line-height:1.55;color:#333D52;">${l}</div>`)
    .join('');
  return `<tr><td style="padding:0 0 18px;">
<div style="background:${BRAND.cardBg};border:1px solid ${BRAND.line};border-radius:12px;padding:16px 18px;">
${title ? `<div style="font-size:13px;font-weight:bold;color:${BRAND.ink};padding-bottom:6px;">${escapeHtmlEmail(title)}</div>` : ''}
${rows}
</div>
</td></tr>`;
}

export function emailAlert(text: string): string {
  return `<tr><td style="padding:0 0 18px;">
<div style="background:${BRAND.alertBg};border:1px solid ${BRAND.alertLine};border-left:4px solid ${BRAND.goldDark};border-radius:10px;padding:12px 16px;font-size:13.5px;line-height:1.55;color:#4A3F14;">${text}</div>
</td></tr>`;
}

/** Footer: support contact, legal links, brand sign-off. */
export function emailFooter(supportEmail = 'support@jobiest.com'): string {
  return `<tr><td style="padding:22px 0 8px;border-top:1px solid ${BRAND.line};">
<div style="font-size:13px;line-height:1.6;color:${BRAND.muted};">
Need help? Write to <a href="mailto:${supportEmail}" style="color:#2B5BD7;">${supportEmail}</a> and a real person will reply.
</div>
<div style="padding-top:10px;font-size:12px;line-height:1.7;color:#8892A6;">
<strong style="color:${BRAND.navy};">Jobiest</strong> &middot; Your next opportunity is here.<br>
<a href="${SITE_URL}/terms" style="color:#8892A6;">Terms</a> &middot;
<a href="${SITE_URL}/privacy" style="color:#8892A6;">Privacy</a> &middot;
<a href="${SITE_URL}/help/getting-started" style="color:#8892A6;">Getting started guide</a>
</div>
</td></tr>`;
}

/** Assemble a full branded email from primitives. */
export function composeEmail(sections: string[], preheader: string): string {
  return emailDocument({
    preheader,
    body: [emailHeader(), ...sections, emailFooter()].join('\n'),
  });
}

/** Large monospace code display for the google sign-up verification gate. */
export function emailCodeDisplay(code: string): string {
  const digits = code
    .split('')
    .map(
      (d) =>
        `<td style="background:${BRAND.navy};color:${BRAND.gold};font-size:26px;font-weight:bold;width:44px;height:54px;text-align:center;vertical-align:middle;border-radius:8px;">${escapeHtmlEmail(d)}</td><td style="width:6px;">&nbsp;</td>`,
    )
    .join('');
  return `<tr><td style="padding:4px 0 20px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
</td></tr>`;
}
