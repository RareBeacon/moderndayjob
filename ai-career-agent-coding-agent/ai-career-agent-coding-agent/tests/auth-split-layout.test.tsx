import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as unknown as { React: typeof React }).React = React;
import { AuthShell } from '../components/site/AuthShell';
import * as fs from 'fs';
import * as path from 'path';

describe('AuthShell and Promo Layout', () => {
  it('renders split promo layout with dedicated icon and text spans', () => {
    const html = renderToStaticMarkup(
      <AuthShell title="Welcome back" variant="login">
        <div>Form contents</div>
      </AuthShell>
    );

    expect(html).toContain('auth-promo-checklist');
    expect(html).toContain('auth-check-icon');
    expect(html).toContain('auth-check-text');
    expect(html).toContain('3 free tailored documents included');
    expect(html).toContain('Every draft stays editable');
    expect(html).toContain('Nothing is sent without your approval');
  });

  it('renders orbit background container with decorative markup', () => {
    const html = renderToStaticMarkup(
      <AuthShell title="Create your free account" variant="signup">
        <div>Signup form contents</div>
      </AuthShell>
    );

    expect(html).toContain('auth-promo-orbit');
    expect(html).toContain('auth-promo-orbit-inner');
  });

  it('has safe CSS rules in globals.css preventing text span squishing and grid-wrapping labels', () => {
    const cssPath = path.resolve(__dirname, '../app/globals.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    // Must not have destructive .auth-promo-copy li > span rule that styles all spans into 27px circles
    expect(css).not.toMatch(/\.auth-promo-copy\s+li\s*>\s*span\s*\{/);

    // Must style .auth-check-icon as circle icon
    expect(css).toContain('.auth-check-icon');

    // Must style .auth-check-text with normal white-space and flex auto
    expect(css).toContain('.auth-check-text');
    expect(css).toMatch(/\.auth-check-text\s*\{[^}]*white-space:\s*normal/);

    // Orbit should be subtle with low opacity border
    expect(css).toMatch(/\.auth-promo-orbit\s*\{[^}]*rgba\(215,\s*249,\s*75/);

    // Signup consent label must be inline so text does not split into rows
    expect(css).toMatch(/\.signup-consent\s+label\s*\{[^}]*display:\s*inline\s*!important/);
  });
});
