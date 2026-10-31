import React from 'react';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DashboardViewProps } from '@/components/dashboard/DashboardView';

(globalThis as unknown as { React: typeof React }).React = React;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

let DashboardViewComp: typeof import('@/components/dashboard/DashboardView').DashboardView;
let AppShellComp: typeof import('@/components/site/AppShell').AppShell;

beforeAll(async () => {
  const dashMod = await import('@/components/dashboard/DashboardView');
  const shellMod = await import('@/components/site/AppShell');
  DashboardViewComp = dashMod.DashboardView;
  AppShellComp = shellMod.AppShell;
});

function makeDashboardProps(overrides: Partial<DashboardViewProps> = {}): DashboardViewProps {
  return {
    greeting: 'Good morning',
    firstName: 'Adaora',
    autoMode: false,
    planLabel: 'FREE',
    quotaLine: '3 of 3 free tailored documents left',
    profilePercent: 60,
    profileNextSteps: ['Add target roles', 'Upload a master CV'],
    stats: { applications: 0, interviews: 0, responseRate: 0 },
    pipeline: { prepared: 0, checking: 0, sent: 0, interviews: 0 },
    drafts: [],
    allowances: {
      documents: { left: 3, max: 3, note: '3 of 3 free tailored documents left' },
      autoApply: {
        left: 0,
        max: 0,
        locked: true,
        note: 'Unlock 5 free runs/month with a zero-charge card check, or upgrade anytime.',
      },
    },
    autoSubmit: {
      initialMode: 'approval',
      planIncludesAutomation: false,
      sendingLive: false,
    },
    boardLinks: [{ url: 'https://boards.greenhouse.io/example', boardLabel: 'Greenhouse', role: 'Frontend Engineer' }],
    suggestions: [{ text: 'Complete your career profile (60% ready) for stronger role tailoring.', href: '/profile' }],
    setup: { needsSetup: false, required: false },
    careerHeadline: 'Senior Frontend Engineer',
    ...overrides,
  };
}

describe('Homepage copy update with preserved UI/UX structure', () => {
  const home = readFileSync('app/HomeClient.tsx', 'utf8');

  it('preserves all homepage layout sections and CSS class hooks intact', () => {
    for (const cls of [
      'site-shell',
      'site-header',
      'hero',
      'approval-card',
      'story-section reality',
      'story-section reality-editorial',
      'story-section solution',
      'story-section truth',
      'story-section how',
      'steps-section',
      'pricing-section',
      'bottom-cta',
    ]) {
      expect(home).toContain(cls);
    }
    expect(home).toContain('Create free account');
  });

  it('eliminates bare Unlimited claims (Owner Decision D1) and wires real product links', () => {
    expect(home).not.toContain('Unlimited applications');
    expect(home).not.toContain('© 2025');
    expect(home).toContain('© 2026 Jobiest');
    expect(home).toContain('href="/tools"');
    expect(home).toContain('href="/blog"');
    expect(home).toContain('href="/about"');
  });
});

describe('Dashboard UI/UX and human-centred copy', () => {
  it('greets new users with a 3-step getting-started guide instead of empty zero counters', () => {
    const html = renderToStaticMarkup(<DashboardViewComp {...makeDashboardProps()} />);
    expect(html).toContain('Good morning, Adaora.');
    expect(html).toContain('Prepare a tailored application');
    expect(html).toContain('Prepare your first tailored application in 3 steps');
    expect(html).toContain('Add target roles');
    expect(html).toContain('Upload a master CV');
    expect(html).not.toContain('Application progress');
    expect(html).not.toContain('Command deck');
    expect(html).not.toContain('Checking send');
  });

  it('renders plain-English progress stages and direct draft review links for active users', () => {
    const html = renderToStaticMarkup(
      <DashboardViewComp
        {...makeDashboardProps({
          stats: { applications: 5, interviews: 1, responseRate: 25 },
          pipeline: { prepared: 2, checking: 1, sent: 3, interviews: 1 },
          drafts: [{ id: 'app-42', role: 'Staff Product Designer', company: 'Paystack' }],
        })}
      />,
    );
    expect(html).toContain('Application progress');
    expect(html).toContain('Ready to review');
    expect(html).toContain('Submitted');
    expect(html).toContain('1 confirming delivery');
    expect(html).toContain('Interviews');
    expect(html).toContain('Total tracked');
    expect(html).toContain('Staff Product Designer');
    expect(html).toContain('/applications?open=app-42');
  });

  it('uses clear human navigation labels in AppShell while keeping Sign out intact', () => {
    const html = renderToStaticMarkup(
      <AppShellComp active="dashboard" title="Workspace">
        <div>Inner</div>
      </AppShellComp>,
    );
    expect(html).toContain('Workspace');
    expect(html).toContain('Resume Studio');
    expect(html).toContain('Career profile');
    expect(html).toContain('Sign out');
  });
});
