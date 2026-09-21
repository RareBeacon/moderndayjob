import { describe, it, expect } from 'vitest';
import { buildBoardLinks, isRemoteOnly } from '../lib/boardlinks';

describe('isRemoteOnly', () => {
  it('is remote-only when every entry means remote', () => {
    expect(isRemoteOnly(['Remote'])).toBe(true);
    expect(isRemoteOnly(['remote', 'Fully Remote'])).toBe(true);
  });

  it('is not remote-only when hybrid/onsite is also accepted', () => {
    expect(isRemoteOnly(['Remote', 'Hybrid'])).toBe(false);
    expect(isRemoteOnly(['Hybrid'])).toBe(false);
  });

  it('is not remote-only when nothing is set', () => {
    expect(isRemoteOnly([])).toBe(false);
    expect(isRemoteOnly(null)).toBe(false);
    expect(isRemoteOnly(undefined)).toBe(false);
  });
});

describe('buildBoardLinks', () => {
  it('builds one LinkedIn and one Indeed link per target role', () => {
    const links = buildBoardLinks({ targetRoles: ['Product Manager'], locations: ['Lagos'], remoteOnly: false });
    expect(links).toHaveLength(2);
    const li = links.find((l) => l.board === 'linkedin')!;
    const inr = links.find((l) => l.board === 'indeed')!;
    expect(li.url).toContain('https://www.linkedin.com/jobs/search/');
    expect(li.url).toContain('keywords=Product+Manager');
    expect(li.url).toContain('location=Lagos');
    expect(li.url).not.toContain('f_WT=');
    expect(inr.url).toContain('https://www.indeed.com/jobs');
    expect(inr.url).toContain('q=Product+Manager');
    expect(inr.url).toContain('l=Lagos');
    expect(inr.url).toContain('fromage=7');
    expect(inr.url).not.toContain('remotejob=');
  });

  it('applies the remote filters only when remote-only', () => {
    const links = buildBoardLinks({ targetRoles: ['Data Analyst'], locations: [], remoteOnly: true });
    const li = links.find((l) => l.board === 'linkedin')!;
    const inr = links.find((l) => l.board === 'indeed')!;
    expect(li.url).toContain('f_WT=2');
    expect(inr.url).toContain('remotejob=032b3046-06a3-4876-8dfd-474ebaf14158');
    expect(inr.url).not.toContain('l=');
  });

  it('caps at three roles and trims or skips empty roles', () => {
    const links = buildBoardLinks({
      targetRoles: ['Engineer', '  ', 'Designer', 'Analyst', 'Chef'],
      locations: ['Lagos'],
      remoteOnly: false,
    });
    // One LinkedIn + one Indeed link per kept role, in order.
    expect(links.map((l) => `${l.board}:${l.role}`)).toEqual([
      'linkedin:Engineer', 'indeed:Engineer',
      'linkedin:Designer', 'indeed:Designer',
      'linkedin:Analyst', 'indeed:Analyst',
    ]);
  });

  it('encodes special characters safely', () => {
    const links = buildBoardLinks({ targetRoles: ['C++ & Rust Dev'], locations: ['Abuja, Nigeria'], remoteOnly: false });
    for (const l of links) {
      expect(() => new URL(l.url)).not.toThrow();
      expect(l.url).toContain('C%2B%2B'); // the + in C++ is encoded, never raw
      expect(l.url).not.toContain('C++');
      expect(l.url).not.toContain('&Rust'); // the & is encoded, never a param separator
    }
  });

  it('returns nothing without target roles', () => {
    expect(buildBoardLinks({ targetRoles: [], locations: ['Lagos'], remoteOnly: true })).toEqual([]);
    expect(buildBoardLinks({ targetRoles: [''], locations: [], remoteOnly: false })).toEqual([]);
  });

  it('uses only the first location', () => {
    const links = buildBoardLinks({ targetRoles: ['Engineer'], locations: ['Lagos', 'Abuja'], remoteOnly: false });
    expect(links.every((l) => !l.url.includes('Abuja'))).toBe(true);
  });
});
