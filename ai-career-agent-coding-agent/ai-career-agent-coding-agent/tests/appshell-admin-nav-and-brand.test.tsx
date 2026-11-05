import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppShell } from '../components/site/AppShell';
import { Logo } from '../components/site/Logo';

(globalThis as unknown as { React: typeof React }).React = React;

describe('AppShell, Admin Nav & Unified Brand Identity', () => {
  it('renders AppShell with dashboard-shell styling and dark-variant product logo', () => {
    const html = renderToStaticMarkup(
      <AppShell active="profile" title="Career profile" userName="Philip">
        <div>Profile content</div>
      </AppShell>
    );

    // Must always apply dashboard-shell class for cohesive navy sidebar
    expect(html).toContain('dashboard-shell');
    expect(html).toContain('app-sidebar');

    // Logo inside AppShell sidebar must use dark variant (white text + lime crescent on navy)
    expect(html).toContain('logo-wordmark-dark.png');
    expect(html).toContain('alt="Jobiest"');

    // User chip in top bar
    expect(html).toContain('app-user-chip');
    expect(html).toContain('Philip');
  });

  it('renders Admin Control Centre slot when isAdmin is passed', () => {
    const html = renderToStaticMarkup(
      <AppShell active="dashboard" title="Workspace" userName="Philip" isAdmin={true}>
        <div>Workspace content</div>
      </AppShell>
    );

    expect(html).toContain('Admin Control Centre');
    expect(html).toContain('href="/admin"');
  });

  it('renders standard navigation groups without crashing when isAdmin is false or omitted', () => {
    const html = renderToStaticMarkup(
      <AppShell active="documents" title="Saved documents">
        <div>Documents</div>
      </AppShell>
    );

    expect(html).toContain('Search &amp; Apply');
    expect(html).toContain('Your Foundation');
    expect(html).toContain('Account');
    expect(html).toContain('Recruiter Hub');
  });

  it('Logo component renders dark and light assets correctly with proper dimensions', () => {
    const lightHtml = renderToStaticMarkup(<Logo variant="light" size={28} />);
    const darkHtml = renderToStaticMarkup(<Logo variant="dark" size={28} />);

    expect(lightHtml).toContain('logo-wordmark-light.png');
    expect(darkHtml).toContain('logo-wordmark-dark.png');
  });
});
