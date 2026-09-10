# Render vs Oracle for the browser automation worker — full study & decision

Date: 2026-09-10 · Status: DECIDED · Owner: Jobiest

## 1. Executive summary

**Decision: Oracle is the primary host for the browser automation worker.
Render stays as a free warm standby, with automatic health-checked failover in
the app. Neither platform alone can "guarantee" uptime at $0 — the guarantee
comes from the pair plus failover, not from any single host.**

- **Primary — Oracle VM** (`https://worker.jobiest.com`): always-on, 2 OCPU /
  12 GB, dedicated egress IP, full firewall control, measured Playwright 1.62.1
  with ~10 GB free RAM. No cold starts, no shared "scraping" IP reputation.
- **Standby — Render free** (`https://jobiest-browser-worker.onrender.com`):
  kept only as failover. Its cold-start and 512 MB limits make it a *bad*
  primary but an acceptable last-resort standby.
- **Failover logic** is implemented in `lib/apply/client.ts`: the app probes
  each worker's `/healthz` (2.5 s) and submits to the first healthy worker,
  falling through on network failure. All workers down ⇒ safe `STOP` (never a
  crash, never a retry storm).

The single biggest risk to "always works" is the Oracle trial expiry
(~2026-10-07). That is mitigated by the already-armed A1 free-tier retry loop
(permanent-free migration target), the Render standby, the kill-switch cron,
and the AWS $100 credit held in reserve (user-authorized only).

---

## 2. What the automation actually needs

From `workers/browser/index.ts` (unchanged by this study):

- Runs **headless Chromium via Playwright** (`chromium.launch` with
  `--no-sandbox --disable-dev-shm-usage`) — each submission launches a browser,
  so the host needs **≥ 512 MB–1 GB of spare RAM and enough CPU** for one
  short-lived browser at a time (~100 users, bursty, not concurrent-heavy).
- **Always-on HTTP endpoint** (`POST /submit`, `GET /healthz`) gated by a
  timing-safe `BROWSER_WORKER_SECRET`. A submission can legitimately take
  **60–180 s** (navigation + form fill); the app aborts at 180 s.
- **Outbound egress to job boards** (Greenhouse, Lever, Workday, etc.). The
  worker's IP is what ATSs and CDNs see — **IP reputation matters directly to
  UX** (a shared/abused datacenter IP gets rate-limited or blocked mid-submit).
- **Isolation** — no DB creds, per-request SSRF re-checks, throwaway browser
  context. Any host is acceptable *if* it can run the identical image/process.

Conclusion: this is a small, stateful, always-on, egress-sensitive service.
It is the worst possible fit for a sleep-prone free tier and a good fit for a
dedicated small VM.

---

## 3. Render — facts and costs

| Property | Free tier | Paid tiers |
|---|---|---|
| Spin-down | **Yes — sleeps after 15 min idle**; 30–60 s cold start on next request | No spin-down (Starter and up) |
| RAM / CPU | 512 MB / 0.1 vCPU (shared) | Starter $7/mo (512 MB / 0.5), Standard $25/mo (2 GB / 1), Pro $85/mo (4 GB / 2) |
| Instance hours | **750 hrs/month shared per workspace** | Unlimited (paid) |
| Background workers / cron | **Not available on free** | Extra cost |
| Outbound IP | **Shared datacenter ranges** across all tenants in a region | Dedicated IPs require **Pro plan + $100/mo per IP set** (3 IPs) |
| SLA | None on free | Paid plans carry an SLA |

