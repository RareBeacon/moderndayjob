import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { Document } from '@langchain/core/documents';
import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import { supabaseAdmin } from '@/lib/supabase';
import { defangUntrustedText } from '@/lib/ai/injection';
import type { CandidateSnapshotData } from '@/lib/talent-pool/onboarding-inspector';

export const EMBEDDING_DIMENSION = 384;

export type RagNamespace =
  | 'CANDIDATE_KNOWLEDGE'
  | 'JOB_COMPETENCY_KNOWLEDGE'
  | 'ASSESSMENT_KNOWLEDGE';

export type RagDocumentType =
  | 'CANDIDATE_PROFILE'
  | 'UPLOADED_CV'
  | 'EMPLOYMENT_HISTORY'
  | 'SKILLS_AND_CERTIFICATIONS'
  | 'PROJECTS_AND_PORTFOLIO'
  | 'CAREER_OBJECTIVES'
  | 'COMPETENCY_FRAMEWORK'
  | 'ROLE_SCENARIO_TEMPLATE'
  | 'ASSESSMENT_RUBRIC';

export interface RagChunkMetadata {
  chunkId: string;
  documentId: string;
  namespace: RagNamespace;
  candidateId: string | null;
  careerCategory: string | null;
  jobTitle: string | null;
  skills: string[];
  experienceLevel: string | null;
  documentType: RagDocumentType;
  source: string;
  version: number;
  createdAt: string;
  contentSha256: string;
  chunkIndex: number;
}

export interface StoredRagChunk {
  id: string;
  text: string;
  embedding: number[];
  metadata: RagChunkMetadata;
  isActive: boolean;
}

export interface RagRetrievalQuery {
  query: string;
  namespace: RagNamespace;
  /** Mandatory when namespace === 'CANDIDATE_KNOWLEDGE' (enforced BEFORE retrieval). */
  candidateId?: string | null;
  careerCategory?: string | null;
  experienceLevel?: string | null;
  documentTypes?: RagDocumentType[];
  skillsFilter?: string[];
  topK?: number;
}

export interface RetrievedEvidence {
  chunkId: string;
  documentId: string;
  text: string;
  score: number;
  metadata: RagChunkMetadata;
}

export interface IngestionDocumentInput {
  namespace: RagNamespace;
  candidateId: string | null;
  sourceDocumentId?: string | null;
  documentType: RagDocumentType;
  source: string;
  rawContent: string | Buffer;
  mimeType?: string;
  careerCategory?: string | null;
  jobTitle?: string | null;
  skills?: string[];
  experienceLevel?: string | null;
  version?: number;
}

export interface IngestionResult {
  documentRefId: string;
  contentSha256: string;
  chunkCount: number;
  reusedCached: boolean;
  staleInvalidatedCount: number;
  piiRedactedCount: number;
}

// Embedding cache keyed by SHA-256 of normalized chunk text so unchanged chunks never recompute
const embeddingCache = new Map<string, number[]>();

/**
 * In-process RAG index used synchronously by LangChain retrievers, unit/benchmark suites,
 * and mirrored to PostgreSQL `public.talent_rag_documents` + `public.talent_rag_chunks` (pgvector)
 * when persistToDatabase=true.
 */
class ScopedVectorIndex {
  private docs = new Map<string, { candidateId: string | null; namespace: RagNamespace; documentType: RagDocumentType; contentSha256: string; version: number; isActive: boolean }>();
  private chunks: StoredRagChunk[] = [];

  clearCandidate(candidateId: string) {
    this.chunks = this.chunks.filter((c) => c.metadata.candidateId !== candidateId);
    for (const [k, v] of this.docs.entries()) {
      if (v.candidateId === candidateId) this.docs.delete(k);
    }
  }

