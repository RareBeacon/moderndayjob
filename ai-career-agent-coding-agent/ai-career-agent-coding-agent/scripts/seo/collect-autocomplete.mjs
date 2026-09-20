/**
 * SEO keyword observation collector (Workstream A, Stage 2).
 *
 * Collects real Google autocomplete suggestions per market for the Jobiest
 * seed queries defined in the Master Upgrade brief (A5.2). Every row produced
 * is an observation, never a volume estimate: search_volume stays "Unknown",
 * confidence is "Qualitative", and the source URL is the public suggest
 * endpoint that was queried. Output: JSON rows on stdout ready for seeding.
 *
 * Usage: node scripts/seo/collect-autocomplete.mjs > /tmp/autocomplete.json
 */
const ENDPOINT = "https://suggestqueries.google.com/complete/search";
const COLLECTED_ON = new Date().toISOString().slice(0, 10);

const MARKETS = [
  { country: "NG", gl: "ng", hl: "en" },
  { country: "GB", gl: "uk", hl: "en" },
  { country: "US", gl: "us", hl: "en" },
  { country: "CA", gl: "ca", hl: "en" },
];

// Seed queries from the brief (A5.2). grouped by category.
const NG_SEEDS = [
  // Resume & CV
  "cv templates nigeria", "resume templates", "cv writing guide", "ats-friendly resume",
  "resume builder free", "cv format nigeria", "professional cv examples", "graduate cv nigeria",
  "entry-level resume", "career-specific resume templates", "cv review tool", "resume improvement tips",
  // Job Discovery
  "remote jobs nigeria", "graduate jobs nigeria", "entry-level jobs", "jobs in nigeria",
  "international remote jobs for nigerians", "job search tools", "job application help",
  "work from home jobs nigeria", "online jobs nigeria",
  // Career Development
  "interview preparation tips", "career planning guide", "career assessment free",
  "professional skills development", "job application preparation", "career change advice",
  "how to get a job in nigeria",
  // Product (real features only)
  "free career tools", "resume analysis tool", "ai job search", "job search automation",
  "ai resume builder",
];

// Generic seeds also run in secondary markets; cv/resume split reflects market vocabulary.
const SECONDARY_SEEDS = [
  "resume templates", "ats-friendly resume", "resume builder free", "cv templates",
  "entry-level resume", "interview preparation tips", "career change advice",
  "ai resume builder", "job search tools", "remote jobs", "graduate cv", "cover letter",
];

const NON_ENGLISH_TOKENS = ["formato", "modelo", "curriculum vitae plantilla", "lebenslauf", "cv haz"];

function classifyIntent(q) {
  const s = q.toLowerCase();
  if (/^(jobiest|google|linkedin)\b/.test(s) || /login|sign in/.test(s)) return "Navigational";
  if (/^how to|^what is|^why|^when|^who|^guide|^tips|^examples?|^meaning|^checklist|^difference/.test(s)) return "Informational";
  if (/\b(best|top|vs|compare|review|alternative)\b/.test(s)) return "Commercial";
  if (/\b(free|download|create|build|make|write|template|format|pdf)\b/.test(s) && /\b(free|download|create|build|make)\b/.test(s)) return "Transactional";
  return "Informational";
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function collect(seed, market) {
  const url = `${ENDPOINT}?client=firefox&hl=${market.hl}&gl=${market.gl}&q=${encodeURIComponent(seed)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.[1]) ? data[1] : [];
    return list.filter((s) => typeof s === "string" && s.length <= 80 && !NON_ENGLISH_TOKENS.some((t) => s.toLowerCase().includes(t)));
  } catch {
    return [];
  }
}

const rows = [];
const seen = new Set();
for (const market of MARKETS) {
  const seeds = market.country === "NG" ? NG_SEEDS : SECONDARY_SEEDS;
  for (const seed of seeds) {
    const suggestions = await collect(seed, market);
    for (const s of suggestions.slice(0, 8)) {
      const key = `${market.country}|${s.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        keyword: s,
        query_source: "google_autocomplete",
        source_url: `${ENDPOINT}?client=firefox&hl=${market.hl}&gl=${market.gl}`,
        collection_date: COLLECTED_ON,
        country: market.country,
        language: "en",
        search_intent: classifyIntent(s),
        search_volume: "Unknown",
        volume_source: "Unknown",
        difficulty: "Unknown",
        difficulty_source: "Unknown",
        seed_query: seed,
      });
    }
    await sleep(250);
  }
}
process.stdout.write(JSON.stringify(rows, null, 2));
process.stderr.write(`collected ${rows.length} unique keyword observations\n`);
