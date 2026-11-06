import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminFallbackView, AdminForbidden, AdminShell } from '@/components/site/AdminShell';
import AdminLoading from '@/app/admin/loading';
import AdminError from '@/app/admin/error';

describe('Admin route resilience, loading skeletons, and error boundaries', () => {
  it('renders AdminForbidden with product logo, branded header, and workspace return link', () => {
    const html = renderToString(<AdminForbidden />);
    expect(html).toContain('Admin Access Required');
    expect(html).toContain('Restricted Access');
    expect(html).toContain('Return to your Workspace');
    expect(html).toContain('/dashboard');
    expect(html).toContain('ad-header');
    expect(html).toContain('ad-tag');
  });

  it('renders AdminShell with active tab and valid subnav links', () => {
    const html = renderToString(
      <AdminShell active="overview">
        <div id="test-content">Control Centre Operational</div>
      </AdminShell>,
    );
    expect(html).toContain('Control Centre Operational');
    expect(html).toContain('ad-subnav');
    expect(html).toContain('Opportunity Radar');
    expect(html).toContain('Founding &amp; Partners CRM');
  });

  it('renders AdminFallbackView when live query degradation occurs', () => {
    const html = renderToString(<AdminFallbackView error="Test query timeout" />);
    expect(html).toContain('Diagnostic Mode');
    expect(html).toContain('Control Centre Live Data Unavailable');
    expect(html).toContain('Test query timeout');
    expect(html).toContain('Retry Control Centre');
  });

  it('renders AdminLoading skeleton layout without crashing', () => {
    const html = renderToString(<AdminLoading />);
    expect(html).toContain('Loading Jobiest Control Centre operations telemetry...');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('ad-header');
  });

  it('renders AdminError boundary view with error reference digest', () => {
    const html = renderToString(
      <AdminError
        error={Object.assign(new Error('Network failure during admin fetch'), { digest: 'ERR-ADMIN-9988' })}
        reset={() => {}}
      />,
    );
    expect(html).toContain('Admin Operation Exception');
    expect(html).toContain('Control Centre Encountered an Error');
    expect(html).toContain('ERR-ADMIN-9988');
    expect(html).toContain('Try reloading view');
  });
});