  upsertDocumentChunks(params: {
    documentRefId: string;
    candidateId: string | null;
    namespace: RagNamespace;
    documentType: RagDocumentType;
    contentSha256: string;
    version: number;
    newChunks: StoredRagChunk[];
  }): { reusedCached: boolean; staleInvalidatedCount: number } {
    for (const [docId, doc] of this.docs.entries()) {
      if (
        doc.isActive &&
        doc.namespace === params.namespace &&
        doc.candidateId === params.candidateId &&
        doc.documentType === params.documentType &&
        doc.contentSha256 === params.contentSha256
      ) {
        return { reusedCached: true, staleInvalidatedCount: 0 };
      }
      if (
        doc.isActive &&
        doc.namespace === params.namespace &&
        doc.candidateId === params.candidateId &&
        doc.documentType === params.documentType &&
        docId !== params.documentRefId
      ) {
        doc.isActive = false;
      }
    }

    let staleInvalidatedCount = 0;
    for (const ch of this.chunks) {
      if (
        ch.isActive &&
        ch.metadata.namespace === params.namespace &&
        ch.metadata.candidateId === params.candidateId &&
        ch.metadata.documentType === params.documentType
      ) {
        ch.isActive = false;
        staleInvalidatedCount += 1;
      }
    }

    this.docs.set(params.documentRefId, {
      candidateId: params.candidateId,
      namespace: params.namespace,
      documentType: params.documentType,
      contentSha256: params.contentSha256,
      version: params.version,
      isActive: true,
    });
    this.chunks.push(...params.newChunks);
    return { reusedCached: false, staleInvalidatedCount };
  }

  /**
   * HARD ACCESS CONTROL BEFORE RETRIEVAL:
   * Candidate chunks are filtered strictly by `candidateId` BEFORE any similarity computation.
   */
  search(req: RagRetrievalQuery): RetrievedEvidence[] {
    if (req.namespace === 'CANDIDATE_KNOWLEDGE') {
      if (!req.candidateId || !req.candidateId.trim()) {
        throw new Error('RAG_ACCESS_DENIED: candidateId is mandatory for CANDIDATE_KNOWLEDGE retrieval.');
      }
    }

    const prefiltered = this.chunks.filter((c) => {
      if (!c.isActive) return false;
      if (c.metadata.namespace !== req.namespace) return false;
      if (req.namespace === 'CANDIDATE_KNOWLEDGE') {
        if (c.metadata.candidateId !== req.candidateId) return false;
      } else if (c.metadata.candidateId !== null) {
        return false;
      }
      if (
        req.careerCategory &&
        c.metadata.careerCategory &&
        c.metadata.careerCategory.toLowerCase() !== req.careerCategory.toLowerCase()
      ) {
        return false;
      }
      if (
        req.experienceLevel &&
        c.metadata.experienceLevel &&
        c.metadata.experienceLevel.toLowerCase() !== req.experienceLevel.toLowerCase()
      ) {
        return false;
      }
      if (req.documentTypes && req.documentTypes.length > 0) {
        if (!req.documentTypes.includes(c.metadata.documentType)) return false;
      }
      if (req.skillsFilter && req.skillsFilter.length > 0) {
        const lowerSkills = c.metadata.skills.map((s) => s.toLowerCase());
        const overlap = req.skillsFilter.some((sf) =>
          lowerSkills.some((ls) => ls.includes(sf.toLowerCase())),
        );
        if (!overlap && lowerSkills.length > 0) return false;
      }
      return true;
    });

    if (prefiltered.length === 0) return [];

    const queryVec = generateSemanticEmbedding(req.query);
    const queryTokens = tokenizeForLexical(req.query);

    const scored = prefiltered.map((chunk) => {
      const dense = cosineSimilarity(queryVec, chunk.embedding);
      const lexical = computeLexicalOverlap(queryTokens, chunk.text, chunk.metadata.skills);
      const hybridScore = Number((dense * 0.68 + lexical * 0.32).toFixed(4));
      return {
        chunkId: chunk.id,
        documentId: chunk.metadata.documentId,
        text: chunk.text,
        score: hybridScore,
        metadata: chunk.metadata,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.min(Math.max(req.topK ?? 6, 1), 25));
  }
}

const globalRagIndex = new ScopedVectorIndex();
let sharedKnowledgeSeeded = false;

/**
 * Step 1 & 2: File validation + safe text extraction for formats used by Jobiest (PDF, text, JSON).
 */
export function validateAndExtractDocumentText(
  raw: string | Buffer,
  mimeType = 'text/plain',
): string {
  if (typeof raw === 'string') {
    if (raw.length > 2_000_000) {
      throw new Error('RAG_FILE_TOO_LARGE');
    }
    return raw;
  }

  if (raw.byteLength === 0) {
    throw new Error('RAG_EMPTY_DOCUMENT');
  }
  if (raw.byteLength > 5 * 1024 * 1024) {
    throw new Error('RAG_FILE_TOO_LARGE');
  }

  if (mimeType === 'application/pdf' || raw.subarray(0, 5).toString('ascii') === '%PDF-') {
    if (raw.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('RAG_INVALID_PDF_SIGNATURE');
    }
    return extractReadableTextFromPdfBuffer(raw);
  }

  return raw.toString('utf8');
}

/**
 * Lightweight, zero-external-binary PDF text extractor supporting uncompressed and FlateDecode
 * content streams (`Tj` and `TJ` PDF text operators).
 */
export function extractReadableTextFromPdfBuffer(pdfBytes: Buffer): string {
  const pieces: string[] = [];
  const latin = pdfBytes.toString('latin1');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  const extractOperators = (content: string) => {
    const tjMatches = content.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g);
    for (const m of tjMatches) {
      pieces.push(unescapePdfString(m[1]));
    }
    const tjArrayMatches = content.matchAll(/\[([\s\S]*?)\]\s*TJ/g);
    for (const arr of tjArrayMatches) {
      const inner = arr[1].matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g);
      const lineParts: string[] = [];
      for (const p of inner) lineParts.push(unescapePdfString(p[1]));
      if (lineParts.length > 0) pieces.push(lineParts.join(''));
    }
  };

