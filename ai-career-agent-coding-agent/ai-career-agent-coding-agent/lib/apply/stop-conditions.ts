import type { StopCode } from './types';

/**
 * Stop-condition engine (pure, deterministic). Given signals read from the
 * page, decide which safety stops apply. Order matters: a CAPTCHA is reported
 * before a generic anti-bot block, etc. Nothing is ever auto-submitted through
 * any of these.
 */

export interface StopSignals {
  html: string;
  url: string;
  hasPasswordField: boolean;
  hasFileInput: boolean;
  hasSubmitButton: boolean;
}

export function detectStopConditions(s: StopSignals): StopCode[] {
  const codes: StopCode[] = [];
  const html = s.html.toLowerCase();

  if (
    /(recaptcha|hcaptcha|captcha|cloudflare|challenge-platform|are you (a )?robot|verify you are (a )?human|press and hold|human verification)/.test(html)
  ) {
    codes.push('CAPTCHA');
  }
  if (
    /(access denied|request blocked|too many requests|perimeterx|datadome|incapsula|akamai|rate limited|enable javascript and cookies|security check|denied by|403 forbidden)/.test(html)
  ) {
    codes.push('ANTI_BOT');
  }
  if (s.hasPasswordField && /(sign in|log in|log in to|login|create (an? )?account|verify your (email|account)|two-?factor|password)/.test(html)) {
    codes.push('AUTH_CHALLENGE');
  }
  if (!s.hasFileInput && !s.hasSubmitButton) {
    codes.push('UNSUPPORTED_FORM');
  }
  return codes;
}

export function messageForStop(code: StopCode): string {
  switch (code) {
    case 'CAPTCHA':
      return 'The employer shows a CAPTCHA or human check. We never bypass these — please complete it yourself.';
    case 'ANTI_BOT':
      return 'The employer blocked automated access. Please apply directly from the job link.';
    case 'AUTH_CHALLENGE':
      return 'The employer requires a sign-in to apply. Please log in and submit yourself.';
    case 'UNSUPPORTED_FORM':
      return 'This application form is not one we can fill safely. Apply directly from the job link.';
    case 'UNSUPPORTED_PLATFORM':
      return 'This employer platform is not supported for automatic submission yet.';
    case 'MISSING_INFO':
      return 'Some required details are missing from your profile. Add them and try again.';
    case 'TRUTHFULNESS_ISSUE':
      return 'Your generated documents did not pass truthfulness checks. Regenerate them first.';
    case 'POLICY_RESTRICTED':
      return 'Automatic submission is disabled by policy right now.';
    case 'SUBMIT_UNCLEAR':
      return 'We could not confirm the final submit button, so nothing was sent.';
  }
}
