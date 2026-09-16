import { describe, expect, it } from 'vitest';
import { normalizeJobUrl, duplicateKey, findDuplicateIds, dedupeAndFilterFresh, isStale } from '../lib/jobsources/dedup';

describe('normalizeJobUrl (B-144)', () => {
  it('lowercases host, strips www, trailing slash and tracking params', () => {
    expect(normalizeJobUrl('https://WWW.Boards.greenhouse.io/acme/jobs/123/?utm_source=x&gh_src=abc'))
      .toBe('boards.greenhouse.io/acme/jobs/123');
  });

  it('sorts surviving query params deterministically', () => {
    expect(normalizeJobUrl('https://a.io/p?b=2&a=1')).toBe('a.io/p?a=1&b=2');
    expect(normalizeJobUrl('https://a.io/p?a=1&b=2')).toBe('a.io/p?a=1&b=2');
  });

  it('returns null for unparseable input', () => {
    expect(normalizeJobUrl('not a url')).toBeNull();
    expect(normalizeJobUrl('')).toBeNull();
  });
});

describe('duplicateKey (B-144)', () => {
  it('derives from the normalized URL when present', () => {
    expect(duplicateKey({ url: 'https://boards.greenhouse.io/acme/jobs/1/', company: 'A', title: 'T' }))
      .toBe(duplicateKey({ url: 'https://boards.greenhouse.io/acme/jobs/1', company: 'B', title: 'X' }));
  });

  it('falls back to company+title when no URL', () => {
    expect(duplicateKey({ company: ' Acme ', title: ' Engineer ' }))
      .toBe(duplicateKey({ company: 'acme', title: 'engineer' }));
  });

  it('returns null when there is nothing to key on', () => {
    expect(duplicateKey({})).toBeNull();
  });
});

describe('findDuplicateIds: keep the earliest listing (B-144)', () => {
  it('marks later rows with the same duplicate_key, keeping the earliest', () => {
    const jobs = [
      { id: 'new', duplicate_key: 'u:x', created_at: '2026-09-16T00:00:00Z' },
      { id: 'old', duplicate_key: 'u:x', created_at: '2026-09-01T00:00:00Z' },
      { id: 'unique', duplicate_key: 'u:y', created_at: '2026-09-10T00:00:00Z' },
      { id: 'nokey', duplicate_key: null, created_at: '2026-09-10T00:00:00Z' },
    ];
    const dupes = findDuplicateIds(jobs);
    expect(dupes.has('new')).toBe(true);
    expect(dupes.has('old')).toBe(false);
    expect(dupes.has('unique')).toBe(false);
    expect(dupes.has('nokey')).toBe(false);
  });

  it('never deletes: rows without a key are always kept', () => {
    const jobs = [
      { id: 'a', duplicate_key: null, created_at: '2026-09-16T00:00:00Z' },
      { id: 'b', duplicate_key: undefined, created_at: '2026-09-01T00:00:00Z' },
    ];
    expect(findDuplicateIds(jobs).size).toBe(0);
  });
});

describe('freshness (B-145)', () => {
  const now = new Date('2026-09-16T12:00:00Z');

  it('isStale: rows unseen for >30 days are stale', () => {
    expect(isStale({ last_seen_at: '2026-09-01T00:00:00Z' }, now)).toBe(false);
    expect(isStale({ last_seen_at: '2026-08-10T00:00:00Z' }, now)).toBe(true);
    expect(isStale({ last_seen_at: null, created_at: '2026-08-10T00:00:00Z' }, now)).toBe(true);
    expect(isStale({ last_seen_at: null, created_at: null }, now)).toBe(false);
  });

  it('dedupeAndFilterFresh drops stale rows and tier-2 duplicates', () => {
    const jobs = [
      { id: 'fresh-dupe', duplicate_key: 'u:x', created_at: '2026-09-16T00:00:00Z' },
      { id: 'fresh-orig', duplicate_key: 'u:x', created_at: '2026-09-01T00:00:00Z' },
      { id: 'stale', duplicate_key: 'u:y', created_at: '2026-01-01T00:00:00Z' },
    ];
    const out = dedupeAndFilterFresh(jobs, now);
    expect(out.map((j) => j.id)).toEqual(['fresh-orig']);
  });
});