  while ((match = streamRegex.exec(latin)) !== null) {
    const rawStream = Buffer.from(match[1], 'latin1');
    try {
      const inflated = inflateSync(rawStream).toString('latin1');
      extractOperators(inflated);
    } catch {
      extractOperators(match[1]);
    }
  }

  const combined = pieces.join(' ').replace(/\s+/g, ' ').trim();
  if (combined.length >= 20) return combined;

  // Fallback ASCII printable scan for simple generated PDFs
  return pdfBytes
    .toString('utf8')
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

/**
 * Step 3: Normalization, prompt-injection defanging, and unnecessary PII stripping
 * BEFORE embedding or sending to external LLM providers.
 */
export function normalizeAndRedactForRag(rawText: string): {
  cleaned: string;
  piiRedactedCount: number;
} {
  let redactions = 0;
  let text = defangUntrustedText(rawText);

  const patterns: Array<[RegExp, string]> = [
    [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]'],
    [/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{4}/g, '[REDACTED_PHONE]'],
    [/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_NATIONAL_ID]'],
    [
      /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions[\s\S]{0,160}/gi,
      '[UNTRUSTED_INSTRUCTION_STRIPPED]',
    ],
    [
      /(?:system\s*prompt|override\s+scoring|approve\s+this\s+candidate\s+immediately)/gi,
      '[UNTRUSTED_DIRECTIVE_STRIPPED]',
    ],
  ];

  for (const [re, replacement] of patterns) {
    text = text.replace(re, () => {
      redactions += 1;
      return replacement;
    });
  }

  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleaned, piiRedactedCount: redactions };
}

/**
 * Step 4: Overlapping semantic chunker (never indexes whole documents as one giant chunk).
 */
export function chunkNormalizedText(
  text: string,
  opts: { chunkSize?: number; chunkOverlap?: number } = {},
): string[] {
  const chunkSize = opts.chunkSize ?? 420;
  const overlap = Math.min(opts.chunkOverlap ?? 80, Math.floor(chunkSize / 2));
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const paragraphs = clean.split(/\n\n+|\.\s+(?=[A-Z0-9])/);
  const chunks: string[] = [];
  let current = '';

  for (const rawUnit of paragraphs) {
    const unit = rawUnit.trim();
    if (!unit) continue;
    const sep = current ? '. ' : '';
    if (current.length + sep.length + unit.length <= chunkSize) {
      current = `${current}${sep}${unit}`;
    } else {
      if (current) chunks.push(current);
      if (unit.length <= chunkSize) {
        const tail = current ? current.slice(-overlap).trim() : '';
        current = tail ? `${tail} ${unit}`.slice(0, chunkSize) : unit;
      } else {
        // Long unbroken paragraph: sliding window with overlap
        let start = 0;
        while (start < unit.length) {
          const slice = unit.slice(start, start + chunkSize).trim();
          if (slice) chunks.push(slice);
          if (start + chunkSize >= unit.length) break;
          start += chunkSize - overlap;
        }
        current = '';
      }
    }
  }
  if (current) chunks.push(current);

  // Deduplicate identical chunks
  return Array.from(new Set(chunks));
}

