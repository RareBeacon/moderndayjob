/** Seeds support_kb_entries from the code-defined KB (idempotent). */
import { KB_ENTRIES } from '../../lib/support/kb';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  const db = createClient(url, key, { auth: { persistSession: false } });
  const rows = KB_ENTRIES.map((entry) => ({
    id: entry.id,
    question: entry.question,
    answer_md: entry.answerMd,
    topics: entry.topics,
    live_url_verified: true,
    verified_at: '2026-09-21T00:00:00Z',
  }));
  const { error } = await db.from('support_kb_entries').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(error.message);
  console.log(`seeded ${rows.length} KB entries`);
}
main().catch((e) => { console.error(e); process.exit(1); });
