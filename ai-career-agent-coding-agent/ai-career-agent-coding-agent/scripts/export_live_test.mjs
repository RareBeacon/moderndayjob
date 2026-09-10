// Live E2E test for GET /api/documents/[id]/export?format=pdf|docx
// Creates two throwaway users, generates a CV row for user B, then verifies:
//   1. unauthenticated -> 401
//   2. authenticated owner -> 200, %PDF / PK magic, attachment headers
//   3. authenticated NON-owner -> 404 (IDOR-safe)
// Then deletes both users (cascade removes profiles + generated_documents).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, '..');

const env = Object.fromEntries(
  readFileSync(join(appDir, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE_ORIGIN = 'https://jobiest.com';
const REF = new URL(SUPABASE_URL).hostname.split('.')[0]; // cbxloutahmalorumaihc

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');
// Mirrors @supabase/ssr ChunkedCookieStorageAdapter (createChunks, MAX_CHUNK_SIZE=3180)
function sessionCookieHeader(name, sessionJson) {
  const value = 'base64-' + b64url(sessionJson);
  const encoded = encodeURIComponent(value);
  const parts = [];
  if (encoded.length <= 3180) {
    parts.push(`${name}=${value}`);
  } else {
    let remaining = encoded;
    let i = 0;
    while (remaining.length > 0) {
      let head = remaining.slice(0, 3180);
      const lastEscape = head.lastIndexOf('%');
      if (lastEscape > 3180 - 3) head = head.slice(0, lastEscape);
      while (head.length > 0) {
        try { decodeURIComponent(head); break; }
        catch { head = head.slice(0, head.length - 3); }
      }
      parts.push(`${name}.${i}=${decodeURIComponent(head)}`);
      remaining = remaining.slice(head.length);
      i++;
    }
  }
  return parts.join('; ');
}

async function api(path, { key, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

const results = [];
const fail = (msg) => { console.error('✗ ' + msg); process.exitCode = 1; };
const pass = (msg) => console.log('✓ ' + msg);

const stamp = Date.now().toString(36);
const mk = () => `export.test.${stamp}.${Math.random().toString(36).slice(2, 8)}@example.com`;

async function main() {
  // 1) create user A (owner) and user B (victim)
  const uA = await api('/auth/v1/admin/users', {
    key: SERVICE_ROLE, method: 'POST',
    body: { email: mk(), password: 'S3cure-password!1', email_confirm: true },
  });
  const uB = await api('/auth/v1/admin/users', {
    key: SERVICE_ROLE, method: 'POST',
    body: { email: mk(), password: 'S3cure-password!1', email_confirm: true },
  });
  console.log('created users:', uA.id, uB.id);

  // 2) sign in as B (owner of the document) to get a session
  const signin = await api('/auth/v1/token?grant_type=password', {
    key: ANON_KEY, method: 'POST',
    body: { email: uB.email, password: 'S3cure-password!1' },
  });
  const sessionJson = JSON.stringify(signin);

  // 3) insert a realistic CV row for user B via service role
  const content = JSON.stringify({
    headline: 'Senior Full-Stack Engineer',
    summary: 'Engineer with 8 years in fintech.',
    experiences: [
      { company: 'Paystack', title: 'Senior Engineer', start: '2021', end: '2024',
        bullets: ['Cut API p95 latency by 40 percent.', 'Led a team of five.'] },
    ],
    skills: ['TypeScript', 'React', 'Node.js'],
    education: [{ institution: 'University of Lagos', qualification: 'BSc Computer Science' }],
  });
  const row = await api('/rest/v1/generated_documents', {
    key: SERVICE_ROLE, method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: {
      user_id: uB.id, kind: 'CV', title: 'Senior Full-Stack Engineer',
      content, content_hash: createHash('sha256').update(content).digest('hex'),
      source_facts: {}, version: 1, is_active: true,
    },
  });
  const inserted = Array.isArray(row) ? row[0] : row;
  console.log('generated_documents row id:', inserted.id);

  const authCookie = sessionCookieHeader(`sb-${REF}-auth-token`, sessionJson);

  // 4) unauthenticated -> 401
  {
    const res = await fetch(`${LIVE_ORIGIN}/api/documents/${inserted.id}/export?format=pdf`);
    if (res.status !== 401) fail(`unauthenticated export expected 401, got ${res.status}`);
    else pass('unauthenticated export -> 401');
  }

  // 5) owner -> 200 PDF with %PDF magic + attachment
  {
    const res = await fetch(`${LIVE_ORIGIN}/api/documents/${inserted.id}/export?format=pdf`, {
      headers: { Cookie: authCookie },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') ?? '';
    const cd = res.headers.get('content-disposition') ?? '';
    mkdirSync('/home/user/outputs', { recursive: true });
    writeFileSync('/home/user/outputs/export_live_test.pdf', buf);
    const ok = res.status === 200 && buf.subarray(0, 4).toString() === '%PDF'
      && ct.includes('application/pdf') && cd.includes('attachment');
    if (!ok) fail(`owner PDF export: status=${res.status} ct=${ct} cd=${cd} magic=${buf.subarray(0, 4).toString()}`);
    else pass(`owner PDF export -> 200, %PDF (${buf.length} bytes), attachment filename="${cd.match(/filename="([^"]+)"/)?.[1]}"`);
  }

  // 6) owner -> 200 DOCX with PK magic
  {
    const res = await fetch(`${LIVE_ORIGIN}/api/documents/${inserted.id}/export?format=docx`, {
      headers: { Cookie: authCookie },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') ?? '';
    const cd = res.headers.get('content-disposition') ?? '';
    writeFileSync('/home/user/outputs/export_live_test.docx', buf);
    const ok = res.status === 200 && buf.subarray(0, 2).toString() === 'PK'
      && ct.includes('wordprocessingml') && cd.includes('attachment');
    if (!ok) fail(`owner DOCX export: status=${res.status} ct=${ct} cd=${cd} magic=${buf.subarray(0, 2).toString()}`);
    else pass(`owner DOCX export -> 200, PK zip (${buf.length} bytes), attachment filename="${cd.match(/filename="([^"]+)"/)?.[1]}"`);
  }

  // 7) bad format -> 400
  {
    const res = await fetch(`${LIVE_ORIGIN}/api/documents/${inserted.id}/export?format=xlsx`, {
      headers: { Cookie: authCookie },
    });
    if (res.status !== 400) fail(`invalid format expected 400, got ${res.status}`);
    else pass('invalid format -> 400');
  }

  // 8) IDOR: user A (non-owner) must NOT read B's document -> 404
  {
    const signinA = await api('/auth/v1/token?grant_type=password', {
      key: ANON_KEY, method: 'POST',
      body: { email: uA.email, password: 'S3cure-password!1' },
    });
    const cookieA = sessionCookieHeader(`sb-${REF}-auth-token`, JSON.stringify(signinA));
    const res = await fetch(`${LIVE_ORIGIN}/api/documents/${inserted.id}/export?format=pdf`, {
      headers: { Cookie: cookieA },
    });
    if (res.status !== 404) fail(`cross-user export expected 404, got ${res.status}`);
    else pass('non-owner export -> 404 (ownership enforced)');
  }

  // 9) cleanup: delete both users (cascade removes profiles + generated_documents)
  await api(`/auth/v1/admin/users/${uA.id}`, { key: SERVICE_ROLE, method: 'DELETE' });
  await api(`/auth/v1/admin/users/${uB.id}`, { key: SERVICE_ROLE, method: 'DELETE' });
  pass('cleanup: deleted test users (cascade)');
}

main().catch((e) => { console.error('SCRIPT ERROR:', e.message); process.exitCode = 1; });