function tokenizeForLexical(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Step 6: Deterministic 384-dim L2-normalized semantic feature-hashed embedding with SHA-256 cache.
 * Encodes unigrams, bigrams, and character 4-grams so technical terms (e.g. PostgreSQL, LangGraph,
 * Kubernetes, HubSpot, IFRS, GAAP) cluster accurately with zero external API cost or key dependency.
 */
export function generateSemanticEmbedding(text: string): number[] {
  const key = createHash('sha256').update(text).digest('hex');
  const hit = embeddingCache.get(key);
  if (hit) return hit;

  const vec = new Float64Array(EMBEDDING_DIMENSION);
  const tokens = tokenizeForLexical(text);

  const accumulateFeature = (feature: string, weight: number) => {
    const digest = createHash('md5').update(feature).digest();
    const idx1 = digest.readUInt16LE(0) % EMBEDDING_DIMENSION;
    const sign1 = (digest[2] & 1) === 0 ? 1 : -1;
    const idx2 = digest.readUInt16LE(4) % EMBEDDING_DIMENSION;
    const sign2 = (digest[6] & 1) === 0 ? 1 : -1;
    vec[idx1] += sign1 * weight;
    vec[idx2] += sign2 * weight * 0.5;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    accumulateFeature(`u:${tok}`, 1.4);
    if (i + 1 < tokens.length) {
      accumulateFeature(`b:${tok}_${tokens[i + 1]}`, 1.1);
    }
    if (tok.length >= 4) {
      for (let j = 0; j <= tok.length - 4; j += 1) {
        accumulateFeature(`c4:${tok.slice(j, j + 4)}`, 0.35);
      }
    }
  }

  let normSq = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i += 1) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq) || 1;
  const out = Array.from(vec, (v) => Number((v / norm).toFixed(6)));
  embeddingCache.set(key, out);
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i += 1) dot += a[i] * b[i];
  return dot;
}

function computeLexicalOverlap(queryTokens: string[], chunkText: string, skills: string[]): number {
  if (queryTokens.length === 0) return 0;
  const hay = new Set([...tokenizeForLexical(chunkText), ...skills.flatMap(tokenizeForLexical)]);
  let hits = 0;
  const uniqueQ = Array.from(new Set(queryTokens));
  for (const qt of uniqueQ) {
    if (hay.has(qt)) hits += 1;
  }
  return hits / uniqueQ.length;
}

/**
 * Full 9-stage RAG Ingestion Pipeline:
 * UPLOAD -> VALIDATE -> EXTRACT -> REDACT/NORMALIZE -> CHUNK -> ENRICH METADATA -> EMBED -> STORE -> INDEX
 */
