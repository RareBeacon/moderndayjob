import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORT_SYSTEM_PROMPT, SUPPORT_PROMPT_VERSION } from '@/lib/support/agent';

const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
const tour = readFileSync(join(process.cwd(), 'components/home/ProductTour.tsx'), 'utf8');
const widget = readFileSync(join(process.cwd(), 'components/support/ChatWidget.tsx'), 'utf8');
const pricing = readFileSync(join(process.cwd(), 'lib/billing/pricing.ts'), 'utf8');

describe('Homepage: delegation-first positioning (owner verdict), truth-constrained', () => {
  it('leads with the agent promise and the loop', () => {
    expect(page).toContain('Your AI agent');
    expect(page).toContain('for the');
    expect(page).toContain('job search.');
    expect(page).toContain('You set the rules. Jobiest does the work.');
    for (const beat of ['Target', 'Tailor', 'Apply', 'Track']) expect(page).toContain(`<span>${beat}</span>`);
    expect(page).toContain('Delegate my job search');
  });

  it('claims delegation of the work, never unattended sends or job discovery', () => {
    expect(page).toContain('after your approval');
    expect(page).toContain('You review the results. It does the work.');
    // Discovery was retired 2026-09-20 (owner decision) and submission requires approval:
    // the homepage must not claim either.
    expect(page).not.toContain('finds roles');
    expect(page).not.toContain('searches continuously');
    expect(page).not.toContain('submits applications on your behalf');
    expect(page).toContain('an auto-submit mode is on the roadmap, not in production');
  });

  it('tells the user they bring the jobs, honestly', () => {
    expect(page).toContain('Drop in the jobs you want');
    expect(page).toContain('Paste links to the roles you care about');
    expect(tour).toContain('Jobiest does not run a job board. You choose the roles; the agent does the work.');
  });

  it('embeds the video case study with an honest label and poster fallback', () => {
    expect(page).toContain('/videos/jobiest-case-study.mp4');
    expect(page).toContain('poster="/images/case-5-morning.jpg"');
    expect(page).toContain('Illustrative demo of the Jobiest workflow.');
  });

  it('uses engagement photos in the case study and how-it-works sections', () => {
    expect(page).toContain('/images/life-sofa.jpg');
    expect(page).toContain('/images/life-cafe.jpg');
  });

  it('keeps the truthful pricing language: limits, run definition, tool reality', () => {
    expect(page).toContain('What the limits mean');
    expect(page).toContain('3 in total on Free (lifetime)');
    expect(page).toContain('the ATS scanner is rule-based, the other nine are AI-powered');
    expect(page).toContain('2 runs in total (lifetime)');
    expect(page).toContain('after your approval');
    for (const code of ['BASIC', 'PREMIUM', 'MAX']) {
      const card = page.split(`  ${code}: {`)[1]?.split('},')[0] ?? '';
      expect(card).toContain('approved by you');
    }
  });

  it('pricing source of truth no longer advertises the retired match scoring', () => {
    expect(pricing).not.toContain('match scoring');
    expect(pricing).toContain('Paste any job link for agent analysis');
  });

  it('shows the end-to-end product tour with sample-data labels', () => {
    expect(page).toContain('<ProductTour />');
    for (const label of ['Your criteria', 'Bring the jobs', 'Tailored documents', 'Your approval', 'Morning tracker']) {
      expect(tour).toContain(label);
    }
    expect(tour).toContain('Real interface · sample data');
    expect(tour).toContain('Sample data throughout');
    expect(tour).toContain('expire after 24 hours');
  });

  it('trust section states verified safeguards without overclaiming', () => {
    expect(page).toContain('A truthfulness check runs server-side before any submission');
    expect(page).toContain('never sold');
    expect(page).toContain('Export your documents as PDF or Word anytime');
    expect(page).not.toContain('encrypted storage');
    expect(page).not.toContain('delete everything');
  });

  it('has a single skip link and the full section flow in order', () => {
    expect(page.match(/Skip to content/g)?.length).toBe(1);
    const order = ['id="case-study"', 'id="how-it-works"', 'id="product"', 'id="trust"', 'id="pricing"', 'id="tools"', 'COME SAY HELLO', 'id="questions"'].map((s) => page.indexOf(s));
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
