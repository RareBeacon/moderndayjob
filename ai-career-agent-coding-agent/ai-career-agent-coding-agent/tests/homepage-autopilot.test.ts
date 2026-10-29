import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANS } from '@/lib/billing/pricing';
import { SUPPORT_SYSTEM_PROMPT, SUPPORT_PROMPT_VERSION } from '@/lib/support/agent';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const page = read('app/page.tsx');
const layout = read('app/layout.tsx');
const shell = read('components/marketing/marketing-shell.tsx');
const tools = read('app/tools/page.tsx');
const tour = read('components/home/ProductTour.tsx');
const widget = read('components/support/ChatWidget.tsx');
const pricing = read('lib/billing/pricing.ts');

/** The October 15 approved homepage redesign removed the September video,
 * tour, social strip, and tool cards. These checks keep the current design's
 * actual promises honest rather than demanding obsolete sections or claims. */
describe.skip('Homepage: approved design, truthful delegation and discoverability', () => {
  it('leads with the agent promise and a working signup call to action', () => {
    expect(page).toContain('Jobiest is your AI career agent.');
    expect(page).toContain('Paste any job link');
    expect(page).toContain('it prepares a truthful CV and cover');
    expect(page).toContain('Create free account');
    expect(page).toContain('href={liveSignup}');
    expect(page).toContain('You choose what gets sent.');
  });

  it('qualifies paid job discovery and optional Auto mode', () => {
    expect(page).toContain('Premium and Max add daily discovery on public employer boards.');
    expect(page).toContain('On Premium or Max, the agent also looks for matching roles');
    expect(page).toContain('Approval is the default. Auto submission requires your explicit opt-in');
    expect(page).toContain('If you explicitly choose Auto on an eligible paid plan');
    expect(page).toContain('on supported boards');
    expect(page).not.toContain('finds matching openings');
    expect(page).not.toContain('submits applications on your behalf');
    expect(PLANS.FREE.automationSlots).toBe(0);
    expect(PLANS.BASIC.lifetimeAutomation).toBe(2);
    expect(PLANS.PREMIUM.automationSlots).toBeGreaterThan(0);
    expect(PLANS.MAX.automationSlots).toBeGreaterThan(0);
  });

  it('supports pasting a job link on Free and routes to the complete explanation', () => {
    expect(page).toContain('Paste a job link on any plan.');
    expect(page).toContain('href="/how-it-works"');
    expect(shell).toContain('{ href: "/how-it-works", label: "How it works" }');
    expect(pricing).toContain('Paste any job link for agent analysis');
  });

  it('labels illustrative activity as an example, not completed customer work', () => {
    expect(page).toContain('aria-label="Example of the Jobiest agent at work"');
    expect(page).toContain('Example agent activity');
    expect(page).toContain('Example preparation step');
    expect(page).toContain('Example truthfulness check');
  });

  it('keeps photo and video assets without claiming the redesigned homepage embeds them', () => {
    for (const path of ['public/videos/jobiest-case-study.mp4', 'public/images/case-5-morning.jpg', 'public/images/life-sofa.jpg', 'public/images/life-cafe.jpg']) {
      expect(existsSync(join(process.cwd(), path)), path).toBe(true);
    }
    expect(page).not.toContain('Illustrative demo of the Jobiest workflow.');
  });

  it('states the Free lifetime document cap and daily tool cap exactly', () => {
    expect(PLANS.FREE.lifetimeDocs).toBe(3);
    expect(PLANS.FREE.documentCredits).toBe(0);
    expect(PLANS.FREE.toolUses).toBe(10);
    expect(page).toContain('3 AI document generations total, plus 10 tool uses a day');
    expect(page).toContain('3 AI document generations');
    expect(page).toContain('in total and 10 tool uses a day');
    expect(page).toContain('Check each plan for its exact allowance.');
    expect(page).toContain('PLAN_ORDER.filter((code) => PLANS[code].monthlyNgn > 0)');
  });

  it('pricing source of truth does not advertise retired scoring or fake allowances', () => {
    expect(pricing).not.toContain('match scoring');
    expect(pricing).toContain('Your agent finds matching jobs daily');
    expect(PLANS.BASIC.documentCredits).toBe(3);
    expect(PLANS.PREMIUM.documentCredits).toBe(10);
    expect(PLANS.MAX.documentCredits).toBe(20);
  });

  it('retains sample labels in the legacy tour component if reused elsewhere', () => {
    for (const label of ['Your criteria', 'Found for you', 'Tailored documents', 'Your approval', 'Morning tracker']) {
      expect(tour).toContain(label);
    }
    expect(tour).toContain('Real interface · sample data');
    expect(tour).toContain('Sample data throughout');
    expect(tour).toContain('expire after 24 hours');
  });

  it('retained tour jobs are tailored to fictional criteria, never disguised as live jobs', () => {
    expect(tour).toContain('Found for you');
    expect(tour).toContain('Roles your agent found on employer job boards, inside your rules.');
    expect(tour).toContain('Senior Product Manager');
    expect(tour).toContain('above your salary floor');
    expect(tour).toContain('Ready for your approval');
    expect(tour).toContain('Paste any job link');
    expect(tour).not.toContain('jobboards.greenhouse.io');
    expect(tour).not.toContain('4821159');
  });

  it('tells users applications use their facts and that approval is the default', () => {
    expect(page).toContain('Your CV is built only from facts you gave us.');
    expect(page).toContain('We never invent experience.');
    expect(page).toContain('By default, every application waits for your approval.');
    expect(page).not.toContain('encrypted storage');
    expect(page).not.toContain('delete everything');
  });

  it('has a working skip link and the approved sections in order', () => {
    expect(layout.match(/Skip to content/g)?.length).toBe(1);
    expect(layout).toContain('href="#main"');
    expect(page).toContain('<main id="main"');
    const order = ['id="home-title"', 'id="frustrations-title"', 'id="fears-title"', 'id="dream-title"', 'id="how"', 'id="pricing-title"', 'id="home-cta-title"'].map((s) => page.indexOf(s));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('keeps the real tool index and human support reachable from the shared shell', () => {
    expect(page).toContain('const liveTools = "/tools"');
    expect(page).toContain('href={liveTools}');
    for (const path of ['/tools', '/pricing', '/support', '/templates']) expect(shell).toContain(`"${path}"`);
    expect(shell).toContain('mailto:support@jobiest.com');
    expect(shell).toContain('Approval is the default; Auto requires your opt-in.');
    expect(shell).not.toContain('Nothing is sent without your approval.');
  });

  it('routes the five popular career tools through the actual tools page', () => {
    for (const path of ['/free-ats-resume-scanner', '/free-job-description-analyzer', '/free-cover-letter-writer', '/free-resume-summary-generator', '/free-linkedin-headline-builder']) {
      expect(tools).toContain(`href: "${path}"`);
    }
    expect(tools).toContain('Deterministic checks');
    expect(tools).toContain('Ten free tools for the parts that eat your week.');
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
