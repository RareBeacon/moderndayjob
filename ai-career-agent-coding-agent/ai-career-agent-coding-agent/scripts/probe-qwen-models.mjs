#!/usr/bin/env node
/**
 * Jobiest Live Alibaba QwenCloud / DashScope Model Probe & Tier Selector
 *
 * Security guarantees:
 *   - Reads `QWENCLOUD_API_KEY` or `DASHSCOPE_API_KEY` from environment ONLY.
 *   - NEVER prints, logs, or writes the raw API key to stdout, stderr, or disk.
 *
 * Usage:
 *   QWENCLOUD_API_KEY="sk-ws-..." node scripts/probe-qwen-models.mjs
 */

const apiKey = (process.env.QWENCLOUD_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim();
if (!apiKey) {
  console.error('Error: Set QWENCLOUD_API_KEY or DASHSCOPE_API_KEY in your environment first.');
  process.exit(1);
}

const explicitBase = (process.env.DASHSCOPE_BASE_URL || '').trim().replace(/\/+$/, '');
const endpoints = explicitBase
  ? [explicitBase]
  : apiKey.startsWith('sk-ws-')
    ? [
        'https://maas.qwencloudapi.com/compatible-mode/v1',
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
      ]
    : [
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        'https://maas.qwencloudapi.com/compatible-mode/v1',
        'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
      ];

const CANDIDATE_MODELS = [
  { id: 'qwen3.8-max', role: 'Flagship (Talent Pool Blueprint, Rubric Eval, Master CVs)', body: { reasoning_effort: 'low' } },
  { id: 'qwen3.7-plus', role: 'Standard Workhorse (Job Match, Cover Letters, Career Paths)', body: { enable_thinking: false } },
  { id: 'qwen3.8-flash', role: 'Fast / Public Tier (Live Interview Turns, Free Tools, Support Chat)', body: { enable_thinking: false } },
  { id: 'deepseek-v4-pro-0813', role: 'Flagship Backup (Separate Free Quota Pool)', body: { enable_thinking: false } },
  { id: 'deepseek-v4.1-flash', role: 'Fast Backup (Separate Free Quota Pool)', body: { enable_thinking: false } },
];

async function detectWinningEndpoint() {
  for (const base of endpoints) {
    try {
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const json = await res.json();
        const ids = Array.isArray(json?.data) ? json.data.map((m) => m.id) : [];
        return { base, models: ids };
      }
    } catch {
      // Try next regional endpoint.
    }
  }
  return null;
}

async function probeChatModel(base, entry) {
  const t0 = Date.now();
  const payload = {
    model: entry.id,
    messages: [{ role: 'user', content: 'Return JSON: {"ok":true}' }],
    response_format: { type: 'json_object' },
    max_tokens: 24,
    temperature: 0,
    ...entry.body,
  };
  try {
    let res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok && res.status === 400) {
      const retryPayload = { ...payload };
      delete retryPayload.enable_thinking;
      delete retryPayload.reasoning_effort;
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(retryPayload),
        signal: AbortSignal.timeout(20_000),
      });
    }
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return { id: entry.id, ok: false, status: res.status, latencyMs, role: entry.role };
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? '';
    return { id: entry.id, ok: content.includes('true'), status: 200, latencyMs, role: entry.role };
  } catch {
    return { id: entry.id, ok: false, status: 0, latencyMs: Date.now() - t0, role: entry.role };
  }
}

const detected = await detectWinningEndpoint();
if (!detected) {
  console.error('Could not authenticate against QwenCloud / DashScope endpoints. Verify key status and region.');
  process.exit(2);
}

console.log(`Connected endpoint: ${detected.base}`);
console.log(`Catalog models exposed on key: ${detected.models.length}`);

const results = [];
for (const entry of CANDIDATE_MODELS) {
  results.push(await probeChatModel(detected.base, entry));
}

console.table(
  results.map((r) => ({
    Model: r.id,
    Reachable: r.ok ? 'YES' : `NO (${r.status})`,
    LatencyMs: r.latencyMs,
    AssignedRole: r.role,
  })),
);

const pick = (preferred, fallback) =>
  results.find((r) => r.id === preferred && r.ok)?.id ||
  results.find((r) => r.id === fallback && r.ok)?.id ||
  preferred;

console.log('\nRecommended Vercel / Server Environment Variables (paste with your rotated key):');
console.log(`DASHSCOPE_BASE_URL=${detected.base}`);
console.log('QWENCLOUD_API_KEY=<paste-fresh-rotated-key-in-vercel-only>');
console.log(`QWEN_FLAGSHIP_MODEL=${pick('qwen3.8-max', 'deepseek-v4-pro-0813')}`);
console.log(`QWEN_STANDARD_MODEL=${pick('qwen3.7-plus', 'qwen3.8-max')}`);
console.log(`QWEN_FAST_MODEL=${pick('qwen3.8-flash', 'deepseek-v4.1-flash')}`);
console.log('QWEN_ASR_MODEL=qwen3-asr-flash');
