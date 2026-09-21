import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORT_SYSTEM_PROMPT, SUPPORT_PROMPT_VERSION } from '@/lib/support/agent';

const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
const widget = readFileSync(join(process.cwd(), 'components/support/ChatWidget.tsx'), 'utf8');

describe('Autopilot homepage structure (user format)', () => {
  it('leads with the sleep headline and subheadline', () => {
    expect(page).toContain('Apply for jobs');
    expect(page).toContain('sleep.');
    expect(page).toContain('while you sleep. Start free, no card needed.');
  });

  it('has the hook band and the case study section with photo, video-style demo and bullets', () => {
    expect(page).toContain("styles['hook-band']");
    expect(page).toContain('id="case-study"');
    expect(page).toContain('/images/overnight-run.jpg');
    expect(page).toContain('night-report');
    expect(page.match(/time: '/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('shows pricing, the five most important free tools and a see-all button', () => {
    expect(page).toContain('id="pricing"');
    const toolHrefs = ['/free-ats-resume-scanner', '/free-job-description-analyzer', '/free-cover-letter-writer', '/free-resume-summary-generator', '/free-linkedin-headline-builder'];
    for (const href of toolHrefs) expect(page).toContain(`href: '${href}'`);
    expect(page.match(/tools\.map/)).toBeTruthy();
    expect(page).toContain('href="/tools"');
    expect(page).toContain('See all free tools');
  });

  it('has the what-makes-jobiest-unique section with four differentiators', () => {
    expect(page).toContain('id="why-jobiest"');
    expect(page.match(/uniques\.map/)).toBeTruthy();
  });

  it('links all four social accounts', () => {
    for (const url of ['https://www.instagram.com/jobiest_ai', 'https://www.tiktok.com/@jobiest', 'https://whatsapp.com/channel/0029VbE1oVxHVvTk2cnfdj2r', 'https://x.com/Jobiest_ai']) {
      expect(page).toContain(url);
    }
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
