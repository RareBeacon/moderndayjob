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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
<tr><td style="height:6px;background:${BRAND.gold};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="height:3px;background:${BRAND.navy};font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
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
If you have any issues or enquiry, you can reach out to us at
<a href="mailto:${supportEmail}" style="color:#2B5BD7;">${supportEmail}</a>
</div>
<div style="padding-top:10px;font-size:12px;line-height:1.7;color:#8892A6;">
<strong style="color:${BRAND.navy};">Jobiest</strong> &middot; Your next opportunity is here.<br>
<a href="${SITE_URL}/terms" style="color:#8892A6;">Terms</a> &middot;
<a href="${SITE_URL}/privacy" style="color:#8892A6;">Privacy</a> &middot;
<a href="${SITE_URL}/help/getting-started" style="color:#8892A6;">Getting started guide</a>
</div>
</td></tr>`;
}

/** Subtle brand watermark at the very bottom of every email. */
export function emailWatermark(): string {
  return `<tr><td align="center" style="padding:26px 0 6px;">
<div style="font-size:22px;font-weight:bold;letter-spacing:8px;color:#D7DEEA;">JOBIEST</div>
<div style="padding-top:6px;font-size:11px;letter-spacing:2px;color:#D7DEEA;">YOUR NEXT OPPORTUNITY IS HERE</div>
</td></tr>`;
}

/** Assemble a full branded email from primitives. */
export function composeEmail(sections: string[], preheader: string): string {
  return emailDocument({
    preheader,
    body: [emailHeader(), ...sections, emailFooter(), emailWatermark()].join('\n'),
  });
}

/** Large monospace code display for legacy internal blocks if needed. */
export function emailCodeDisplay(code: string): string {
  return `<tr><td style="padding:4px 0 24px 120px;font-size:24px;font-weight:bold;line-height:1.3;color:#18181B;letter-spacing:1px;">${escapeHtmlEmail(code)}</td></tr>`;
}

/**
 * Mask a recipient email for the verification greeting in the exact
 * `ogu****yeopeyemiphilip@gmail.com` format (preserves prefix + suffix on
 * long local-parts while masking middle characters).
 */
export function maskEmailForVerificationGreeting(email: string): { plain: string; html: string } {
  const trimmed = email.trim();
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx <= 0 || atIdx === trimmed.length - 1) {
    const safe = escapeHtmlEmail(trimmed || 'your account');
    return { plain: trimmed || 'your account', html: safe };
  }
  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);

  let maskedLocal: string;
  if (local.length >= 8) {
    maskedLocal = `${local.slice(0, 3)}****${local.slice(7)}`;
  } else if (local.length >= 5) {
    maskedLocal = `${local.slice(0, 2)}****${local.slice(-1)}`;
  } else if (local.length >= 2) {
    maskedLocal = `${local.slice(0, 1)}****${local.slice(-1)}`;
  } else {
    maskedLocal = `${local}****`;
  }

  const plain = `${maskedLocal}@${domain}`;
  // Split '@' and '.' across inline spans so Gmail/iOS never auto-link only the
  // post-asterisk suffix into a broken mailto: link; keeps uniform bold blue.
  const safeDomainHtml = escapeHtmlEmail(domain).replace(/\./g, '<span>.</span>');
  const html = `${escapeHtmlEmail(maskedLocal)}<span>@</span>${safeDomainHtml}`;
  return { plain, html };
}

export interface VerificationCodeEmailTemplateInput {
  to: string;
  code: string;
  verifyUrl?: string;
  supportEmail?: string;
}

/**
 * Clean enterprise verification-code email template modeled on the
 * transactional OTP layout (top navigation bar + masked recipient greeting +
 * standalone contiguous 6-digit OTP for Gmail's native "Code Requested /
 * Copy code" extractor + security note + dashed sign-off + system footer).
 */
export function composeVerificationCodeEmail(input: VerificationCodeEmailTemplateInput): string {
  const supportEmail = input.supportEmail ?? 'support@jobiest.com';
  const masked = maskEmailForVerificationGreeting(input.to);
  const safeCode = escapeHtmlEmail(input.code.trim());
  const ctaLabel = input.verifyUrl ? 'Verify Account' : 'Dashboard';
  const ctaHref = escapeHtmlEmail(input.verifyUrl || `${SITE_URL}/dashboard`);
  const preheader = `Please enter the code to verify your account: ${input.code.trim()}`;

  const socialBadges = [
    { label: 'X', bg: '#14171A', href: 'https://x.com/Jobiest_ai', title: 'Jobiest on X' },
    { label: 'IG', bg: '#E1306C', href: 'https://www.instagram.com/jobiest_ai', title: 'Jobiest on Instagram' },
    { label: 'TT', bg: '#000000', href: 'https://www.tiktok.com/@jobiest', title: 'Jobiest on TikTok' },
    { label: 'WA', bg: '#1EBE5D', href: 'https://whatsapp.com/channel/0029VbE1oVxHVvTk2cnfdj2r', title: 'Jobiest WhatsApp Channel' },
    { label: '@', bg: '#F57C00', href: `mailto:${supportEmail}`, title: 'Email Jobiest Support' },
  ]
    .map(
      (b) =>
        `<td style="padding-right:8px;"><a href="${escapeHtmlEmail(b.href)}" title="${escapeHtmlEmail(b.title)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:12px;background:${b.bg};color:#FFFFFF;font-size:10px;font-weight:bold;text-align:center;text-decoration:none;">${escapeHtmlEmail(b.label)}</a></td>`,
    )
    .join('');

  const footerLinks = [
    { label: 'Getting Started', href: `${SITE_URL}/help/getting-started` },
    { label: 'How It Works', href: `${SITE_URL}/how-it-works` },
    { label: 'Free Tools', href: `${SITE_URL}/tools` },
    { label: 'Pricing', href: `${SITE_URL}/pricing` },
    { label: 'Help Center', href: `${SITE_URL}/help` },
    { label: 'Privacy Policy', href: `${SITE_URL}/privacy` },
    { label: 'Terms of Service', href: `${SITE_URL}/terms` },
  ]
    .map(
      (link) =>
        `<a href="${escapeHtmlEmail(link.href)}" target="_blank" rel="noopener noreferrer" style="color:#0052CC;text-decoration:underline;white-space:nowrap;">${escapeHtmlEmail(link.label)}</a>`,
    )
    .join(' <span style="color:#BFBFBF;padding:0 5px;">|</span> ');

  const verifyLinkBlock = input.verifyUrl
    ? `<tr><td style="padding:0 36px 22px;font-size:12.5px;line-height:1.65;color:#595959;">Or verify in one click: <a href="${escapeHtmlEmail(input.verifyUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0052CC;text-decoration:underline;word-break:break-all;">${escapeHtmlEmail(input.verifyUrl)}</a></td></tr>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Verification Code from Jobiest</title>
