/**
 * SEO keyword seeder (Workstream A, Stage 2).
 *
 * Seeds the keyword database from an observed autocomplete dataset
 * (scripts/seo/data/*.json produced by collect-autocomplete.mjs).
 *
 * Dual mode:
 *  - full mode: when migration 028 has been applied, inserts every
 *    keyword x market row with the complete A5.3 schema.
 *  - legacy mode: before 028, inserts one row per unique keyword using
 *    only the pre-existing columns, with market list embedded in
 *    research_source. Re-run after applying 028 to add per-market rows
 *    and structured fields.
 *
 * Honesty rules: search_volume and difficulty are always 'Unknown'
 * (no volume source is accessible); confidence_level is 'Qualitative'.
 * Idempotent: uses ON CONFLICT DO NOTHING semantics via PostgREST.
 *
 * Usage: node scripts/seo/seed-keywords.mjs scripts/seo/data/keywords-2026-09-20.json
 */
import { readFileSync } from "node:fs";

function env(name) {
  const raw = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  const m = raw.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "") : undefined;
}

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing Supabase config in .env.local");

const BLOG = "https://jobiest.com/blog/";
const ARTICLES = {
  atsFormat: `${BLOG}ats-friendly-resume-format-checklist`,
  atsProblem: `${BLOG}ats-problem-how-to-fix-it`,
  coverLetter: `${BLOG}cover-letter-from-resume-and-job-description`,
  coverLetterAi: `${BLOG}free-ai-cover-letter-generator-guide`,
  linkedinHeadline: `${BLOG}linkedin-headline-generator-recruiter-search`,
  linkedinAbout: `${BLOG}linkedin-about-summary-generator-guide`,
  interviewQuestions: `${BLOG}interview-question-generator-job-description`,
  interviewStar: `${BLOG}star-interview-answers-job-description`,
  salary: `${BLOG}salary-insights-from-job-listings`,
  skillsGap: `${BLOG}skills-gap-analysis-job-description`,
  jobDescription: `${BLOG}free-job-description-analyzer-guide`,
  matchScore: `${BLOG}resume-match-score-meaning`,
  followUp: `${BLOG}follow-up-email-after-job-application`,
  callbacks: `${BLOG}why-you-are-not-getting-interview-callbacks`,
  aiResumeBuilder: `${BLOG}ai-resume-builder-live-preview`,
  keywordsFind: `${BLOG}find-resume-keywords-in-job-description`,
  keywordsScan: `${BLOG}resume-keyword-scanner-job-description`,
  templateLibrary: `${BLOG}resume-template-library-choose-ats-friendly-template`,
  resumeSummary: `${BLOG}resume-summary-generator-verified-facts`,
  careerPath: `${BLOG}career-path-explorer-skills-to-roles`,
  agent: `${BLOG}job-application-agent-keep-context`,
  tailoredCv: `${BLOG}tailored-cv-without-two-hours-per-application`,
  atsScanner: `${BLOG}free-ats-resume-scanner-guide`,
};

/** Map a keyword to an existing Jobiest URL when one genuinely covers it. */
function mapExistingUrl(kw) {
  const s = kw.toLowerCase();
  if (/ats/.test(s) && /scanner|check|score/.test(s)) return ARTICLES.atsScanner;
  if (/ats/.test(s) && /(resume|cv|format)/.test(s)) return ARTICLES.atsFormat;
  if (/cover letter/.test(s) && /(generator|ai|free)/.test(s)) return ARTICLES.coverLetterAi;
  if (/cover letter/.test(s)) return ARTICLES.coverLetter;
  if (/linkedin/.test(s) && /headline/.test(s)) return ARTICLES.linkedinHeadline;
  if (/linkedin/.test(s) && /(about|summary)/.test(s)) return ARTICLES.linkedinAbout;
  if (/interview/.test(s) && /(question|generator)/.test(s)) return ARTICLES.interviewQuestions;
  if (/interview/.test(s) && /(star|answer)/.test(s)) return ARTICLES.interviewStar;
  if (/salary/.test(s)) return ARTICLES.salary;
  if (/skills gap/.test(s)) return ARTICLES.skillsGap;
  if (/job description/.test(s) && /(analyz|analysis)/.test(s)) return ARTICLES.jobDescription;
  if (/match score/.test(s)) return ARTICLES.matchScore;
  if (/follow.?up/.test(s)) return ARTICLES.followUp;
  if (/callback/.test(s)) return ARTICLES.callbacks;
  if (/(ai resume builder|resume builder ai)/.test(s)) return ARTICLES.aiResumeBuilder;
  if (/keyword/.test(s) && /scanner/.test(s)) return ARTICLES.keywordsScan;
  if (/keyword/.test(s) && /job description/.test(s)) return ARTICLES.keywordsFind;
  if (/(resume|cv)\s*template/.test(s) || /template/.test(s)) return ARTICLES.templateLibrary;
  if (/resume summary|professional summary/.test(s)) return ARTICLES.resumeSummary;
  if (/career path/.test(s)) return ARTICLES.careerPath;
  if (/(job application agent|job search agent|application agent)/.test(s)) return ARTICLES.agent;
  if (/tailored (cv|resume)/.test(s)) return ARTICLES.tailoredCv;
  return null;
}

