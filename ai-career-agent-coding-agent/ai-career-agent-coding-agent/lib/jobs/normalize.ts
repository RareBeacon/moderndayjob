import crypto from 'node:crypto';
import type { EmploymentType, NormalizedJob, RemoteType } from './types';

/** Strips HTML and collapses whitespace so descriptions compare/normalize cleanly. */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferRemoteType(location: string, ...textParts: string[]): RemoteType {
  const s = `${location} ${textParts.join(' ')}`.toLowerCase();
  const remote = /\bremote\b/.test(s);
  const hybrid = /\bhybrid\b/.test(s);
  if (remote && hybrid) return 'hybrid';
  if (remote) return 'remote';
  if (hybrid) return 'hybrid';
  if (/\bonsite\b|\bin-office\b|\bin office\b/.test(s)) return 'onsite';
  return 'unknown';
}

export function inferEmploymentType(...textParts: string[]): EmploymentType {
  const s = textParts.join(' ').toLowerCase();
  if (/full[- ]?time/.test(s)) return 'full-time';
  if (/part[- ]?time/.test(s)) return 'part-time';
  if (/contract|freelance|temp\b/.test(s)) return 'contract';
  if (/intern/.test(s)) return 'internship';
  return 'unknown';
}

/** SHA-256 of normalized identity fields — content fingerprint for dedup + immutability. */
export function contentHash(parts: {
  source: string;
  source_job_id: string;
  company: string;
  title: string;
  description: string;
}): string {
  const norm = [
    parts.source,
    parts.source_job_id,
    parts.company.trim().toLowerCase(),
    parts.title.trim().toLowerCase(),
    parts.description.trim().toLowerCase(),
  ].join('|');
  return crypto.createHash('sha256').update(norm).digest('hex');
}

export function dedupKey(job: NormalizedJob): string {
  return `${job.source}:${job.source_job_id}`;
}

/**
 * Deduplicates by (source, source_job_id) first, then by content fingerprint
 * (TECHNICAL_REQUIREMENTS §7). First occurrence wins.
 */
export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const byKey = new Map<string, NormalizedJob>();
  const seenHashes = new Set<string>();
  for (const job of jobs) {
    const key = dedupKey(job);
    if (byKey.has(key)) continue;
    if (seenHashes.has(job.content_hash)) continue;
    byKey.set(key, job);
    seenHashes.add(job.content_hash);
  }
  return [...byKey.values()];
}