export async function ingestDocumentIntoRag(
  input: IngestionDocumentInput,
  opts: { persistToDatabase?: boolean } = {},
): Promise<IngestionResult> {
  if (input.namespace === 'CANDIDATE_KNOWLEDGE' && !input.candidateId) {
    throw new Error('RAG_INGEST_DENIED: candidateId is required for CANDIDATE_KNOWLEDGE.');
  }
  if (input.namespace !== 'CANDIDATE_KNOWLEDGE' && input.candidateId) {
    throw new Error('RAG_INGEST_DENIED: shared knowledge cannot carry a private candidateId.');
  }

  const extracted = validateAndExtractDocumentText(input.rawContent, input.mimeType);
  const { cleaned, piiRedactedCount } = normalizeAndRedactForRag(extracted);
  const contentSha256 = createHash('sha256').update(cleaned).digest('hex');
  const rawChunks = chunkNormalizedText(cleaned);
  const nowIso = new Date().toISOString();
  const version = input.version ?? 1;
  const docRefId = createHash('sha256')
    .update(`${input.namespace}:${input.candidateId ?? 'shared'}:${input.documentType}:${contentSha256}`)
    .digest('hex')
    .slice(0, 32);
  const docUuid = `${docRefId.slice(0, 8)}-${docRefId.slice(8, 12)}-4${docRefId.slice(13, 16)}-8${docRefId.slice(17, 20)}-${docRefId.slice(20, 32)}`;

  const builtChunks: StoredRagChunk[] = rawChunks.map((text, idx) => {
    const chunkHash = createHash('sha256').update(`${docUuid}:${idx}:${text}`).digest('hex').slice(0, 32);
    const chunkUuid = `${chunkHash.slice(0, 8)}-${chunkHash.slice(8, 12)}-4${chunkHash.slice(13, 16)}-8${chunkHash.slice(17, 20)}-${chunkHash.slice(20, 32)}`;
    return {
      id: chunkUuid,
      text,
      embedding: generateSemanticEmbedding(text),
      isActive: true,
      metadata: {
        chunkId: chunkUuid,
        documentId: input.sourceDocumentId ?? docUuid,
        namespace: input.namespace,
        candidateId: input.candidateId,
        careerCategory: input.careerCategory ?? null,
        jobTitle: input.jobTitle ?? null,
        skills: input.skills ?? [],
        experienceLevel: input.experienceLevel ?? null,
        documentType: input.documentType,
        source: input.source,
        version,
        createdAt: nowIso,
        contentSha256,
        chunkIndex: idx,
      },
    };
  });

  const memOutcome = globalRagIndex.upsertDocumentChunks({
    documentRefId: docUuid,
    candidateId: input.candidateId,
    namespace: input.namespace,
    documentType: input.documentType,
    contentSha256,
    version,
    newChunks: builtChunks,
  });

  if (opts.persistToDatabase && !memOutcome.reusedCached && builtChunks.length > 0) {
    try {
      // Mark superseded documents of the same type inactive on re-indexing
      if (input.candidateId) {
        await supabaseAdmin
          .from('talent_rag_documents')
          .update({ is_active: false, stale_at: nowIso })
          .eq('candidate_user_id', input.candidateId)
          .eq('namespace', input.namespace)
          .eq('document_type', input.documentType)
          .neq('content_sha256', contentSha256);
      }

      const { data: docRow } = await supabaseAdmin
        .from('talent_rag_documents')
        .upsert(
          {
            id: docUuid,
            namespace: input.namespace,
            candidate_user_id: input.candidateId,
            source_document_id: input.sourceDocumentId ?? null,
            document_type: input.documentType,
            source: input.source,
            career_category: input.careerCategory ?? null,
            job_title: input.jobTitle ?? null,
            experience_level: input.experienceLevel ?? null,
            version,
            content_sha256: contentSha256,
            chunk_count: builtChunks.length,
            pii_redacted: true,
            is_active: true,
          },
          { onConflict: 'id' },
        )
        .select('id')
        .maybeSingle();

      if (docRow?.id) {
        const rows = builtChunks.map((ch) => ({
          id: ch.id,
          document_ref_id: docRow.id,
          namespace: ch.metadata.namespace,
          candidate_user_id: ch.metadata.candidateId,
          source_document_id: input.sourceDocumentId ?? null,
          chunk_index: ch.metadata.chunkIndex,
          chunk_text: ch.text,
          token_estimate: Math.ceil(ch.text.length / 4),
          career_category: ch.metadata.careerCategory,
          job_title: ch.metadata.jobTitle,
          skills: ch.metadata.skills,
          experience_level: ch.metadata.experienceLevel,
          document_type: ch.metadata.documentType,
          source: ch.metadata.source,
          version: ch.metadata.version,
          embedding: `[${ch.embedding.join(',')}]`,
          embedding_model: 'jobiest-hybrid-384-v1',
          metadata: ch.metadata,
        }));
        await supabaseAdmin.from('talent_rag_chunks').upsert(rows, { onConflict: 'document_ref_id,chunk_index' });
      }
    } catch {
      // Non-fatal when running in isolated unit/benchmark environments without pgvector connection
    }
  }

  return {
    documentRefId: docUuid,
    contentSha256,
    chunkCount: builtChunks.length,
    reusedCached: memOutcome.reusedCached,
    staleInvalidatedCount: memOutcome.staleInvalidatedCount,
    piiRedactedCount,
  };
}

/**
 * Ingests all structured sections of a candidate's profile + optional raw CV text into isolated candidate RAG chunks.
 */
