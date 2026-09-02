import { describe, it, expect } from 'vitest';
import { scanResume, extractKeywords } from '../lib/ats/scan';

const goodCv = `
Amina Okafor
amina@example.com | +234 803 555 0123
EXPERIENCE
Operations Lead — Kudi, Lagos (2021 – 2024)
• Led a team of 6 analysts and reduced processing time by 30%
• Built dashboards that improved reporting speed
• Managed vendor relationships across 3 regions
Analyst — GTBank (2019 – 2021)
• Delivered monthly forecasting models
• Automated reconciliation checks
EDUCATION
B.Sc. Economics, University of Lagos (2015)
SKILLS
Excel, SQL, Python, Operations management, Vendor management
`.repeat(3);

describe('scanResume — deterministic checks', () => {
  it('scores a well-structured CV highly with all sections found', () => {
    const r = scanResume(goodCv);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.findings.find((f) => f.check === 'Contact email')?.status).toBe('pass');
    expect(r.findings.find((f) => f.check === 'Phone number')?.status).toBe('pass');
    expect(r.findings.find((f) => f.check === 'Core sections')?.status).toBe('pass');
    expect(r.findings.find((f) => f.check === 'Dates')?.status).toBe('pass');
    expect(r.stats.words).toBeGreaterThan(150);
  });

  it('fails a thin CV with no contact details or dates', () => {
    const r = scanResume('hard worker who works hard and wants a job'.repeat(3));
    expect(r.score).toBeLessThanOrEqual(30);
    expect(r.findings.find((f) => f.check === 'Contact email')?.status).toBe('fail');
    expect(r.findings.find((f) => f.check === 'Dates')?.status).toBe('fail');
  });

  it('flags first-person pronouns and emoji as warnings, not failures', () => {
    const r = scanResume(`I am a developer 🚀\n${goodCv}`);
    expect(r.findings.find((f) => f.check === 'First person')?.status).toBe('warn');
    expect(r.findings.find((f) => f.check === 'Special characters')?.status).toBe('warn');
  });

  it('keyword matching is deterministic and stopword-filtered', () => {
    const r = scanResume(goodCv, 'Looking for an operations analyst skilled in SQL, Excel and vendor management. The role requires forecasting and reporting.');
    expect(r.keywords).toBeTruthy();
    expect(r.keywords!.matched).toContain('sql');
    expect(r.keywords!.matched).toContain('excel');
    expect(r.keywords!.missing).not.toContain('operations');
    const kw = r.findings.find((f) => f.check === 'Role keywords');
    expect(['pass', 'warn']).toContain(kw?.status);
  });

  it('score always stays within 0-100', () => {
    expect(scanResume('').score).toBeGreaterThanOrEqual(0);
    expect(scanResume(goodCv, 'x'.repeat(40)).score).toBeLessThanOrEqual(100);
  });
});

describe('extractKeywords — frequency-based, no model', () => {
  it('ranks repeated terms and drops stopwords', () => {
    const kws = extractKeywords('Python developer. Python. Python and more Python with Kubernetes and docker docker.');
    expect(kws[0]).toBe('python');
    expect(kws).toContain('docker');
    expect(kws).not.toContain('and');
    expect(kws).not.toContain('with');
  });
});
