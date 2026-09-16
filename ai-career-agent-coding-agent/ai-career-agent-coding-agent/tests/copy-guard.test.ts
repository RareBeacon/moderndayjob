import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Copy guard · spec Part 12.6 + Appendix C enforcement.
 * Zero em dashes and zero prohibited internal jargon are permitted in
 * source copy. This test scans every .ts/.tsx file under the app roots
 * so a regression fails CI before it can ship.
 */

const ROOTS = ['app', 'components', 'lib', 'packages', 'apps', 'workers'];
const EM_DASH = /\u2014/;

const PROHIBITED: { term: RegExp; why: string }[] = [
  { term: /\bAI Documents\b/i, why: 'use "Resume Builder", "Cover Letter Generator"' },
  { term: /\bLeveraging AI\b/i, why: 'use "Using AI" or "AI-powered"' },
  { term: /\bAutonomous agent\b/i, why: 'use "Jobiest Agent" / "Jobiest handles this"' },
  { term: /\bConfigure your agent\b/i, why: 'use "Set up your job search preferences"' },
  { term: /\b[Pp]roprietary algorithms?\b/, why: 'never mention to users' },
  { term: /\b[Nn]eural networks?\b/, why: 'never mention to users' },
  { term: /\b[Mm]achine learning\b/, why: 'never mention to users' },
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e)) {
      out.push(p);
    }
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));

describe('copy guard (spec 12.6 / Appendix C)', () => {
  it('scans a non-trivial number of source files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('contains zero em dashes in source', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf-8');
      for (const [i, line] of src.split('\n').entries()) {
        if (line.includes('copy-guard:allow')) continue; // explicit, reviewed exception
        if (EM_DASH.test(line)) offenders.push(`${f}:${i + 1}`);
      }
    }
    expect(offenders, `em dashes found in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('contains zero prohibited internal-jargon terms', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf-8');
      for (const { term, why } of PROHIBITED) {
        const m = src.match(term);
        if (m && !src.slice(Math.max(0, (m.index ?? 0) - 200), (m.index ?? 0) + 200).includes('copy-guard:allow')) {
          offenders.push(`${f}: "${m[0]}" (${why})`);
        }
      }
    }
    expect(offenders, `prohibited terms found:\n${offenders.join('\n')}`).toEqual([]);
  });
});