Sources: Render free-tier limits and cold starts [1](https://servercompass.app/blog/render-pricing-is-it-worth-it) [2](https://toolfreebie.com/render-hosting-review/) [3](https://www.luckymedia.dev/insights/render) [4](https://kuberns.com/blogs/how-to-deploy-on-render/); dedicated egress IPs [5](https://render.com/blog/dedicated-ips-for-your-services-on-render) [6](https://render.com/docs/dedicated-ips).

**What this means for the automation worker on Render free:**

1. **Cold starts kill UX.** After 15 min idle the next "Auto-apply" click waits
   30–60 s for the container to wake *before* Chromium even launches — and the
   app's own 180 s budget then has to absorb the cold start + navigation + form
   fill. A slow Greenhouse/Workday page plus a cold start can blow the budget
   and return a spurious `STOP`.
2. **512 MB is tight.** Playwright + Chromium can exceed it under a real page,
   causing OOM kills mid-submission (intermittent "unreachable").
3. **Shared egress IP** = the same pool used by other tenants (including other
   scrapers); job-board CDNs treat such IPs aggressively. The only fix (static
   IP) costs Pro + $100/mo — far outside the $0 budget.
4. **No SLA, no guarantee.** Free tier is explicitly not for production
   workloads.

**Render is therefore rejected as primary.** It survives only as a *standby*:
when Oracle is down, a slow Render submission is better than nothing.

---

## 4. Oracle — facts and measured numbers

| Property | Current A2 (trial credit) | A1.Flex target (Always Free) |
|---|---|---|
| Shape | VM.Standard.A2.Flex 2 OCPU / 12 GB | VM.Standard.A1.Flex, up to 4 OCPU / 24 GB total, **never expires** |
| Cost | Free until trial end ~2026-10-07 | $0 forever |
| Spin-down | None — always on | None — always on |
| Egress IP | **Dedicated** (147.224.189.214), clean, private to this tenant | Dedicated public IP |
| Firewall | Full control (UFW: 22/80/443 only) | Full control |
| Capacity risk | Trial ends → must migrate | **"Out of host capacity"** in `us-chicago-1` (retry loop armed) |

Sources: Oracle Always Free A1 specs [7](https://space-node.net/blog/oracle-cloud-always-free-limits-2026) [8](https://blog.easecloud.io/ai-cloud/launch-oracle-cloud-llms-in/) [9](https://grokipedia.com/page/Oracle_Cloud_Always_Free_Tier); capacity scarcity [7] [8].

**Measured on this VM (2026-09-10):** Docker 29.8.0; browser container runs
Playwright 1.62.1; host `free -h` shows **~10 GB available** with Ollama idle
(models unload when not inferring); all five services (caddy/api/browser/ai/
ollama) Up; `worker.jobiest.com/healthz` 200 over strict TLS.

**Why Oracle wins for this workload:** always-on (no cold start), 12 GB vs
512 MB, a dedicated IP that is not shared with other scrapers (directly better
submission success = UX), and full firewall/network isolation (security).

**Oracle's honest weakness:** the trial-credit A2 dies at trial end, and the
permanent-free A1 shape is capacity-constrained in this region. This is a
*provisioning* risk, not a runtime risk — and it is already mitigated (see §6).

---

## 5. Head-to-head matrix

| Criterion (weight) | Render free | Oracle (A2 now → A1) | Winner |
|---|---|---|---|
| Cold start / first-click latency (high) | 30–60 s after idle | None | **Oracle** |
| RAM for Chromium (high) | 512 MB (OOM risk) | 12 GB (10 GB free) | **Oracle** |
| Submission success = IP reputation (high) | Shared scraper pool | Dedicated clean IP | **Oracle** |
| Security isolation (high) | Shared tenancy, no firewall control | Own VM, UFW, private subnet, non-root container | **Oracle** |
| Availability guarantee (high) | No SLA, sleep-prone | Always-on; but trial expiry + A1 capacity | **Oracle** (runtime) / draw (lifetime) |
| Cost at $0 budget (hard constraint) | $0 (but unusable as primary) | $0 trial, then $0 A1 | **Draw** |
| Ops burden (low) | Near zero | SSH + Docker + kill-switch (already built) | Render (minor) |
| Longevity | Indefinite (free tier persists) | A1 persists; A2 expires | Render (on paper) |

**Verdict: Oracle primary, Render standby.** Every criterion that touches user
experience and security (latency, memory, IP reputation, isolation) points to
Oracle. The only criterion favoring Render is "it won't expire," which is why
Render is retained as the failover target rather than discarded.

---

## 6. The "always works" engineering plan

1. **Primary** = Oracle worker at `https://worker.jobiest.com` (already
   deployed, already health-checked, secret already matches the app).
2. **Standby** = Render free worker at
   `https://jobiest-browser-worker.onrender.com` (already deployed).
3. **Failover in the app** (`lib/apply/client.ts`, this change):
   - `BROWSER_WORKER_URLS` = comma-separated list, primary first.
   - Probe `/healthz` on each (2.5 s timeout) → submit to the first healthy
     worker → on network failure/timeout, try the next.
   - All down ⇒ safe `STOP: POLICY_RESTRICTED` (never a crash, never a
     retry storm). Auth failures (401/403) are terminal and surfaced, not
     masked by failover.
4. **Kill the Oracle time bomb** = migrate to A1.Flex before trial end. The A1
   retry loop is armed and re-armed each session; on success the same compose
   stack redeploys unchanged. Kill-switch cron warns on day 29.
5. **Last-resort fallback** = AWS free-trial $100 credit (user-authorized only;
   not used unless Oracle fails and the user approves).
6. **Monitoring (recommended, free, 1 click):** add `worker.jobiest.com/healthz`
   to a free external monitor (UptimeRobot/cron-job.org). The pinger also keeps
   the Render standby warm (mitigates its 15-min sleep) — **but** note Render's
   750 hrs/month is shared per workspace: if the old Render API-gateway service
   is still running there too, delete it (it is now redundant with the Oracle
   gateway) so the pinger only keeps one free service awake.

---

## 7. Residual risks (honest)

- **Oracle A1 capacity** is the real obstacle to permanence; if the retry loop
  never lands before 2026-10-07, the primary must move (Render standby buys
  time; AWS credit is the deep reserve).
- **Render standby secret is unverifiable from here** (no Render API key in the
  workspace). Per the go-live checklist it was deployed with the same secret as
  the app (and the app↔Oracle secret match is verified this session); confirm
  in the Render dashboard that `BROWSER_WORKER_SECRET` equals the Vercel value.
  If it differs, the standby will 401 and failover will simply skip it.
- **$0 budget means no vendor SLA.** The design maximizes availability within
  that constraint; it does not claim 100% uptime.
- **Shared RAM on Oracle:** a 7B-model inference and a Chromium submission at
  the same moment contend for ~12 GB. qwen2.5:7b (~7 GB loaded) + Chromium
  (~0.5–1 GB) still fits, but the A1 migration (24 GB) removes the concern.

---

## 8. Implementation log (this change)

- `lib/apply/client.ts` — `submitViaBrowser` now supports
  `BROWSER_WORKER_URLS` (comma-separated) with health-probe failover; single
  `BROWSER_WORKER_URL` retains the exact legacy behavior.
- `tests/apply-client.test.ts` — new failover tests (healthy-secondary
  selection, fall-through on network failure, all-down STOP).
- Vercel env: `BROWSER_WORKER_URLS=https://worker.jobiest.com,https://jobiest-browser-worker.onrender.com`.
- Verified: Oracle worker `/healthz` 200 over strict TLS; `/submit` returns 401
  without the secret (gate holds) and `DOMAIN_NOT_ALLOWLISTED` with a
  non-allowlisted domain (logic intact).
