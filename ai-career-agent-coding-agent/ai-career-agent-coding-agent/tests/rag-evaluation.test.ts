import { describe, expect, it } from 'vitest';
import {
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  type RankedEvidenceId,
} from '@/lib/ai/evaluation/rag-metrics';
import {
  clearCandidateRagMemory,
  ingestDocumentIntoRag,
  retrieveEvidence,
} from '@/lib/talent-pool/intelligence/rag-engine';

describe('RAG ranking evaluation metrics', () => {
  const ranking: RankedEvidenceId[] = [
    { id: 'weak', relevance: 0 },
    { id: 'strong', relevance: 2 },
    { id: 'related', relevance: 1 },
  ];

  it('computes precision, recall, reciprocal rank, and graded NDCG', () => {
    expect(precisionAtK(ranking, ['strong', 'related'], 3)).toBeCloseTo(2 / 3);
    expect(recallAtK(ranking, ['strong', 'related'], 2)).toBeCloseTo(0.5);
    expect(reciprocalRank(ranking, ['strong'])).toBe(0.5);
    expect(ndcgAtK(ranking, { weak: 0, strong: 2, related: 1 }, 3)).toBeGreaterThan(0.5);
    expect(reciprocalRank(ranking, ['missing'])).toBe(0);
  });

  it('returns zero for invalid cutoffs and empty relevance sets', () => {
    expect(precisionAtK(ranking, ['strong'], 0)).toBe(0);
    expect(recallAtK(ranking, [], 3)).toBe(0);
    expect(ndcgAtK(ranking, {}, 3)).toBe(0);
  });
});

describe('Jobiest RAG retrieval smoke benchmark', () => {
  it('retrieves traceable, relevant candidate evidence while keeping the query candidate-scoped', async () => {
    const candidateId = `eval-candidate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    clearCandidateRagMemory(candidateId);
    const relevantDocumentId = `${candidateId}-cv`;
    try {
      await ingestDocumentIntoRag({
        namespace: 'CANDIDATE_KNOWLEDGE',
        candidateId,
        sourceDocumentId: relevantDocumentId,
        documentType: 'UPLOADED_CV',
        source: 'synthetic_rag_evaluation_fixture',
        rawContent: 'Designed solar photovoltaic rooftop arrays in Lagos and optimized inverter sizing for commercial energy projects.',
        skills: ['solar design', 'photovoltaics', 'inverter sizing'],
      });
      await ingestDocumentIntoRag({
        namespace: 'CANDIDATE_KNOWLEDGE',
        candidateId,
        sourceDocumentId: `${candidateId}-other`,
        documentType: 'EMPLOYMENT_HISTORY',
        source: 'synthetic_rag_evaluation_fixture',
        rawContent: 'Coordinated marine biology reef ecology surveys and catalogued coral species around coastal habitats.',
        skills: ['marine biology', 'ecology'],
      });

      const evidence = await retrieveEvidence({
        namespace: 'CANDIDATE_KNOWLEDGE',
        candidateId,
        query: 'solar photovoltaic rooftop arrays inverter sizing',
        topK: 5,
      });
      const ranked = evidence.map((item) => ({ id: item.documentId }));
      const relevant = [relevantDocumentId];

      expect(evidence.length).toBeGreaterThan(0);
      expect(evidence.every((item) => item.metadata.candidateId === candidateId)).toBe(true);
      expect(evidence.every((item) => item.metadata.source === 'synthetic_rag_evaluation_fixture')).toBe(true);
      expect(recallAtK(ranked, relevant, 5)).toBe(1);
      expect(reciprocalRank(ranked, relevant)).toBeGreaterThan(0);
      expect(evidence.find((item) => item.documentId === relevantDocumentId)?.metadata.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      clearCandidateRagMemory(candidateId);
    }
  });
});
