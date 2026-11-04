/** Small, dependency-free ranking metrics for offline RAG retrieval evaluation. */
export interface RankedEvidenceId {
  id: string;
  /** Optional graded relevance from 0 (irrelevant) to any positive value. */
  relevance?: number;
}

function safeK(k: number): number {
  if (!Number.isFinite(k) || k < 1) return 0;
  return Math.floor(k);
}

function relevantSet(relevantIds: ReadonlySet<string> | readonly string[]): Set<string> {
  return relevantIds instanceof Set ? new Set(relevantIds) : new Set(relevantIds);
}

export function precisionAtK(
  ranked: readonly RankedEvidenceId[],
  relevantIds: ReadonlySet<string> | readonly string[],
  k: number,
): number {
  const n = safeK(k);
  if (!n) return 0;
  const relevant = relevantSet(relevantIds);
  return ranked.slice(0, n).filter((item) => relevant.has(item.id)).length / n;
}

export function recallAtK(
  ranked: readonly RankedEvidenceId[],
  relevantIds: ReadonlySet<string> | readonly string[],
  k: number,
): number {
  const n = safeK(k);
  const relevant = relevantSet(relevantIds);
  if (!n || relevant.size === 0) return 0;
  const found = new Set(ranked.slice(0, n).map((item) => item.id));
  let hits = 0;
  for (const id of relevant) if (found.has(id)) hits += 1;
  return hits / relevant.size;
}

export function reciprocalRank(
  ranked: readonly RankedEvidenceId[],
  relevantIds: ReadonlySet<string> | readonly string[],
): number {
  const relevant = relevantSet(relevantIds);
  const index = ranked.findIndex((item) => relevant.has(item.id));
  return index < 0 ? 0 : 1 / (index + 1);
}

export function ndcgAtK(
  ranked: readonly RankedEvidenceId[],
  relevanceById: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  k: number,
): number {
  const n = safeK(k);
  if (!n) return 0;
  const isMap = typeof (relevanceById as ReadonlyMap<string, number>).get === 'function';
  const getRelevance = (id: string) => isMap
    ? Math.max(0, (relevanceById as ReadonlyMap<string, number>).get(id) ?? 0)
    : Math.max(0, (relevanceById as Readonly<Record<string, number>>)[id] ?? 0);
  const dcg = ranked.slice(0, n).reduce((sum, item, index) => {
    const gain = 2 ** getRelevance(item.id) - 1;
    return sum + gain / Math.log2(index + 2);
  }, 0);
  const ideal = [...(isMap
    ? (relevanceById as ReadonlyMap<string, number>).values()
    : Object.values(relevanceById as Readonly<Record<string, number>>))]
    .map((value) => Math.max(0, value))
    .sort((a, b) => b - a)
    .slice(0, n)
    .reduce((sum, value, index) => sum + (2 ** value - 1) / Math.log2(index + 2), 0);
  return ideal === 0 ? 0 : dcg / ideal;
}
