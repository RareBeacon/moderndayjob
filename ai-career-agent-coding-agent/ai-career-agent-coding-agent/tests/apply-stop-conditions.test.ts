import { describe, it, expect } from 'vitest';
import { detectStopConditions, messageForStop, type StopSignals } from '../lib/apply/stop-conditions';

const base: StopSignals = {
  html: '',
  url: 'https://boards.greenhouse.io/acme/jobs/1',
  hasPasswordField: false,
  hasFileInput: true,
  hasSubmitButton: true,
};

const withHtml = (html: string, over: Partial<StopSignals> = {}): StopSignals => ({ ...base, html, ...over });

describe('detectStopConditions', () => {
  it('is empty for a clean supported form', () => {
    expect(detectStopConditions(withHtml('<form><input type="file"/><button type="submit">Apply</button></form>'))).toEqual([]);
  });

  it('detects CAPTCHA', () => {
    const codes = detectStopConditions(withHtml('<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>'));
    expect(codes).toContain('CAPTCHA');
  });

  it('detects anti-bot blocks', () => {
    expect(detectStopConditions(withHtml('<h1>Access Denied</h1>'))).toContain('ANTI_BOT');
    expect(detectStopConditions(withHtml('<p>Please enable JavaScript and cookies to continue.</p>'))).toContain('ANTI_BOT');
  });

  it('detects a sign-in challenge', () => {
    const codes = detectStopConditions(withHtml('<h1>Sign in</h1><form><input type="password"/></form>', { hasPasswordField: true }));
    expect(codes).toContain('AUTH_CHALLENGE');
  });

  it('detects an unsupported form (no file input, no submit)', () => {
    const codes = detectStopConditions(withHtml('<p>no form here</p>', { hasFileInput: false, hasSubmitButton: false }));
    expect(codes).toContain('UNSUPPORTED_FORM');
  });
});

describe('messageForStop', () => {
  it('returns a human message for every code', () => {
    for (const code of ['CAPTCHA', 'ANTI_BOT', 'AUTH_CHALLENGE', 'UNSUPPORTED_FORM', 'UNSUPPORTED_PLATFORM', 'MISSING_INFO', 'TRUTHFULNESS_ISSUE', 'POLICY_RESTRICTED', 'SUBMIT_UNCLEAR'] as const) {
      expect(messageForStop(code).length).toBeGreaterThan(10);
    }
  });
});
