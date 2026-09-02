# Gemini Pro, Master Prompt Kit: "Humanized UI/UX" for ModernJob

A paste-in-order prompt chain for Gemini Pro: **research → direction → design system → pages → humanization pass → hostile audit**.

## How to use

1. Open ONE new chat with Gemini Pro (keep the whole project in a single chat so context carries; if you must start fresh, re-paste Prompt 0 first).
2. Paste the prompts **in order**, one per message. Wait for each output before the next.
3. Fill the `{{PLACEHOLDERS}}` where marked (product facts are pre-filled for you, edit if things changed).
4. Between Prompt 2 and 3 you must **choose one direction**. Between 3 and 4, save the token block, you'll re-paste it into every page prompt.
5. Use Prompt 4 once per page (it's a repeatable template, 14 surfaces total, don't batch them).
6. When a direction + tokens + page specs come back, bring them here: I implement, gate (tsc/build/tests), and deploy, Gemini proposes, our pipeline disposes.

**If output ever feels generic:** reply with *"You're being safe. Give exact hex/px/ms values, name real references, and tell me what you'd cut."* That line fixes 90% of lazy output.

---

## PROMPT 0, Master Context & Ground Rules
*(paste first, in every fresh chat)*

```
You are my lead product designer for the entire project below. Stay in this role for the whole conversation. Disagree with me when I'm wrong, tell me why before you comply. Be concrete at all times: exact hex, px, ms, easing curves, font names. Mark anything uncertain as [HYPOTHESIS]. Never invent product features, stats, testimonials, or quotes.

## The product
ModernJob, an AI career agent for job seekers. It finds real job openings, matches them to the user's verified profile, prepares truthful application documents (CV, cover letter, interview answers), and submits applications only after the user reviews and approves each one. Core promise: TRUTHFUL, it never invents employers, metrics, skills, or achievements, and never auto-applies without approval.

Market: Nigeria first (Lagos), scaling across West Africa. Pricing in Naira via Flutterwave: Free forever (2 AI credits/day), Trial (7 days), Basic ₦5,000, Premium ₦10,000.

Surfaces to design: marketing landing + 3 public free-tool pages (job description analyzer, cover letter writer, skills matcher), signup/login, onboarding, dashboard, job browser & matching, resume studio, documents (immutable versions), application tracker, billing, admin.

Users: job seekers, senior professionals and new graduates, many on mid-range Android phones, often stressed, time-poor, and burned by scammy "auto-apply" tools.

## Hard constraints (non-negotiable)
1. NEVER a black or dark background. Bright, light, warm world.
2. This is a CAREER product that happens to be powered by AI, not an "AI tool". No robots, sparkles ✨, glowing orbs, "powered by GPT" vibes.
3. Design for many professions, teachers, accountants, nurses, project managers, designers, not only programmers.
4. Truthfulness: no fabricated testimonials, logos, stats, numbers, or user quotes anywhere. Empty states stay honest. If content doesn't exist, design around its absence.
5. WCAG 2.2 AA contrast and focus states. Mobile-first: must shine at 320px and scale to 1920px.
6. Respect prefers-reduced-motion.
7. One accent color only. Grays either warm OR cool, never mixed.
8. Distinctive display type + clean body type. Inter is allowed as body only, never as the identity font.

## Banned "AI-slop" patterns (instant rejection)
- Purple/blue gradient heroes, glowing orbs, sparkle icons, glassmorphism cards everywhere
- Identical 3-column card grids; uniform corner radius and padding on everything
- Vague headlines ("Supercharge your career with AI"), stock 3D renders, fake logo walls
- Emoji as UI icons; card-card-card monotony; meaning-free decorative gradients

## Working agreement
- When I ask for N options, give exactly N, each genuinely different in DNA.
- Every claim about what works must cite a real product or principle, or be marked [HYPOTHESIS].
- End every major answer with a short "What I'd cut" self-critique.

Now confirm your role, restate the 5 rules you consider most important in your own words, and wait for my next message.
```

---

## PROMPT 1, Research Sprint
*(evidence before opinions)*

