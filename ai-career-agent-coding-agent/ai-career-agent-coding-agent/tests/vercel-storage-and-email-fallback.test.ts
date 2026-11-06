import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { isProviderConfigured, prewarmDynamicEmailConfig } from '@/lib/email/transport';

describe('Vercel Function Storage and Build Optimizations', () => {
  const appDir = path.resolve(__dirname, '..');
  const vercelJsonPath = path.join(appDir, 'vercel.json');
  const vercelIgnorePath = path.join(appDir, '.vercelignore');
  const ignoreScriptPath = path.join(appDir, 'scripts', 'vercel-ignore-build.sh');

  it('validates vercel.json structure and ignoreCommand presence', () => {
    expect(fs.existsSync(vercelJsonPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
    expect(content.ignoreCommand).toBe('bash scripts/vercel-ignore-build.sh');
    expect(Array.isArray(content.crons)).toBe(true);
    expect(content.crons.length).toBeGreaterThanOrEqual(6);
  });

  it('validates .vercelignore covers heavy test, ops, and report directories', () => {
    expect(fs.existsSync(vercelIgnorePath)).toBe(true);
    const content = fs.readFileSync(vercelIgnorePath, 'utf8');
    expect(content).toContain('tests/');
    expect(content).toContain('playwright/');
    expect(content).toContain('docs/');
    expect(content).toContain('ops/');
    expect(content).toContain('.zap/');
    expect(content).toContain('supabase/migrations/');
  });

  it('verifies vercel-ignore-build.sh script is executable and enforces production safety', () => {
    expect(fs.existsSync(ignoreScriptPath)).toBe(true);

    // Production environment must ALWAYS build (exit 1)
    let prodExitCode = 0;
    try {
      execFileSync('bash', [ignoreScriptPath], {
        cwd: appDir,
        env: { ...process.env, VERCEL_ENV: 'production' },
        stdio: 'pipe',
      });
      prodExitCode = 0;
    } catch (err: unknown) {
      prodExitCode = (err as { status?: number }).status ?? 1;
    }
    expect(prodExitCode).toBe(1);

    // Preview with no changes between same SHA must skip (exit 0)
    let skipExitCode = 1;
    try {
      execFileSync('bash', [ignoreScriptPath], {
        cwd: appDir,
        env: { ...process.env, VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: 'HEAD' },
        stdio: 'pipe',
      });
      skipExitCode = 0;
    } catch (err: unknown) {
      skipExitCode = (err as { status?: number }).status ?? 1;
    }
    expect(skipExitCode).toBe(0);
  });
});

describe('Dynamic Email Transport Fallback', () => {
  it('safely handles prewarming and maintains provider configuration state', async () => {
    await expect(prewarmDynamicEmailConfig()).resolves.not.toThrow();
    // Default without env or DB override returns false or boolean
    const configured = isProviderConfigured('resend');
    expect(typeof configured).toBe('boolean');
  });
});
