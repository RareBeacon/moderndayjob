/**
 * Keyword research panel view helpers (Master Upgrade Workstream A, A11.1).
 *
 * Pure functions: they map database rows to display fields without touching
 * the network, so they are unit-testable and shared by the admin panel.
 * Honesty rules: volumes and difficulty are "Unknown" unless a real source
 * provided them; nothing here ever derives or fabricates a number.
 */

export interface KeywordRowView {
  keyword: string;
  intent: string;
  country: string;
  volume: string;
  difficulty: string;
  confidence: string;
  researchDate: string;
  opportunity: string;
  existingUrl: string | null;
  source: string;
}

export interface KeywordResearchSummary {
  total: number;
  byConfidence: Record<string, number>;
  byOpportunity: Record<string, number>;
  byCountry: Record<string, number>;
  byIntent: Record<string, number>;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function firstDate(...values: unknown[]): string {
  for (const value of values) {
    const s = str(value);
    if (s) return s.slice(0, 10);
  }
  return '';
}

function capitalize(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function increment(map: Record<string, number>, key: string): void {
  const k = key || 'Unknown';
  map[k] = (map[k] ?? 0) + 1;
}

/** Derive the confidence tier honestly from whatever fields the row has. */
function rowConfidence(row: Record<string, unknown>): string {
  const explicit = str(row.confidence_level);
  if (explicit) return explicit;
  const researchSource = str(row.research_source);
  const metricConfidence = str(row.metric_confidence);
  if (/gsc|search console|webmasters/i.test(`${researchSource} ${metricConfidence}`)) return 'Observed';
  if (/autocomplete|serp|people also ask|trend/i.test(researchSource)) return 'Qualitative';
  if (researchSource || metricConfidence) return 'Qualitative';
  return 'Hypothesis';
}

/** Map one seo_keywords row to the A11.1 panel columns. */
export function keywordRowView(row: Record<string, unknown>): KeywordRowView {
  const researchSource = str(row.research_source);
  let country = str(row.country);
  if (!country) {
    const markets = researchSource.match(/markets_([A-Z-]+)/);
    country = markets ? markets[1].split('-').join(', ') : '';
  }
  const keyword = str(row.keyword);
  const recommended = str(row.recommended_action);
  const status = str(row.status);
  return {
    keyword,
    intent: capitalize(str(row.search_intent) || str(row.intent)) || 'Unknown',
    country,
    volume: str(row.search_volume) || 'Unknown',
    difficulty: str(row.difficulty) || 'Unknown',
    confidence: rowConfidence(row),
    researchDate: firstDate(row.collection_date, row.source_timestamp, row.created_at),
    opportunity: recommended || (status === 'PUBLISHED' ? 'Update' : 'Create'),
    existingUrl: str(row.existing_jobiest_url) || str(row.target_url) || null,
    source: str(row.query_source) || researchSource || 'Unknown',
  };
}

/** Aggregate keyword views for the summary stats. */
export function summarizeKeywordResearch(views: KeywordRowView[]): KeywordResearchSummary {
  const summary: KeywordResearchSummary = {
    total: views.length,
    byConfidence: {},
    byOpportunity: {},
    byCountry: {},
    byIntent: {},
  };
  for (const view of views) {
    increment(summary.byConfidence, view.confidence);
    increment(summary.byOpportunity, view.opportunity);
    increment(summary.byCountry, view.country);
    increment(summary.byIntent, view.intent);
  }
  return summary;
}