```
Phase 1, Research. We design nothing yet. Build the evidence base.

A) COMPETITIVE TEARDOWN (12 products): LinkedIn Job Search, Teal, Jobscan, Rezi, Kickresume, Simplify, LoopCV, LazyApply, Sonara, Wellfound, Arbeitnow, plus one career product you consider best-in-class that I should know about. For each: one-line positioning, the ONE screen or pattern they do best, and the one thing that feels robotic or generic. Use current real details only, no invented features.

B) BEST-IN-CLASS BEYOND JOBS: pick 6 products outside the career space famous for human, warm, editorial, or tactile web design (consider Linear, Stripe, Attio, Mercury, HEY/Basecamp, and one Awwwards winner you trust). For each, extract the transferable pattern: what exactly makes it feel designed by humans, spacing rhythm, motion signature, typographic voice, illustration style, or microcopy tone. Be specific enough that I could copy the technique without visiting the site.

C) HUMANIZATION PATTERN LIBRARY: 15 concrete, implementable techniques for making UI feel human. Each: what it is, where it works best, one real-world example, and the failure mode if overdone. Cover at least: editorial typography, asymmetry, annotation/label layers, paper texture, hand-drawn accents used sparingly, motion signatures, microcopy voice, honest empty states, progress rituals, quiet celebration moments, empathetic errors.

D) AUDIENCE REALITY: job seekers in Lagos. List 8 design implications driven by real constraints (e.g. mobile-first Android reality, data cost, CV-as-PDF habits, WhatsApp-shared job links, power/data interruptions mid-flow). Mark assumptions clearly.

Output a structured brief with sections A-D. Evidence only, no design decisions. End with: "The 5 findings most likely to differentiate ModernJob", ranked, each tied to a specific section above.
```

---

## PROMPT 2, Three Directions
*(diverge hard, then commit)*

```
Phase 2, Direction. Propose 3 complete, mutually exclusive visual + voice directions for ModernJob, grounded in our Phase 1 findings.

For EACH direction:
1. Name + one-line manifesto (max 12 words)
2. Emotional promise: what a stressed job seeker feels on first load
3. Palette: 2 foundation colors + 1 accent + semantic colors. Exact hex, with WCAG-checked text pairings on each.
4. Typography: display + body pairing (real, licensable fonts; Inter may be body only). Full scale: 6 steps with exact rem values. One signature typographic move.
5. Shape & surface language: radius philosophy, border vs shadow strategy, texture (maximum one).
6. Motion signature: 3 named interactions with exact duration + cubic-bezier values.
7. Illustration/graphic language (if any) and photography direction.
8. Microcopy voice: 3 sample sentences for the same empty state ("no matching jobs yet").
9. ONE signature moment for the landing page, the thing a person would screenshot.
10. Two things this direction deliberately REJECTS.

Then compare the 3 in a table scored 1-5 on: warmth, credibility, distinctiveness, build cost, risk of aging badly. Recommend one with reasoning tied to specific Phase 1 findings, and state your confidence as a percentage.

Hard rules: no direction may use a black background, purple-blue gradients, or glassmorphism as its core idea. The 3 must differ in DNA, e.g. editorial/print vs tactile/paper vs confident/muted-tech, not just accent color.
```

---

## PROMPT 3, Design System Blueprint
*(after you choose a direction)*

```
Phase 3, Design system. We proceed with the direction: "{{CHOSEN DIRECTION NAME}}".

Deliver a build-ready design system:

1. TOKENS, CSS custom properties with final values, ready to paste:
   color (background levels, ink levels, line, accent + hover + pressed, success/warning/danger each with a subtle background tint), type scale, spacing scale (4px base), radius scale, shadow scale (max 3), motion (durations, easings, reduced-motion fallbacks), z-index policy.
2. LAYOUT PRIMITIVES, container widths, section rhythm (space between sections), grid rules, and exactly when we are allowed to break the grid.
3. COMPONENT INVENTORY (25-35 components). For each: name, purpose, anatomy (parts), all states (default, hover, focus-visible, active, disabled, loading, empty, error), and ONE humanization note, the small detail that keeps it from feeling robotic. Include our product-specific components: job card, match-score display, truthfulness verdict banner, AI credit meter, approval-gate stepper, immutable-version timeline, application status tracker.
4. TWO REFERENCE IMPLEMENTATIONS, fully specified: the job card and the match-score display. ASCII anatomy diagram, every measurement, every state.
5. ACCESSIBILITY CONTRACT, focus-visible style, minimum target sizes, how async AI results are announced to screen readers.
6. WHAT WE DELIBERATELY DO NOT DO, 10 anti-patterns specific to this system.

Constraint: every token must map 1:1 to a CSS custom property I can paste into a globals.css file. Exact values everywhere, no "medium" or "subtle".
```

---

## PROMPT 4, Page Design
*(repeat once per page, 14 surfaces; never batch)*

