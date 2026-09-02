import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import type { TruthfulnessReport } from '@/lib/truthfulness/types';
import type { GenerationKind } from './types';

export interface PersistInput {
  userId: string;
  applicationId?: string | null;
  kind: GenerationKind;
  title: string;
  content: string;
  report: TruthfulnessReport;
  provider: string;
}

export interface PersistedDocument {
  id: string;
  version: number;
  contentHash: string;
}

/**
 * Persist a generated document as an immutable, versioned row
 * (migration 007 + 008). A new generation is always a NEW row, prior versions
 * are never mutated (append-only). `version` is computed as max(existing)+1 for
 * the same (user, kind, application). `content_hash` makes each version
 * verifiable; `source_facts` records the truthfulness report for traceability.
 *
 * Server/worker-only, writes use the service role (RLS bypass).
 */
export async function persistGeneratedDocument(input: PersistInput): Promise<PersistedDocument> {
  const contentHash = crypto.createHash('sha256').update(input.content).digest('hex');

  let versionQuery = supabaseAdmin
    .from('generated_documents')
    .select('version')
    .eq('user_id', input.userId)
    .eq('kind', input.kind);
  versionQuery = input.applicationId
    ? versionQuery.eq('application_id', input.applicationId)
    : versionQuery.is('application_id', null);
  const { data: existing } = await versionQuery.order('version', { ascending: false }).limit(1);
  const version = ((existing?.[0]?.version as number | undefined) ?? 0) + 1;

  const sourceFacts = {
    provider: input.provider,
    truthfulnessPassed: input.report.passed,
    supported: input.report.supported.map((c) => ({ category: c.category, value: c.value })),
    unsupported: input.report.unsupported.map((c) => ({ category: c.category, value: c.value, reason: c.reason })),
    suspicious: input.report.suspicious.map((c) => ({ category: c.category, value: c.value, reason: c.reason })),
  };

  const { data, error } = await supabaseAdmin
    .from('generated_documents')
    .insert({
      user_id: input.userId,
      application_id: input.applicationId ?? null,
      kind: input.kind,
      title: input.title,
      content: input.content,
      content_hash: contentHash,
      source_facts: sourceFacts,
      version,
      is_active: true,
    })
    .select('id, version')
    .single();

  if (error) throw new Error(`GENERATED_DOCUMENT_PERSIST_FAILED: ${error.message}`);
  return { id: data.id, version: data.version, contentHash };
}
