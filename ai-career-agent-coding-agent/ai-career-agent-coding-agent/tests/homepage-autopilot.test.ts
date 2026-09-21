import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORT_SYSTEM_PROMPT, SUPPORT_PROMPT_VERSION } from '@/lib/support/agent';

const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
const tour = readFileSync(join(process.cwd(), 'components/home/ProductTour.tsx'), 'utf8');
const widget = readFileSync(join(process.cwd(), 'components/support/ChatWidget.tsx'), 'utf8');

describe('Homepage: honest overnight positioning (critique fixes 01, 03, 04)', () => {
  it('promises preparation plus approval, never unattended submission', () => {
    expect(page).toContain('Wake up to applications,');
    expect(page).toContain('ready to send.');
    expect(page).toContain('Nothing is submitted until you approve it.');
    // The contradiction is gone: no plan card claims automatic sends
    expect(page).not.toContain('submits applications on your terms');
    for (const code of ['FREE', 'BASIC', 'PREMIUM', 'MAX']) {
      const card = page.split(`  ${code}: {`)[1]?.split('},')[0] ?? '';
      if (code !== 'FREE') expect(card).toContain('approved by you');
    }
  });

  it('names the supported platforms and what happens when it cannot apply', () => {
    expect(page).toContain('Where the agent can apply');
    expect(page).toContain('Greenhouse and Lever');
    expect(page).toContain('CAPTCHA, login or assessment');
    expect(page).toContain('never auto-retried');
  });

  it('explains every pricing limit and its reset window', () => {
    expect(page).toContain('What the limits mean');
    expect(page).toContain('3 in total on Free (lifetime)');
    expect(page).toContain('refreshed daily on paid plans');
    expect(page).toContain('2 trial runs in total on Basic');
    expect(page).toContain('Unlimited tools never means unlimited AI generations');
    expect(page).toContain('every one waits for your approval');
  });

  it('shows the end-to-end product tour with sample-data labels', () => {
    expect(page).toContain('<ProductTour />');
    for (const label of ['Your preferences', 'Overnight matches', 'Tailored documents', 'Your approval', 'Morning tracker']) {
      expect(tour).toContain(label);
    }
    expect(tour).toContain('Real interface · sample data');
    expect(tour).toContain('Sample data throughout');
    expect(tour).toContain('Approve send');
    expect(tour).toContain('expire after 24 hours');
  });

  it('keeps the timeline honest: the user approves in the morning', () => {
    expect(page).toContain('You approve, it sends');
    expect(page).toContain('Illustrative walkthrough of an overnight run.');
  });

  it('has a single skip link and the full section flow in order', () => {
    expect(page.match(/Skip to content/g)?.length).toBe(1);
    const order = ['id="product"', 'WHY JOBIEST EXISTS', 'id="how-it-works"', 'id="trust"', 'id="pricing"', 'id="tools"', 'COME SAY HELLO', 'id="questions"'].map((s) => page.indexOf(s));
    expect(order.every((v) => v >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('Homepage: required user format still intact', () => {
  it('links all four social accounts', () => {
    for (const url of ['https://www.instagram.com/jobiest_ai', 'https://www.tiktok.com/@jobiest', 'https://whatsapp.com/channel/0029VbE1oVxHVvTk2cnfdj2r', 'https://x.com/Jobiest_ai']) {
      expect(page).toContain(url);
    }
  });

  it('shows the five most-used free tools and a see-all button', () => {
    const toolHrefs = ['/free-ats-resume-scanner', '/free-job-description-analyzer', '/free-cover-letter-writer', '/free-resume-summary-generator', '/free-linkedin-headline-builder'];
    for (const href of toolHrefs) expect(page).toContain(`href: '${href}'`);
    expect(page).toContain('href="/tools"');
    expect(page).toContain('See all free tools');
  });

  it('keeps the case study photo and five timeline bullets', () => {
    expect(page).toContain('/images/overnight-run.jpg');
    expect(page.match(/time: '/g)?.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Support presents as live human support (user directive)', () => {
  it('never brands the widget as an AI assistant to visitors', () => {
    expect(widget).not.toContain('AI assistant');
    expect(widget).not.toContain('support assistant');
    expect(widget).toContain('Jobiest Support');
    expect(widget).toContain('Online now');
    expect(widget).toContain('Tobi is typing');
  });

  it('prompt v2 carries the human voice rules while keeping every safety rule', () => {
    expect(SUPPORT_PROMPT_VERSION).toBe(2);
    expect(SUPPORT_SYSTEM_PROMPT).toContain('Tobi');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('Never say or imply that you are an AI');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('NEVER claim you performed an action');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('ONLY from the provided knowledge base');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('UNTRUSTED data');
  });
});
