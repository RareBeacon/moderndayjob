/** Canonical, source-agnostic job model (TECHNICAL_REQUIREMENTS §6). */
export type RemoteType = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'internship' | 'unknown';

export interface NormalizedJob {
  source: string;
  source_job_id: string;
  canonical_url: string;
  company: string;
  title: string;
  description: string;
  location: string;
  remote_type: RemoteType;
  employment_type: EmploymentType;
  seniority?: string;
  salary?: string;
  posted_at?: string;
  application_url?: string;
  metadata: Record<string, unknown>;
  content_hash: string;
}

/** Injectable fetch so adapters are deterministic and SSRF-controlled (ARCHITECTURE_ESSENTIALS §11). */
export type JobFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface AdapterContext {
  fetcher: JobFetcher;
  /** Source-specific identifier: Greenhouse board token or Lever company slug. */
  board: string;
  /** Human company name (sources don't always include it). */
  company: string;
  signal?: AbortSignal;
}

export interface JobSourceAdapter {
  readonly source: string;
  discover(ctx: AdapterContext): Promise<NormalizedJob[]>;
  healthCheck(ctx: AdapterContext): Promise<{ ok: boolean; detail?: string }>;
}
