# Hardening Pass — Phases 13–16 Audit Record

Date: 2026-09-02 · Post-v3 (Broadstreet Journal) · Commit range covered: `afdfb2b` → this pass.

## Phase 14 — Accessibility (WCAG 2.2 AA)

### Contrast (programmatic — every token pair in use)

| Pair | Ratio | AA (4.5) |
|---|---|---|
| ink #1A1A1A on bg #F9F8F6 / card #FFF | 16.4 / 17.4 | PASS |
| ink-2 #404040 on card | 10.37 | PASS |
| muted #4D4D4D on card / bg / sunken | 8.45 / 7.96 / 7.34 | PASS |
| muted-2 #6B6B6B on card / bg | 5.33 / 5.02 | PASS |
| brand #C63F20 on card / bg (links) | 5.08 / 4.79 | PASS |
| white on brand / brand-strong / ink | 5.08 / 6.62 / 17.4 | PASS |
| success on success-bg / card | 4.56 / 5.13 | PASS |
| warning on warning-bg / card | 4.62 / 5.02 | PASS |
| danger on danger-bg / card | 5.56 / 6.54 | PASS |

**Fixed this pass:** `.badge` carried legacy teal `#115E59` text on the (now rust) tint → `var(--brand-strong)` (5.7:1). `.text-button` legacy `#557066` → `var(--ink-2)`.

### Target size (WCAG 2.2 · 2.5.8)
- **Fixed:** `.text-button` was `padding: 0` (inline overrides removed in `/match` + free Skills Matcher) → base now `padding: 8px 0`.
- **Fixed:** `.btn` now has `min-height: 44px`. `.mk-btn-*` already 44px (v3). `.ft-copy` ≈ 33px (> 24px minimum).

### Focus & keyboard
- Global `:focus-visible` = 2px rust outline, 2px offset (v3). Inputs use `--ring` (2px). ✓
- Skip link present in root layout. Landmarks: `header/main/nav/aside` semantic. ✓
- FAQ uses native `details/summary` (keyboard-free). Match "Why this job?" is a real `<button aria-expanded>`. ✓
- Auth forms use wrapping `<label>`s (verified login/signup/onboarding). ✓
- `aria-current="page"` on active nav: app sidebar, mobile bottom tabs, admin subnav. ✓

### Motion
- Global `prefers-reduced-motion` guard (`animation/transition: none`) covers everything, including v3 hovers. ✓

## Phase 13 — Responsive

Verified in CSS (recompose points): `.mk-hero .grid` stacks ≤~860px · `.ft-split`/`.ft-band-grid`/`.ft-steps` 1-col ≤860 · `.ft-related` 1-col ≤640 · `.dd-cols` 1-col ≤900 · `.dd-stats` 4→2 ≤900 · `.ad-form` 1-col ≤860 · admin tables horizontally scrollable (`.ad-scroll`) · `.app-content` gets 92px bottom padding on mobile so the fixed bottom tab bar never covers content · mobile bottom tabs shipped with AppShell (Phase 2).
Type at 320px: hero uses `clamp()`; digest masthead `clamp(26px, 4vw, 40px)`.

## Phase 15 — Performance

- Fonts: Newsreader (variable, latin subset, 2 files) + Inter via `next/font` — hashed, preloaded, `display: swap`. Satoshi files remain on disk but are no longer referenced (no runtime cost; kept for revert).
- **Removed 8.7KB of dead v1 CSS** this pass, including a never-rendered dark `#06231F` hero (rule compliance: never black), old mockup/marquee/float animations, and the unused `ScrollReveal` rules.
- No raster images anywhere in the UI (inline SVG only, width/height set). No client JS on marketing/free-tool pages beyond the tool forms.

## Phase 16 — Visual QA (anti-slop)

Programmatic greps: zero occurrences of purple/blue gradients, orbs, sparkle glyphs, glassmorphism `backdrop-filter` on cards (only the marketing header, now solid in v3), emoji-as-icons, stock imagery. One accent family (rust + semantic states). Grays warm-only. Display face is Newsreader (not Inter-as-default).
**Fixed this pass:** `mkpulse`/`arpulse` glows and two v2 wash gradients still carried turquoise `rgba(10,169,166,…)` / coral `rgba(255,106,77,…)` — all converted to the rust family. Momentum rail fill was mint→brand gradient → solid rust (one-accent discipline).

## Needs human eyes (cannot verify without a signed-in session)

1. Digest masthead + banner rhythm on a real phone (320px) and desktop.
2. Bottom tab bar thumb-reach + active states while navigating authed pages.
3. Match card verdict chips at a glance (de-gamified layout).
4. Admin ruled tables with real rows.
5. Full keyboard pass (Tab order) on onboarding wizard.

## Parked (unchanged)
Billing completion (FLW key), Render workers, 4 remaining free tools (no truthful backend yet), source adapters, employer verification.
