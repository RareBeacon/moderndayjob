import { supabaseAdmin } from '../../lib/supabase';

const INTERVAL_MS = 60_000;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const { data, error } = await supabaseAdmin.rpc('enqueue_daily_discovery', { p_day: new Date().toISOString().slice(0, 10) });
    if (error) throw error;
    console.log(JSON.stringify({ event: 'daily_discovery_enqueued', created: data, at: new Date().toISOString() }));
  } finally { running = false; }
}

function logSchedulerError(error: unknown) { console.error(JSON.stringify({ event: 'scheduler_error', error: String(error) })); }
async function main() {
  console.log('scheduler worker online');
  await tick().catch(logSchedulerError);
  setInterval(() => { void tick().catch(logSchedulerError); }, INTERVAL_MS);
}
void main();
