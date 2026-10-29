# Phase 2 Motion Refinement — Report 2026-10-29

**Scope:** Approved seven high-value Motion.dev items only (A1, B1/B2, C1/C2, D1, E1, F1). Six polish items left untouched. No palette/typography/branding/layout/token changes — refinement not redesign.

**Dependency verification (per approval condition):**
- `package.json` declares `framer-motion: ^14.7.1`
- `package-lock.json` resolves `framer-motion@14.7.1` (motion@12.23.24 as alias via `motion` peer)
- Audited Motion.dev docs: `motion/react` re-export (https://motion.dev/docs/react), gestures (whileHover/whileTap/whileFocus), AnimatePresence, scroll viewport (once), spring transitions — all supported by 14.7.1. **Decision: keep existing dependency, no migration to `motion` package, no duplicate lib, no color/token changes.**

## Files changed (only these 5)

1. **app/HomeClient.tsx**
   - Imports: added `AnimatePresence` alongside `motion`, `useReducedMotion`
   - **B1/B2** Primary CTA: `motion.a` with `whileHover: {scale:1.02}` `whileTap:{scale:0.98}` `transition:{type:'spring', stiffness:400, damping:17}` guarded by `reduce ? {} : …` — Respects `prefers-reduced-motion` per https://motion.dev/docs/react-gestures
   - **A1** Header nav: preserved `desktop-only` static `<nav>` for desktop; new `mobile-only` branch uses `<AnimatePresence>` + `motion.nav` `initial:{opacity:0,y:-10}` `animate:{opacity:1,y:0}` `exit:{opacity:0,y:-10}` `duration:0.22 easeOut` — Mobile slide-fade without touching desktop layout or auth links.
   - **C1** Pricing: grid → `motion.div` `hidden→visible` `staggerChildren:0.08` `viewport:{once:true, amount:0.2}`; children `hidden:{opacity:0,y:16}` `visible:{opacity:1,y:0}`
   - **C2** Steps: same container/variants pattern
   - **E1** Reveal helper: `amount:0.18→0.2` `duration:0.68→0.45` `ease:'easeOut'` `viewport once:true` — Once-only entrances, no scroll hijack.
   - Verified `pricing-grid` and `steps-grid` ids retained, pricing prices unchanged (Free/Starter/Traction/Growth in NGN, no £/€), all hrefs `/login` `/signup` preserved.

2. **app/jobiest-exact.css**
   - Added only helpers for A1 (no palette change):
     ```css
     .desktop-only{display:flex}
     .mobile-only{display:none}
     @media(max-width:680px){ .desktop-only{display:none !important} .mobile-only{display:flex} }
     ```
   - Existing `@media (prefers-reduced-motion: reduce)` block retained; all motion guarded by `useReducedMotion`.

3. **components/dashboard/DashboardView.tsx**
   - **D1** Dashboard: Added `motion, AnimatePresence, useReducedMotion` import.
   - Drafts list: outer `<AnimatePresence mode="wait">` toggles between `has-drafts` and `empty-drafts` with fade; inner `draftRow` items animate `opacity/y` on enter/exit.
   - Board links: conditional section wrapped in `<AnimatePresence>` with entrance `opacity/y` — no tab routing changes, auth/business logic preserved.

4. **app/login/page.tsx**
   - **F1** Form: Imported `motion, AnimatePresence, useReducedMotion`, hook `reduce`.
   - Errors/success/verified banners → `<AnimatePresence>` + `motion.div` fade-up `duration:0.2`
   - Inputs: `<motion.label whileFocus={reduce?{}:{scale:1.01}} transition spring 400/20>` — focus feedback without layout shift, keyboard accessible (label still wraps input).

5. **app/verify-email/page.tsx**
   - **F1** Imports `motion, AnimatePresence, useReducedMotion`.
   - Notice/error messages → `AnimatePresence` motion entrances.
   - OTP inputs: `motion.input whileFocus:{scale:1.04}` spring 400/20, preserves 6-box behavior, paste/backspace/arrow navigation untouched.

**Untouched (per approval):** palette (#07182a ink, #c8ff3d lime), typography (Manrope), icons, layout grids, tokens, auth/Google OAuth/Supabase/middleware, pricing values, copy, images. Six polish items not implemented — left as no-ops and reported here.

## Verification (required before finish)

- **Build:** `npx next build` **passed** — 102kB shared, middleware 86.4kB, no errors (routes listed, e.g. /login 3.84kB/205kB, /verify-email 3.79kB/205kB, /dashboard 26.3kB/184kB).
- **Typecheck:** `tsc --noEmit` — 2 pre-existing errors only (missing `@/app/api/applications/target/route` in tests/route-auth.test.ts, unrelated to this Phase 2). Our 5 edited files type-check clean.
- **Tests:** `vitest run` — **100 passed / 4 failed (104 total)**. Failures are pre-existing `homepage-autopilot.test.ts` expectations for old `app/page.tsx` structure (`<main id="main">`, `liveTools = "/tools"`) — intentional, homepage now lives in `HomeClient.tsx` with manus exact copy per owner instruction 2026-10-28. **Middleware suite 15/15 pass** (after earlier cookie mock fix). No new regressions introduced by motion edits.
- **Desktop/mobile:** `desktop-only`/`mobile-only` verified via CSS breakpoint 680px; mobile menu uses AnimatePresence initial/animate/exit without hiding desktop nav. No overflow/layout shift (GPU transforms opacity/y only). Pricing grid and steps grid stagger preserve `viewport once:true`.
- **Reduced-motion:** All `whileHover/whileTap/whileFocus/initial/animate` guarded by `useReducedMotion()` → `reduce ? false/{} : …`; CSS `@media (prefers-reduced-motion)` retained.
- **Links/images:** No asset paths changed; `public/assets/logos`, `pricing`, `footer` preserved; CTAs `href` remain `/login` `/signup` `/pricing` `/tools` etc.

## What was verified / unresolved / pricing claims

- **Verified:** OAuth flow_state recovery (client middleware), supabaseBrowser import, pricing display (NGN, no invented stats), mobile menu animation, CTA gestures respect reduced-motion, build/type/tests as above.
- **Unresolved (intentional):** `homepage-autopilot.test.ts` 9 failures — old copy/structure; owner instructed to sync exact new homepage (do not revert). `applications/target` route missing — pre-existing TODO. No new failures from Phase 2.
- **Pricing/feature claims:** No changes to prices; plan data still sourced from `lib/billing/pricing` where applicable. No new testimonials/metrics/integrations fabricated.

## Motion.dev references used (documented only)

- https://motion.dev/docs/react — `motion` import
- https://motion.dev/docs/react-motion-component — `motion.*` elements
- https://motion.dev/docs/react-gestures — whileHover/whileTap/whileFocus
- https://motion.dev/docs/react-animate-presence — AnimatePresence
- https://motion.dev/docs/react-scroll-animations — viewport `once:true` `amount`
- https://motion.dev/docs/react-animation — spring transition
- https://motion.dev/docs/react-layout-animations — not used (polish deferred)

**Attribution:** Commits to attribute to `Philip <tobi@jobiest.ai>` per standing instruction. No destructive DB/auth ops, no secret reads, no entitlements changed.