export async function ingestCandidateSnapshotIntoRag(params: {
  candidateId: string;
  snapshot: CandidateSnapshotData;
  cvExtractedText?: string | null;
  cvDocumentId?: string | null;
  version?: number;
  persistToDatabase?: boolean;
}): Promise<IngestionResult[]> {
  const { candidateId, snapshot, version = 1, persistToDatabase = false } = params;
  const primaryTitle = snapshot.target_roles[0] ?? snapshot.headline ?? 'Professional';
  const results: IngestionResult[] = [];

  const profileSummary = [
    `Headline: ${snapshot.headline ?? 'Unspecified'}`,
    `Career Category: ${snapshot.career_category ?? 'Unspecified'}`,
    `Seniority: ${snapshot.seniority_level ?? 'Unspecified'}`,
    `Years of Experience: ${snapshot.years_of_experience ?? 'Unspecified'}`,
    `Summary: ${snapshot.summary ?? 'None provided'}`,
    `Location: ${snapshot.location ?? ''}, ${snapshot.country ?? ''}`,
  ].join('\n');

  results.push(
    await ingestDocumentIntoRag(
      {
        namespace: 'CANDIDATE_KNOWLEDGE',
        candidateId,
        documentType: 'CANDIDATE_PROFILE',
        source: 'confirmed_onboarding_profile',
        rawContent: profileSummary,
        careerCategory: snapshot.career_category,
        jobTitle: primaryTitle,
        skills: snapshot.skills,
        experienceLevel: snapshot.seniority_level,
        version,
      },
      { persistToDatabase },
    ),
  );

  if (snapshot.experience.length > 0) {
    const expText = snapshot.experience
      .map(
        (e, idx) =>
          `Role ${idx + 1}: ${e.title} at ${e.company}. Responsibilities & Achievements: ${e.description ?? 'No description supplied.'}`,
      )
      .join('\n\n');
    results.push(
      await ingestDocumentIntoRag(
        {
          namespace: 'CANDIDATE_KNOWLEDGE',
          candidateId,
          documentType: 'EMPLOYMENT_HISTORY',
          source: 'candidate_employment_history',
          rawContent: expText,
          careerCategory: snapshot.career_category,
          jobTitle: primaryTitle,
          skills: snapshot.skills,
          experienceLevel: snapshot.seniority_level,
          version,
        },
        { persistToDatabase },
      ),
    );
  }

  const skillsCertText = [
    `Technical & Domain Skills: ${snapshot.skills.join(', ') || 'None listed'}`,
    `Core Competencies: ${snapshot.technical_competencies.join(', ') || 'None listed'}`,
    `Education: ${snapshot.education.map((ed) => `${ed.qualification} at ${ed.institution}`).join('; ') || 'None listed'}`,
    `Certifications: ${snapshot.certifications.map((c) => `${c.name} (${c.issuer})`).join('; ') || 'None listed'}`,
  ].join('\n');

  results.push(
    await ingestDocumentIntoRag(
      {
        namespace: 'CANDIDATE_KNOWLEDGE',
        candidateId,
        documentType: 'SKILLS_AND_CERTIFICATIONS',
        source: 'candidate_skills_and_education',
        rawContent: skillsCertText,
        careerCategory: snapshot.career_category,
        jobTitle: primaryTitle,
        skills: [...snapshot.skills, ...snapshot.technical_competencies],
        experienceLevel: snapshot.seniority_level,
        version,
      },
      { persistToDatabase },
    ),
  );

  if (snapshot.projects.length > 0 || snapshot.portfolio_url) {
    const projText = [
      snapshot.portfolio_url ? `Portfolio Reference: ${snapshot.portfolio_url}` : '',
      ...snapshot.projects.map(
        (p, idx) => `Project ${idx + 1}: ${p.name}. Details: ${p.description ?? 'No details provided.'}`,
      ),
    ]
      .filter(Boolean)
      .join('\n\n');
    results.push(
      await ingestDocumentIntoRag(
        {
          namespace: 'CANDIDATE_KNOWLEDGE',
          candidateId,
          documentType: 'PROJECTS_AND_PORTFOLIO',
          source: 'candidate_projects_portfolio',
          rawContent: projText,
          careerCategory: snapshot.career_category,
          jobTitle: primaryTitle,
          skills: snapshot.skills,
          experienceLevel: snapshot.seniority_level,
          version,
        },
        { persistToDatabase },
      ),
    );
  }

  const objectivesText = [
    `Target Positions: ${snapshot.target_roles.join(', ') || 'Unspecified'}`,
    `Preferred Work Modes: ${snapshot.remote_types.join(', ')} (${snapshot.employment_types.join(', ')})`,
    `Availability: ${snapshot.availability ?? 'Unspecified'}`,
  ].join('\n');

  results.push(
    await ingestDocumentIntoRag(
      {
        namespace: 'CANDIDATE_KNOWLEDGE',
        candidateId,
        documentType: 'CAREER_OBJECTIVES',
        source: 'candidate_career_objectives',
        rawContent: objectivesText,
        careerCategory: snapshot.career_category,
        jobTitle: primaryTitle,
        skills: snapshot.skills,
        experienceLevel: snapshot.seniority_level,
        version,
      },
      { persistToDatabase },
    ),
  );

  if (params.cvExtractedText && params.cvExtractedText.trim().length > 15) {
    results.push(
      await ingestDocumentIntoRag(
        {
          namespace: 'CANDIDATE_KNOWLEDGE',
          candidateId,
          sourceDocumentId: params.cvDocumentId ?? null,
          documentType: 'UPLOADED_CV',
          source: snapshot.master_cv_name ?? 'uploaded_master_cv',
          rawContent: params.cvExtractedText,
          careerCategory: snapshot.career_category,
          jobTitle: primaryTitle,
          skills: snapshot.skills,
          experienceLevel: snapshot.seniority_level,
          version,
        },
        { persistToDatabase },
      ),
    );
  }

  return results;
}