```
Phase 4, Page design: {{PAGE NAME}}.

Who lands here: {{1-2 lines: their emotional state and goal}}
Where they go next: {{next action after this page}}

Deliver:
1. CONTENT-FIRST OUTLINE, every block top to bottom with REAL final copy in our microcopy voice. No lorem. No fabricated social proof.
2. LAYOUT, ASCII wireframe with measurements (spacing, container widths) + exactly how it reflows at 768px and 320px.
3. COMPOSITION NOTE, what makes this page structurally different from our other pages. If it repeats a hero-then-cards rhythm, redesign it.
4. COMPONENT MAPPING, which system components appear, plus any page-specific variants (specify them).
5. THE ONE HUMAN MOMENT, the single detail a person would remember. Exactly one; more is noise.
6. MOTION, entrance choreography (stagger of at most 3 items, total under 600ms) and one interactive response, with reduced-motion fallbacks.
7. EDGE STATES, empty, error, loading (honest loading copy, what is the AI actually doing?), and the signed-out variant if this page is public.
8. IMPLEMENTATION, production-ready HTML + CSS using our tokens:

{{PASTE TOKEN BLOCK FROM PHASE 3}}

Semantic HTML, ARIA only where needed, no frameworks. If I reply "React", re-wrap the same markup as a Next.js client component with typed props.

Before you output: score your own draft 1-10 against the banned AI-slop list and fix anything under 5. After output: list what you'd improve with one more pass.
```

---

## PROMPT 5, Humanization Detail Pass
*(per page, after Prompt 4)*

```
Phase 5, Humanization pass on {{PAGE OR FLOW}}. Upgrade ONLY the human layer. Do not change layout, structure, or tokens.

1. MICROCOPY, rewrite every string. Mentor tone: specific over generic, warmth in small doses, zero cringe, no exclamation marks except when celebrating a user's win. Show a before/after table for at least 10 strings.
2. MOTION, apply the system's motion signature consistently. List each element, property, duration, easing, reduced-motion fallback.
3. MICRO-MOMENTS, the loading story (what does the user read while the AI works?), the success ritual (what does approval FEEL like?), the empathy moment (what does an error say, and what does it help the user do next?).
4. TEXTURE & IMPERFECTION, audit where the page is TOO perfect. Apply at most 2 intentional imperfections (a hand-set label, an asymmetric gap, an editorial numeral). More becomes noise, resist it.
5. TRUST LAYER, 3 places to surface honesty woven into the design (not a legal footer): what the AI can and cannot do, why a score is what it is, what happens to the user's data.

Finish with a "still feels robotic" list, anything you could not fix, so I can decide.
```

---

## PROMPT 6, Hostile Audit
*(final gate per page, and once for the whole system)*

```
Phase 6, Audit. You are now a hostile design reviewer whose reputation depends on finding flaws. Score {{PAGE OR SYSTEM}} 1-10 on each criterion, with the exact fix for anything under 8:

1. FIRST IMPRESSION, would a working designer screenshot this, or scroll past?
2. DISTINCTIVENESS, cover the logo: is it still recognizably ours?
3. SLOP SCAN, purple gradients, orbs, sparkle icons, glass cards, uniform 3-col cards, same radius everywhere, vague headline, emoji-as-icons, stock 3D, fake logos/testimonials. Any found = automatic 0 here; list them.
4. CONTRAST & FOCUS, WCAG 2.2 AA text pairings; visible focus-visible on every interactive element; minimum 24×24px targets.
5. 320PX TEST, describe exactly what breaks at 320px width, if anything.
6. REDUCED MOTION, does anything still move that shouldn't?
7. PROFESSION BREADTH, does any imagery or copy assume software developers? List every instance.
8. TRUTHFULNESS, any fabricated number, quote, logo, or overclaim? List every instance.
9. VOICE, read all copy aloud: does it sound like one consistent person?
10. THE MEMORABLE MOMENT, does it exist? Name it, or write MISSING.

Output: scorecard table, then a fix list prioritized by impact ÷ effort, then fully apply your top 3 fixes.
```

---

## The 14 surfaces (Prompt 4 run-sheet)

| # | Page | Key intent |
|---|------|------------|
| 1 | Landing | Convert to signup; carry the signature moment |
| 2 | Free-tool pages (×3) | SEO entry, working tool + CTA |
| 3 | Signup / Login | Zero-friction, trust-building |
| 4 | Onboarding | Profile completeness as a ritual, not a form |
| 5 | Dashboard | Calm command center; what changed since yesterday |
| 6 | Job browser | Scan fast, save jobs, zero deception |
| 7 | Matching | Explainable scores, strengths AND gaps |
| 8 | Resume studio | The creation moment; truthfulness visible |
| 9 | Documents | Immutable versions as a timeline |
| 10 | Application tracker | Status without anxiety |
| 11 | Billing | Naira plans, Flutterwave trust |
| 12 | Admin | Internal tool, fast over beautiful |

## What to bring back to me

1. The chosen **direction name + manifesto** (Prompt 2 output)
2. The **token block** (Prompt 3 output)
3. Per-page **specs/code** (Prompt 4+5 outputs)

I'll map tokens onto our existing `globals.css` structure, rebuild components under the new system, keep the current code paths intact (no logic changes), and run the full gate (tsc / build / 83+ tests) before any deploy.