function conversionRelevance(kw) {
  const s = kw.toLowerCase();
  if (/(resume|cv|cover letter|linkedin|ats|interview|salary|keyword|agent|builder|template|match score|career path)/.test(s)) return "HIGH";
  if (/(job|remote|work from home|career)/.test(s)) return "MEDIUM";
  return "LOW";
}

async function api(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

async function main() {
  const datasetPath = process.argv[2];
  if (!datasetPath) throw new Error("Usage: node scripts/seo/seed-keywords.mjs <dataset.json>");
  const rows = JSON.parse(readFileSync(new URL(datasetPath, `file://${process.cwd()}/`), "utf8"));
  console.log(`dataset: ${rows.length} observed rows`);

  const proj = await api("/rest/v1/seo_projects?select=id&limit=1");
  if (proj.status !== 200 || !proj.body?.length) throw new Error(`Could not read seo_projects: ${proj.status}`);
  const projectId = proj.body[0].id;
  console.log(`project: ${String(projectId).slice(0, 8)}...`);

  // Probe whether migration 028 columns exist.
  const probe = await api("/rest/v1/seo_keywords?select=country&limit=1");
  const fullMode = probe.status === 200;
  console.log(`mode: ${fullMode ? "full (migration 028 applied)" : "legacy (run migration 028 to enable per-market structured rows)"}`);

  // Group by keyword for legacy dedupe.
  const byKeyword = new Map();
  for (const r of rows) {
    if (!byKeyword.has(r.keyword)) byKeyword.set(r.keyword, []);
    byKeyword.get(r.keyword).push(r);
  }
  console.log(`unique keywords: ${byKeyword.size}`);

  const toInsert = [];
  for (const [keyword, marketRows] of byKeyword) {
    const first = marketRows[0];
    const markets = [...new Set(marketRows.map((m) => m.country))];
    const base = {
      project_id: projectId,
      keyword,
      intent: first.search_intent.toLowerCase(),
      priority: conversionRelevance(keyword) === "HIGH" ? "HIGH" : "MEDIUM",
      target_url: mapExistingUrl(keyword),
      business_value: conversionRelevance(keyword),
      content_type: "blog_post",
      status: mapExistingUrl(keyword) ? "PUBLISHED" : "PLANNED",
      research_source: `google_autocomplete_2026-09-20_markets_${markets.join("-")}`,
      metric_source: "unavailable_no_gsc_or_paid_keyword_volume",
      metric_confidence: "qualitative_autocomplete_observation",
      source_timestamp: "2026-09-20T00:00:00Z",
    };
    if (fullMode) {
      for (const r of marketRows) {
        const mapped = mapExistingUrl(keyword);
        toInsert.push({
          ...base,
          query_source: r.query_source,
          source_url: r.source_url,
          collection_date: r.collection_date,
          country: r.country,
          language: r.language,
          search_intent: r.search_intent,
          search_volume: "Unknown",
          volume_source: "Unknown",
          difficulty: "Unknown",
          difficulty_source: "Unknown",
          existing_jobiest_url: mapped,
          content_opportunity: mapped ? "update_existing_article" : "blog_post",
          conversion_relevance: conversionRelevance(keyword),
          confidence_level: "Qualitative",
          recommended_action: mapped ? "Update" : "Create",
          seed_query: r.seed_query,
        });
      }
    } else {
      toInsert.push(base);
    }
  }

  let inserted = 0;
  let skipped = 0;
  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const res = await api("/rest/v1/seo_keywords", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
    if (res.status === 201) {
      inserted += batch.length;
    } else if (res.status === 409) {
      skipped += batch.length;
    } else {
      console.error(`batch ${i / BATCH} failed: ${res.status}`, JSON.stringify(res.body).slice(0, 300));
      process.exit(1);
    }
  }
  console.log(`done: ${inserted} rows accepted (conflicts ignored), ${skipped} conflicts`);
}

main().catch((e) => { console.error(e); process.exit(1); });
