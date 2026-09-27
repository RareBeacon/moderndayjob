import { SITE_URL } from '@/lib/site';

/**
 * IndexNow (2026-09-25, "Microsoft SEO" pass): an open protocol pushed by
 * Microsoft/Bing (also consumed by Seznam and Yandex) that lets a site owner
 * announce new or changed URLs the moment they change, instead of waiting for
 * the crawler to rediscover them. It is key-based: the key below is PUBLIC by
 * design and must be served at /<key>.txt (see public/56df563861da867163227d1fc1876a7f.txt);
 * possession of the key file proves ownership of the host.
 *
 * This is an announcement channel only: it tells Bing a URL changed. It does
 * not and cannot force ranking, and it never fabricates indexing status.
 * Best-effort: a failed ping must never break the SEO daily loop.
 */
const INDEXNOW_KEY = '56df563861da867163227d1fc1876a7f';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

export async function indexNowSubmit(urls: string[]): Promise<{ submitted: number; ok: boolean; status?: number; error?: string }> {
  if (urls.length === 0) return { submitted: 0, ok: true };
  const host = new URL(SITE_URL).host;
  const batch = urls.slice(0, 10000);
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: batch,
      }),
      signal: AbortSignal.timeout(10000),
    });
    // 200 = accepted, 202 = accepted (key check pending), 422/400 = rejected.
    return { submitted: batch.length, ok: res.status === 200 || res.status === 202, status: res.status };
  } catch (error) {
    return { submitted: 0, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The evergreen URLs announced on every daily loop run (home + tools). */
export function corePublicUrls(): string[] {
  return [
    `${SITE_URL}/`,
    `${SITE_URL}/how-it-works`,
    `${SITE_URL}/pricing`,
    `${SITE_URL}/about`,
    `${SITE_URL}/blog`,
    `${SITE_URL}/free-ats-resume-scanner`,
    `${SITE_URL}/free-job-description-analyzer`,
    `${SITE_URL}/free-skills-matcher`,
    `${SITE_URL}/free-resume-summary-generator`,
    `${SITE_URL}/free-cover-letter-writer`,
    `${SITE_URL}/free-follow-up-email-writer`,
    `${SITE_URL}/free-interview-question-generator`,
    `${SITE_URL}/free-linkedin-headline-builder`,
    `${SITE_URL}/free-salary-insights`,
    `${SITE_URL}/free-career-path-explorer`,
  ];
}