<style>
  @media only screen and (max-width: 560px) {
    .jb-nav-link { display: none !important; }
    .jb-body-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .jb-otp-pad { padding-left: 48px !important; padding-right: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#FFFFFF;${FONT}-webkit-text-size-adjust:100%;color:#333333;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtmlEmail(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;padding:16px 12px 28px;">
<tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;background:#FFFFFF;">
  <!-- Top Header Navigation Bar -->
  <tr>
    <td style="padding:12px 8px 14px;border-bottom:1px solid #EAEAEA;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="left" valign="middle" style="padding-right:12px;">
            <a href="${SITE_URL}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">
              <img src="${LOGO_URL}" width="135" height="36" alt="Jobiest" style="display:block;border:0;width:135px;height:36px;max-width:100%;">
            </a>
          </td>
          <td align="right" valign="middle" style="font-size:12px;line-height:1.4;white-space:nowrap;">
            <a class="jb-nav-link" href="${SITE_URL}/how-it-works" target="_blank" rel="noopener noreferrer" style="color:#18181B;font-weight:bold;text-decoration:none;padding:0 8px;">How It Works</a>
            <a class="jb-nav-link" href="${SITE_URL}/tools" target="_blank" rel="noopener noreferrer" style="color:#18181B;font-weight:bold;text-decoration:none;padding:0 8px;">Free Tools</a>
            <a class="jb-nav-link" href="${SITE_URL}/pricing" target="_blank" rel="noopener noreferrer" style="color:#18181B;font-weight:bold;text-decoration:none;padding:0 8px;">Pricing</a>
            <a class="jb-nav-link" href="${SITE_URL}/help" target="_blank" rel="noopener noreferrer" style="color:#18181B;font-weight:bold;text-decoration:none;padding:0 12px 0 8px;">Help</a>
            <a href="${ctaHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0064FF;color:#FFFFFF;font-size:12px;font-weight:bold;text-decoration:none;padding:7px 14px;border-radius:2px;">${escapeHtmlEmail(ctaLabel)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Greeting -->
  <tr>
    <td class="jb-body-pad" style="padding:40px 36px 22px;font-size:15px;line-height:1.6;color:#333333;">
      Dear <span style="color:#0052CC;font-weight:bold;text-decoration:none;">${masked.html}:</span>
    </td>
  </tr>

  <!-- Instruction -->
  <tr>
    <td class="jb-body-pad" style="padding:0 36px 18px;font-size:14px;line-height:1.6;color:#333333;">
      Please enter the code to verify your account.
    </td>
  </tr>

  <!-- Standalone Contiguous 6-Digit Verification Code -->
  <tr>
    <td class="jb-otp-pad" style="padding:2px 36px ${input.verifyUrl ? '24px' : '36px'} 160px;font-size:23px;font-weight:bold;line-height:1.35;color:#18181B;letter-spacing:0.5px;">
      ${safeCode}
    </td>
  </tr>

  ${verifyLinkBlock}

  <!-- Security Note -->
  <tr>
    <td class="jb-body-pad" style="padding:0 36px 26px;font-size:12px;line-height:1.9;color:#73777A;">
      <div style="font-weight:bold;color:#595959;padding-bottom:4px;">Note:</div>
      <div>This verification code expires in 10 minutes and can be used once. After your account is verified, you can manage your career profile, login email address, phone number, and security settings. If you did not request a verification code, please ignore this email or change your account password to prevent unauthorized access to your account.</div>
    </td>
  </tr>

  <!-- Brand Sign-Off + Dashed Divider -->
  <tr>
    <td class="jb-body-pad" style="padding:0 36px 10px;font-size:14px;line-height:1.5;color:#333333;">
      Jobiest
    </td>
  </tr>
  <tr>
    <td class="jb-body-pad" style="padding:0 36px;">
      <div style="border-top:1px dashed #D9D9D9;font-size:0;line-height:0;height:0;">&nbsp;</div>
    </td>
  </tr>
  <tr>
    <td class="jb-body-pad" style="padding:10px 36px 32px;font-size:12px;line-height:1.6;color:#8C8C8C;">
      Please do not reply directly to this email.
    </td>
  </tr>

  <!-- System Message Divider -->
  <tr>
    <td style="border-top:1px solid #EAEAEA;padding:10px 4px 14px;font-size:11px;line-height:1.6;color:#8C8C8C;">
      This is a system message and do not reply
    </td>
  </tr>

  <!-- Gray Footer Block -->
  <tr>
    <td style="background:#EFEFEF;padding:18px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="padding-bottom:12px;">
        <tr>
          <td valign="middle" style="padding-right:12px;font-size:12px;font-weight:bold;color:#18181B;">
            Follow Jobiest on
          </td>
          ${socialBadges}
        </tr>
      </table>
      <div style="font-size:11.5px;line-height:1.9;color:#0052CC;">
        ${footerLinks}
      </div>
      <div style="padding-top:10px;font-size:11px;line-height:1.6;color:#73777A;">
        If you have any issues or enquiry, you can reach out to us at
        <a href="mailto:${escapeHtmlEmail(supportEmail)}" style="color:#0052CC;text-decoration:underline;">${escapeHtmlEmail(supportEmail)}</a>
        &middot; &copy; ${new Date().getUTCFullYear()} JOBIEST
      </div>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