/**
 * Seeds cached Job & Competency Knowledge + Assessment Rubric Knowledge across all Jobiest disciplines.
 */
export async function ensureSharedCompetencyKnowledgeSeeded(): Promise<void> {
  if (sharedKnowledgeSeeded) return;
  sharedKnowledgeSeeded = true;

  const frameworks: Array<{
    category: string;
    skills: string[];
    text: string;
  }> = [
    {
      category: 'Software Engineering',
      skills: ['TypeScript', 'Python', 'Java', 'Go', 'PostgreSQL', 'APIs', 'Testing', 'Architecture'],
      text: 'Software Engineering Competency Framework: Entry/Junior engineers demonstrate clean code debugging, unit testing, data structures, HTTP/SQL fundamentals, and scoped feature delivery. Mid-level engineers own end-to-end service design, database indexing, observability, and API contracts. Senior/Staff engineers demonstrate distributed systems trade-offs, failure-mode resilience, concurrency safety, latency/cost optimization, and cross-team technical leadership.',
    },
    {
      category: 'Data, Analytics & AI',
      skills: ['SQL', 'Python', 'LangChain', 'LangGraph', 'OpenAI', 'n8n', 'dbt', 'RAG', 'Statistics'],
      text: 'Data, Analytics & AI Competency Framework: Evaluates data modeling, SQL query optimization, cohort/experiment rigor, pipeline idempotency, and AI/LLM agent engineering (RAG chunking, metadata pre-filtering, prompt-injection defense, stateful workflow graphs, hallucination guardrails, evaluation benchmarks, and fallback handling).',
    },
    {
      category: 'Product Management',
      skills: ['Roadmapping', 'Discovery', 'Prioritization', 'Metrics', 'Experimentation', 'Stakeholder Alignment'],
      text: 'Product Management Competency Framework: Evaluates user problem discovery, quantitative opportunity sizing, ruthless scope trade-offs under engineering constraints, counter-metric definition, go-to-market sequencing, and post-launch outcome measurement.',
    },
    {
      category: 'Design & UX Research',
      skills: ['Figma', 'Design Systems', 'Usability Testing', 'Information Architecture', 'Accessibility'],
      text: 'Design & UX Research Competency Framework: Evaluates qualitative and quantitative user research synthesis, interaction flows, WCAG accessibility compliance, design-system token governance, developer handoff fidelity, and measurable usability outcomes.',
    },
    {
      category: 'Cloud, DevOps & Security',
      skills: ['Docker', 'Kubernetes', 'Terraform', 'AWS', 'CI/CD', 'IAM', 'Incident Response', 'Linux'],
      text: 'Cloud, DevOps & Security Competency Framework: Evaluates least-privilege IAM, infrastructure-as-code reproducibility, zero-downtime deployment/rollback strategies, container/network isolation, secret rotation, SLO alerting, and blameless incident root-cause remediation.',
    },
    {
      category: 'Growth, Marketing & Content',
      skills: ['SEO', 'Paid Acquisition', 'CRM', 'Lifecycle Marketing', 'Copywriting', 'Attribution', 'CRO'],
      text: 'Growth, Marketing & Content Competency Framework: Evaluates channel unit economics (CAC, LTV, payback period), attribution hygiene, conversion funnel experimentation, audience segmentation, organic search content architecture, and brand positioning.',
    },
    {
      category: 'Sales, Partnerships & Customer Success',
      skills: ['Discovery Calls', 'Pipeline Management', 'Zendesk', 'CRM', 'Retention', 'Escalation De-escalation'],
      text: 'Sales, Partnerships & Customer Success Competency Framework: Evaluates structured customer discovery, objection diagnosis, SLA triage, empathetic escalation de-escalation, root-cause ticket documentation, renewal risk mitigation, and cross-functional product feedback loops.',
    },
    {
      category: 'Finance, Operations & Strategy',
      skills: ['Financial Modeling', 'Reconciliation', 'FP&A', 'Audit Controls', 'Unit Economics', 'SQL'],
      text: 'Finance, Operations & Strategy Competency Framework: Evaluates cash-flow and variance analysis, internal audit controls, ledger reconciliation accuracy, operational bottleneck elimination, vendor governance, and scenario modeling.',
    },
    {
      category: 'People, Talent & HR',
      skills: ['Structured Interviewing', 'Compensation Benchmarking', 'Employee Relations', 'Onboarding'],
      text: 'People, Talent & HR Competency Framework: Evaluates structured rubric-based hiring, bias mitigation, employment compliance, performance calibration, retention diagnostics, and organizational change management.',
    },
    {
      category: 'Project & Program Management',
      skills: ['Critical Path', 'Risk Register', 'Agile Delivery', 'Dependency Management', 'RAID Logs'],
      text: 'Project & Program Management Competency Framework: Evaluates dependency mapping, critical-path recovery when milestones slip, transparent risk escalation, resource balancing, and executive stakeholder reporting.',
    },
  ];

  for (const fw of frameworks) {
    await ingestDocumentIntoRag({
      namespace: 'JOB_COMPETENCY_KNOWLEDGE',
      candidateId: null,
      documentType: 'COMPETENCY_FRAMEWORK',
      source: `jobiest_competency_framework_${fw.category.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      rawContent: fw.text,
      careerCategory: fw.category,
      skills: fw.skills,
      version: 1,
    });
  }

  await ingestDocumentIntoRag({
    namespace: 'ASSESSMENT_KNOWLEDGE',
    candidateId: null,
    documentType: 'ASSESSMENT_RUBRIC',
    source: 'jobiest_global_scoring_rubric_v1',
    rawContent:
      'Jobiest Scoring Rubric Bands (0-100): 85-100 Exceptional verifiable ownership with concrete trade-offs, metrics, failure recovery, and first-person technical/domain depth. 70-84 Strong practical competence with clear personal contribution and sound reasoning. 50-69 Moderate foundational knowledge with partial examples or team-level generalizations lacking personal decision clarity. 25-49 Surface familiarity or unsubstantiated keyword claims without concrete execution steps. 0-24 Non-responsive, off-topic, or contradicted by basic domain principles. Never penalize accent, grammar variation, speaking pace, or technical audio drops.',
    version: 1,
  });
}

export async function retrieveEvidence(req: RagRetrievalQuery): Promise<RetrievedEvidence[]> {
  await ensureSharedCompetencyKnowledgeSeeded();
  return globalRagIndex.search(req);
}

export function clearCandidateRagMemory(candidateId: string): void {
  globalRagIndex.clearCandidate(candidateId);
}

/**
 * Official LangChain `BaseRetriever` implementation enforcing pre-retrieval candidate isolation.
 */
export class JobiestIsolatedLangChainRetriever extends BaseRetriever {
  lc_namespace = ['jobiest', 'talent_pool', 'retrievers'];

  private readonly namespace: RagNamespace;
  private readonly candidateId: string | null;
  private readonly careerCategory: string | null;
  private readonly experienceLevel: string | null;
  private readonly topK: number;

  constructor(
    fields: BaseRetrieverInput & {
      namespace: RagNamespace;
      candidateId?: string | null;
      careerCategory?: string | null;
      experienceLevel?: string | null;
      topK?: number;
    },
  ) {
    super(fields);
    if (fields.namespace === 'CANDIDATE_KNOWLEDGE' && !fields.candidateId) {
      throw new Error('RAG_ACCESS_DENIED: LangChain retriever requires candidateId for CANDIDATE_KNOWLEDGE.');
    }
    this.namespace = fields.namespace;
    this.candidateId = fields.candidateId ?? null;
    this.careerCategory = fields.careerCategory ?? null;
    this.experienceLevel = fields.experienceLevel ?? null;
    this.topK = fields.topK ?? 6;
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const hits = await retrieveEvidence({
      query,
      namespace: this.namespace,
      candidateId: this.candidateId,
      careerCategory: this.careerCategory,
      experienceLevel: this.experienceLevel,
      topK: this.topK,
    });
    return hits.map(
      (h) =>
        new Document({
          pageContent: h.text,
          metadata: {
            ...h.metadata,
            similarityScore: h.score,
          },
        }),
    );
  }
}
