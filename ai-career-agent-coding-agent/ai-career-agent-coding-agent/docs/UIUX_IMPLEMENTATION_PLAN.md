# ModernJob — UI/UX Implementation Plan (v2, research-grounded)

> Prepared **before** building. This document synthesizes a study of real,
> human-designed SaaS products and the current codebase, then defines an original
> design language and a phased build plan. Goal: a career product that happens to
> be powered by AI — **memorable, intelligent, human, premium** — not an AI template.
>
> Date: 2026-08-23. Author: design lead (Arena agent). Supersedes the visual layer
> of `docs/UIUX_BRIEF.md` (product flows there still apply, except Gmail which is
> removed per decision D-001).

---

## 0. TL;DR

- **Position:** the **quality-first, truthful, approval-gated career agent** — the
  white space between spammy auto-blasters (LazyApply/Sonara) and prep-only tools
  (Teal/Jobscan). Every screen must make truthfulness + human control + proof
  legible.
- **Look:** **warm ivory + warm grays** (cohesive warm base), **one primary accent
  (refined turquoise)** for action/progress/match, **two sparing pops** (cobalt =
  intelligence, coral = energy), **mint = success**. Never black; never pure white;
  never purple-blue gradients.
- **Type:** **Satoshi (display/headings, self-hosted) + Inter (body/UI)** — the
  "differentiated choice" ([SaaS Typography Playbook](https://fullstop360.com/blog/insights/branding/saas-typography-playbook-what-leading-companies-use)),
  escaping the Inter-as-default "AI tell."
- **Motif:** CAREER → MOMENTUM → INTELLIGENCE → ACTION, expressed as a subtle
  ascending **step/trajectory** system + a **flow rail** + structured-info grids.
  No rockets/arrows/ladders.
- **Discipline:** 4px spacing grid, varied (not uniform) radius, restraint >
  excess, progressive disclosure, skeleton states, warm-grays cohesion.

---

## 1. Research synthesis (what real human design does)

### 1.1 What makes premium products feel human (not AI)

Studied: **Linear, Attio, Stripe, Notion, Vercel/Geist, Raycast, Resend**.

- **Restraint is the differentiator.** "The best products — Linear, Notion, Stripe —
  are distinctive because of restraint, not excess. They make fewer design choices,
  but each choice is intentional" ([AI-slop guide](https://www.925studios.co/blog/ai-slop-web-design-guide)).
- **Muted palette, intentional pops.** "Most text/icons sit at 40–60% opacity; only
  status/priority/interactive get full-saturation color" ([Linear breakdown](https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026)).
- **Navigation should recede.** "Don't compete for attention you haven't earned —
  the sidebar is a few notches dimmer so the work area takes precedence; fewer,
  smaller icons; softer borders, structure felt not seen" ([Linear refresh](https://linear.app/now/behind-the-latest-design-refresh)).
- **Speed & certainty as design.** Optimistic UI, skeleton states over spinners,
  animations that signal "done" not "processing" ([Linear breakdown](https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026)).
- **Flow state via micro-detail.** "Subtle gradients, tactile hover states,
  perfectly-smooth cubic-bezier animations; progressive disclosure builds
  confidence" ([Attio](https://strategybreakdowns.com/p/how-attio-does-design)).
- **Ruthless spacing grid.** "Pick 4px or 8px as base, apply to everything.
  Inconsistent spacing is the fastest way to make a clean design feel cheap"
  ([Linear breakdown](https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026)).

### 1.2 The "AI-slop tells" we must avoid

Explicitly called out across sources ([AI-slop guide](https://www.925studios.co/blog/ai-slop-web-design-guide),
[madebyoversight](https://www.madebyoversight.com/post/why-ai-websites-look-generic-how-to-make-custom),
[dev.to premium](https://dev.to/samareshdas/why-most-ai-generated-websites-still-feel-generic-and-what-actually-makes-a-product-feel-premium-33p2)):

1. Inter/Geist as the **default** typeface (the #1 tell).
2. Purple→blue gradients, glowing orbs, random blobs.
3. Excessive glassmorphism / floating glass cards.
4. **Uniform** padding & border-radius on everything (no hierarchy).
5. Generic 3-column card grids ("Card, Card, Card").
6. Vague aspirational headlines ("Build the future").
7. Logo soup, fake testimonials, fake stats, stock/AI illustrations, decorative charts.
8. "AI magic" sparkle icons everywhere, excessive shadows, huge gradient text.

> Audit of the **current live v2 homepage**: mostly compliant (varied radius,
> warm base, real-product "momentum panel") — but it **still uses Inter/Plus Jakarta
> default type**, has a **subtle radial-gradient glow** in the hero (borderline orb),
> and a **4-card automation grid** + **3-card pricing**. All flagged for refinement
> in Phase 1/3 below.

### 1.3 Type: escape the default

- "AI-built sites favor Inter or system fonts … that's a tell" ([AI-slop guide](https://www.925studios.co/blog/ai-slop-web-design-guide)).
- Leading SaaS use **custom/licensed** faces for distinctiveness; the realistic
  free path is **"System B: the differentiated choice"** — a distinctive heading
  face + a clean body face ([SaaS Typography Playbook](https://fullstop360.com/blog/insights/branding/saas-typography-playbook-what-leading-companies-use)).
- Strong free, non-generic faces: **Satoshi, General Sans, Space Grotesk, Hanken
  Grotesk, DM Sans** ([weandthecolor](https://weandthecolor.com/20-modern-sans-serif-fonts-graphic-designers-love-in-2026/211445)).
- Recommended pairings: Satoshi + Plus Jakarta, Space Grotesk + DM Sans
  ([lapaone](https://www.lapaone.com/best-fonts-for-saas-products/)).

### 1.4 Competitive position (the "why us")

Across [scale.jobs](https://scale.jobs/blog/job-search-apps-auto-apply-ranked),
[aicreator](https://www.aicreator.co/blog/best-ai-job-application-tools),
[sprad.io](https://sprad.io/blog/top-5-ai-apply-alternatives-for-quality-first-non-spammy-job):

| Segment | Tools | Weakness we avoid |
|---|---|---|
| High-volume auto-blast | LazyApply, Sonara, LoopCV | Spammy, generic, no proof, recruiter distrust |
| Autofill speed | Simplify, FastApply | No tailoring, no end-to-end, no receipts |
| Prep-only | Teal, Jobscan, Rezi | Don't apply; tracking-only |
| Human VA (premium) | Scale.jobs, Atlas Apply | Expensive, not self-serve |

**ModernJob's defensible lane:** Sonara-grade automation **+** Teal-grade tracking
**+** Jobscan-grade ATS **but** with **(a) truthfulness (no fabrication), (b)
approval-gated (never spammy), (c) immutable proof/receipts, (d) explainable
"Why this job?", (e) profession-agnostic, (f) NGN/local pricing.** Every screen
makes those five differentiators **visible**.

---

## 2. Design principles (every element must answer "why does this exist?")

1. **Restraint first.** If removing it changes nothing, remove it.
2. **One accent earns attention.** Turquoise = the only thing that "moves." Everything
   else is warm-neutral. Pops (cobalt/coral/mint) appear only where they carry meaning.
3. **Warm cohesion.** Ivory + warm grays as one temperature; cool accents are
   deliberate contrast — never mix warm and cool grays ([r/SaaS](https://www.reddit.com/r/SaaS/comments/1qg36na/how_to_design_a_nongeneric_saas_ui_without/)).
4. **Hierarchy via variation, not uniformity.** Vary radius, weight, size, density
   intentionally. No two adjacent blocks look identical.
5. **Progressive disclosure.** Show the essence; reveal detail on intent (hover,
   expand, focus). Information density without overwhelm.
6. **Truth is visible.** Every AI output carries a "based on your profile" marker,
   a fact-trace, and an edit control (from `UIUX_BRIEF.md` §8).
7. **Speed = trust.** Optimistic UI, skeletons (never bare spinners), <200ms feel.
8. **Accessible by default.** WCAG 2.2 AA, keyboard-first, visible focus,
   reduced-motion — part of the system, not an add-on.

---

## 3. Design tokens (formal system)

### 3.1 Color — warm ivory base, one accent, meaningful pops

```
/* Base — warm */
--background-primary:   #FAF8F3   /* warm ivory (never pure white) */
--background-secondary: #F3EFE6   /* warmer section tint */
--surface:              #FFFFFF   /* cards on ivory */
--surface-sunken:       #F6F2EA   /* recessed fields, code */

/* Text — warm petrol/slate (never pure black) */
--text-primary:   #14201F   /* deep warm petrol */
--text-secondary: #57524A   /* warm slate */
--text-tertiary:  #8A8378   /* warm muted */

/* The ONE accent */
--accent-primary:        #0BA5A0   /* refined turquoise — action/progress/match */
--accent-primary-strong: #067A7C
--accent-primary-soft:   #E4F4F2
--accent-primary-line:   #AEE0DB

/* Meaningful pops (sparingly) */
--accent-intel:  #2F4CFF   /* cobalt — AI intelligence/matching */
--accent-energy: #FF6A4D   /* coral — energy/urgent/CTA highlight */
--accent-success:#15A37A   /* mint-leaning success */

/* Semantic */
--success:#15A37A; --success-bg:#E9F6F0
--warning:#C77A1F; --warning-bg:#FBF1E2
--danger: #C8413A; --danger-bg: #FBECEB

/* Lines & focus (warm) */
--border:        #E7E1D4
--border-strong: #D8D1C0
--focus-ring:    0 0 0 3px var(--accent-primary-line)
```

**Rules:** backgrounds never darker than `--background-secondary`; text never pure
`#000`; the **only** fully-saturated color in a given view is `--accent-primary`
unless a pop carries explicit meaning (status, intelligence, urgency). Current v2
uses **cool** `--line` (`#E4ECEB`) — **fix: warm it** to match the ivory.

### 3.2 Spacing — strict 4px grid

```
--space-1:4px  --space-2:8px  --space-3:12px  --space-4:16px
--space-5:20px --space-6:24px --space-8:32px --space-10:40px
--space-12:48px --space-16:64px --space-20:80px --space-24:96px
```
No off-grid values. Components compose from these only.

### 3.3 Radius — varied scale (anti-uniformity)

```
--radius-xs:6px (chips/tags)  --radius-sm:10px (inputs/buttons)
--radius-md:14px (small cards) --radius-lg:20px (panels)
--radius-xl:28px (hero surfaces) --radius-pill:999px (CTAs/badges)
```
**Never** apply one radius everywhere. Inputs ≠ cards ≠ hero.

### 3.4 Type scale (Satoshi display + Inter body)

```
--font-display: "Satoshi", "General Sans", system-ui   /* headings, numerics */
--font-body:    "Inter", system-ui                       /* body/UI */
--fs-display: clamp(40px, 5.6vw, 68px)   --lh-display:1.04  --ls-display:-0.035em
--fs-h1: clamp(30px,4vw,46px)            --lh-h1:1.08
--fs-h2: clamp(23px,2.8vw,32px)          --lh-h2:1.12
--fs-h3:19px  --fs-body:16px  --fs-small:14px  --fs-caption:12.5px
```
Weight discipline: **display 700**, H2 **650**, body **450**, labels **600**
caps+tracking. Numerics use Satoshi + `tabular-nums`. Avoid making everything 600.

### 3.5 Motion, elevation, z-index

```
--ease: cubic-bezier(.16,1,.3,1)    --ease-out:cubic-bezier(.22,1,.36,1)
--dur-fast:140ms  --dur:240ms  --dur-slow:420ms
--shadow-1:0 1px 2px #14201F0d   --shadow-2:0 8px 24px -10px #14201F26
--shadow-3:0 28px 60px -30px #14201F40
--z-base:0 --z-sticky:30 --z-drawer:50 --z-modal:60 --z-toast:70
```
Shadows are **soft, low, warm-tinted** (never harsh black halos).

---

## 4. Visual motif — CAREER → MOMENTUM → INTELLIGENCE → ACTION

A subtle, reusable system (no literal rockets/arrows):

- **Trajectory step:** an ascending 2–3 step diagonal used as section dividers,
  progress ticks, and the logo mark (already an upward stroke + node). Conveys
  *career trajectory / progress*.
- **Flow rail:** a vertical/horizontal rail with nodes + an animated fill (the hero
  "agent workspace"). Conveys *momentum / the agent working*.
- **Structured grid:** calm ruled grids for match breakdowns, ATS checks,
  timelines. Conveys *intelligence / structured information*.
- **Match ring:** conic-gradient ring (not a generic progress bar) for fit scores.
- **Density dial:** marketing = airy (space-12+); app = denser (space-4/6); admin =
  densest. One motif family, three densities.

---

## 5. Component system (reusable, token-driven)

Build once in `components/ui/*`, reuse everywhere. Spec highlights:

| Component | Spec |
|---|---|
| **Button** | pill (`--radius-pill`); primary=turquoise ink, ghost=warm border, accent=coral for the single highest-priority CTA. 140ms lift on hover. |
| **Input/Select/Search** | `--radius-sm`, sunken surface, warm border, `--focus-ring`; label above, helper below; inline validation with icon+message. |
| **Badge/Status** | semantic only; dot+label; never decorative. |
| **Progress / MatchScore** | conic **ring** (0–100) + verdict word; reused in discovery, dashboard, JD analyzer. |
| **JobCard** | title/company/location, match ring, **"Why this job"** 2-line reason, top skills matched, salary, source badge, actions (View/Save/Skip/Apply/Ask agent). **Not** a uniform card grid — list-with-rail in discovery. |
| **ResumePreview / ResumeEditor** | realistic A4 document (margins, ruled), inline section edit, AI-rewrite affordance, **ATS bar**, **truthfulness** check chip, version switcher. |
| **AgentActivityStream** | timestamped flow-rail feed (Found → Deduped → Scored → Shortlisted → Generated → Submitted) with live pulse; **not** a spinner. |
| **ApplicationTimeline** | horizontal stage track (Saved→Preparing→Applied→Viewed→Interview→Offer/Rejected) + response-probability + follow-up nudge. |
| **Empty/Loading/Error states** | empty = illustration-free, one sentence + one CTA; loading = skeleton matching layout; error = what happened + what to do + retry (`UIUX_BRIEF.md` §10–11). |
| **Toast/Modal/Drawer/Tooltip/Tabs/Dropdown** | warm surfaces, `--shadow-2/3`, `--ease` 240ms. |
| **Navigation/Sidebar/MobileNav** | receding warm sidebar (dimmer than content), compact; mobile = bottom tab (Home/Jobs/Applications/Agent) + "More" sheet. |

---

## 6. Screen-by-screen plan

### 6.1 Landing page (Phase 3) — "well detailed," 13 distinct sections

Composition rule: **no two adjacent sections share a layout.** Alternate
full-bleed / asymmetric / grid / editorial / rail.

1. **Header** — translucent warm, receding; logo + 3 anchor links + Sign in / Start free.
2. **Hero** — asymmetric (1.1fr / 0.9fr). Left: outcome headline ("Your next role,
   found and applied — while you do something else"), one-line proof, primary CTA
   **"Build My Free CV"** + ghost **"See How It Works"**, 3 trust chips. Right: the
   **living agent workspace** (flow rail: Found→Matched→CV tailored→Ready→Submitted
   + live pulse + 3 stat footers). *Replace the radial "glow" with a structured
   warm gradient edge, not an orb.*
3. **Career profile introduction** — asymmetric; left copy ("Build your profile once")
   + 3 numbered points; right a **profile-strength card** (warm surface, animated
   meter to 88%, skill chips, avatar). Emphasizes profession-agnostic.
4. **AI resume transformation** — split: left a **realistic resume document mock**
   (ruled lines, ATS score tag, ATS bar); right copy + "truthful by design" +
   "versioned & traceable" points. Studio preview, not a text box.
5. **Job matching** — split: left copy ("Matching that explains itself"); right a
   **match card** with conic ring (92), "You're a strong match because…", matched
   skills + one gap. *Differentiator vs LinkedIn/Indeed.*
6. **ATS intelligence** — editorial/rail: a JD paste → structured breakdown
   (required skills, keywords, gaps, strengths) as a ruled grid. No wall of text.
7. **Automated application workflow** — the WOW: a **sophisticated activity
   interface** showing agent states (Discovering→Analyzing→Tailoring→Answering→
   Filling→Verifying→Submitting→Completed) as a staged rail with a "live" node —
   not a grid of identical cards and not a spinner. Conveys "your AI employee."
8. **Application activity** — a calm **pipeline snapshot** (Saved→Applied→
   Interview→Offer) + response-rate sparkline (purposeful chart, real shape).
9. **Free tools** — asymmetric bento (varied tile sizes, NOT a 3×3 grid) linking
   the 10 SEO tools; each tile previews its output.
10. **How the AI agent works** — 3 large numbered steps on airy whitespace
    (Build profile → Agent works → Approve & track).
11. **Security & privacy** — trust rail: "Only your verified facts," "You approve
    every application," "Immutable receipts," "No Gmail access, no inbox
    monitoring." (Reinforces the differentiators + D-001.)
12. **Pricing** — 3 tiers but **not** identical cards: Free (warm), Basic (featured,
    elevated, turquoise edge), Premium (coral accent). NGN. **7-day trial** banner.
13. **FAQ** — accordion (reuse existing), max-width 760, airy.
14. **Final CTA** — warm surface with a soft structured gradient edge; one headline,
    one CTA, one ghost.
15. **Footer** — logo + blurb + 2 link columns + copyright.

**Copy rules (anti-vague-headline):** outcome-first, concrete, founder-voice; no
"Build the future." ([fibr.ai](https://fibr.ai/landing-page/saas-landing-pages),
[vezadigital](https://www.vezadigital.com/post/best-saas-landing-page-examples)).

### 6.2 Auth & onboarding (Phase 4) — guided, no Gmail

- **Sign up / login** — single-column warm card, `AuthShell` (exists), generous
  whitespace, inline validation, social/email. (Already functional post-fix.)
- **Onboarding wizard (6 steps)** — a focused, one-decision-per-screen flow that
  feels like *building your AI career identity*; persistent progress rail (motif):
  1. What do you do? (profession selector, custom)
  2. What role are you targeting? (multi-select + keywords)
  3. Where & how? (remote/hybrid/onsite, locations) *(replaces old Gmail step)*
  4. Upload your CV (drag-drop + parse)
  5. Add experience / career goals
  6. Ready → dashboard with a celebratory, calm moment
- Reuses the existing `app/onboarding` 5-step wizard structure; restyle to v2 +
  extend to 6 steps; **remove Gmail entirely** (D-001).

### 6.3 Dashboard — "career command center" (Phase 5)

Must answer, above the fold: *Where am I? Profile state? What next? What's the AI
doing? How many applications? What opportunities? What to improve?*

- **Greeting band:** "Good morning, [Name]." + agent status + pause/resume.
- **Career momentum** (the signature viz): NOT four identical metric cards. A single
  **momentum composition** — an ascending trajectory graphic integrating
  Applications, Interviews, Response rate, Profile strength as one connected visual
  (e.g., a stepped ascent with annotations), warm surface.
- **Center column:** recommended opportunities (JobCards), recent applications
  (timeline rows).
- **Right rail:** AI recommendations ("3 jobs to review," "Profile at 72% — add 2
  skills," "Follow up on Acme Co.") as a quiet, receding column.
- **Left:** receding warm sidebar nav.

### 6.4 Resume studio (Phase 6)

- **Studio layout:** 3 zones — left AI controls + job targeting; **center realistic
  A4 resume preview** (editable inline: section edit, AI rewrite, reorder); right
  match score + ATS bar + suggestions + **version history** (immutable list).
- Truthfulness chip on every AI-touched block ("Based on your profile ✓").
- Reuses Phase 7 generation backend; this is the **studio UX** over it.

### 6.5 JD analyzer (Phase 6/7)

- Paste JD → animated **structured breakdown**: match ring, required skills (matched/
  missing), keywords, responsibilities, gaps, strengths — ruled grid, scannable.

### 6.6 Job discovery (Phase 7)

- **List-with-rail**, not a card grid: left filters; main a vertical list of rich
  JobCards each with match ring + **"Why this job"** reason + skills; selecting one
  opens a detail pane. Exclude applied (already in matching engine).

### 6.7 Application automation (Phase 8)

- The **AgentActivityStream** as a full page: live flow-rail of the agent working
  across multiple applications, per-app stage, "awaiting your approval" callouts,
  pause/resume. Sophisticated, not a spinner.

### 6.8 Application tracker (Phase 9)

- Pipeline view (Saved→Preparing→Applied→Viewed→Interview→Offer/Rejected) — **not**
  a Kanban clone: each card carries **response probability**, **application
  quality**, **follow-up recommendation** (visual intelligence, not just columns).

### 6.9 Billing/pricing (Phase 10)

- In-app version of the landing pricing + Flutterwave flow + current plan/usage
  (credits/applications today) as warm stat tiles.

### 6.10 Admin dashboard (Phase 11)

- **Separate, denser** layout (allowed higher density), still bright/never black:
  users, subscriptions, payments, usage, AI credentials, security events,
  suspicious/duplicate accounts, automation health, audit logs. Data tables with
  warm ruled rows.

### 6.11 SEO free-tool pages (Phase 12)

10 pages under the design system but **each a distinct composition** (hero tool,
live-working preview, result panel, related tools, FAQ). Routes from the brief.
Shared chrome, varied layouts — not duplicated templates.

---

## 7. Motion, responsive, accessibility

- **Motion:** purposeful only — progress fill, status transitions, skeleton→content,
  document-generation transition, success confirmations. `prefers-reduced-motion`
  collapses to instant + static finals. Timings from §3.5.
- **Responsive:** mobile-first; **recompose** at 360/390/430/768/1024/1440/1920
  (e.g., hero stacks and the workspace becomes a compact card; discovery list→single
  column + bottom action bar; resume studio→tabbed on mobile). Designed bottom-tab
  mobile nav.
- **Accessibility (WCAG 2.2 AA):** semantic HTML, 4.5:1 body / 3:1 large contrast
  (warm petrol on ivory passes), visible focus rings, keyboard reachability, labeled
  inputs, ARIA on dynamic regions (live activity), reduced-motion parity.

---

## 8. Anti-slop audit checklist (apply to every screen)

- [ ] Could I swap the logo and nobody notices? → redesign.
- [ ] Is type Inter/Geist **default**? → use Satoshi display.
- [ ] Uniform radius/padding? → vary per §3.2/3.3.
- [ ] Card-Card-Card? → break into rail/editorial/asymmetry.
- [ ] Gradient glow/orb/glassmorphism? → remove or make structural.
- [ ] Vague headline? → rewrite outcome-first.
- [ | Logo soup / fake stats / stock art? → real product visuals + realistic fixtures.

---

## 9. No-placeholder policy

No lorem/fake testimonials/fake companies/fake stats. Where real data is absent,
ship **realistic empty states** ("No applications yet — activate your agent to
begin") and mark development fixtures with a clearly-labelled internal banner. Hero
"stats" on marketing are presented as **illustrative product state**, not claimed
company metrics.

---

## 10. Implementation phasing (mapped to the 16-phase brief)

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Research + this plan | ✅ done |
| 1 | **Design system v2** — warm tokens, Satoshi+Inter type, spacing/radius/motion/z-index, base components | 🔜 refine (current v2 is interim) |
| 2 | App shell: receding sidebar nav + mobile bottom tabs | 🔜 |
| 3 | **Landing page (well-detailed, 13 sections)** | 🔜 rebuild per §6.1 |
| 4 | Auth + 6-step onboarding (no Gmail) | 🔜 |
| 5 | Dashboard "career command center" + momentum viz | 🔜 |
| 6 | Resume studio + JD analyzer | 🔜 |
| 7 | Job discovery ("Why this job") | 🔜 |
| 8 | Application automation (activity stream) | 🔜 |
| 9 | Application tracker (pipeline + intelligence) | 🔜 |
| 10 | Billing/pricing (in-app) | 🔜 |
| 11 | Admin dashboard (dense, bright) | 🔜 |
| 12 | 10 SEO free-tool pages | 🔜 |
| 13 | Responsive refinement (360→1920) | 🔜 |
| 14 | Accessibility (WCAG 2.2 AA) pass | 🔜 |
| 15 | Performance (fonts, lazy, images) | 🔜 |
| 16 | Visual QA (anti-slop checklist) | 🔜 |

**Build order:** Phase 1 (tokens/type) → 3 (landing, detailed) → 2 (app shell) →
4 (onboarding) → 5 (dashboard) → 6–9 (core product) → 10–12 → 13–16 hardening.
Each phase: gate (tsc + vitest + build) → commit → deploy → verify live.

---

## 11. Key decisions (to log in DECISIONS.md as D-008)

- **D-008a Type:** Satoshi (display) + Inter (body), self-hosted Satoshi via
  `next/font/local` — the "differentiated choice" to avoid the Inter-as-default tell.
- **D-008b Color:** warm ivory + warm grays (cohesive) + **one** turquoise accent +
  cobalt/coral/mint as meaning-only pops. Warm the currently-cool `--line`.
- **D-008c Motif:** ascending trajectory + flow rail + structured grids (subtle,
  no literal arrows/rockets).
- **D-008d Position:** quality-first, truthful, approval-gated, fully-tracked — the
  visible differentiator on every screen.
- **D-008e Restraint:** 4px grid, varied radius, progressive disclosure, skeletons;
  every element must justify itself.

---

### Research sources
- [Linear design breakdown — 925studios](https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026)
- [Linear: a calmer interface (official refresh)](https://linear.app/now/behind-the-latest-design-refresh)
- [Attio's design-first strategy — Strategy Breakdowns](https://strategybreakdowns.com/p/how-attio-does-design)
- [AI Slop Web Design guide — 925studios](https://www.925studios.co/blog/ai-slop-web-design-guide)
- [Why AI websites look generic — madebyoversight](https://www.madebyoversight.com/post/why-ai-websites-look-generic-how-to-make-custom)
- [What makes a product feel premium — dev.to](https://dev.to/samareshdas/why-most-ai-generated-websites-still-feel-generic-and-what-actually-makes-a-product-feel-premium-33p2)
- [SaaS Typography Playbook — Fullstop360](https://fullstop360.com/blog/insights/branding/saas-typography-playbook-what-leading-companies-use)
- [Best fonts for SaaS — LapaOne](https://www.lapaone.com/best-fonts-for-saas-products/)
- [Modern sans-serifs 2026 — WeAndTheColor](https://weandthecolor.com/20-modern-sans-serif-fonts-graphic-designers-love-in-2026/211445)
- [r/SaaS: non-generic UI](https://www.reddit.com/r/SaaS/comments/1qg36na/how_to_design_a_nongeneric_saas_ui_without/)
- [SaaS landing pages that convert — fibr.ai](https://fibr.ai/landing-page/saas-landing-pages)
- [Best SaaS landing examples — Vezadigital](https://www.vezadigital.com/post/best-saas-landing-page-examples)
- [AI job tools ranked — scale.jobs](https://scale.jobs/blog/job-search-apps-auto-apply-ranked)
- [Best AI job application tools — aicreator](https://www.aicreator.co/blog/best-ai-job-application-tools)
- [Quality-first AI apply alternatives — sprad.io](https://sprad.io/blog/top-5-ai-apply-alternatives-for-quality-first-non-spammy-job)
