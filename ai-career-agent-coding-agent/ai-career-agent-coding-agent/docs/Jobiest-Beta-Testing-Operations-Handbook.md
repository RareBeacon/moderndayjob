# JOBIEST — THE AGENT THAT WORKS OVERNIGHT — Beta Testing Operations Handbook

**Version:** 1.0 — 2026-10-21
**Owner:** Jobiest Beta Operations Team — Internal Use Only
**Commit:** 5339c46

## Table of Contents
1. Cover (above)
2. Introduction
3. Objectives
4. Roles
5. Tester Onboarding
6. Stages & Schedule
7. Task Checklist
8. Collecting Feedback
9. Severity & Escalation
10. Tester Register
11. Daily Ops
12. WhatsApp Group
13. Privacy & Safety
14. Metrics
15. FAQ/Troubleshooting
16. Closure Report
17. Appendices

## 2. Introduction
Jobiest finds roles, prepares truthful applications from your experience, and tracks every application. You stay in control — approval is default, Auto requires opt-in.
Beta means a limited group tests real features before public launch. Your feedback decides what we fix first.
Available now: registration/verification, dashboard, job search/filter/save, CV builder with 30 templates + preview/download, AI tools (where data exists), application tracking. Not yet fully verified live: board freshness under load, payment checkout live, external auto-apply submission (gated).

## 3. Objectives
Learn: can users register/verify, understand dashboard, search/filter jobs, create/edit/preview/download CVs, get useful AI help, track applications, use mobile without errors, and what to improve most.

## 4. Roles
**Founder/Product Owner:** approves scope, decides blockers, reviews findings.
**Beta Coordinator:** register, welcome, assign tasks, monitor, remind, escalate, report.
**Support Assistant:** help with registration/onboarding, collect steps/screenshots, never promise fix before verified.
**Technical Team:** reproduce, severity, fix, request retest.
**Beta Tester:** use honestly, complete tasks, report bugs clearly.

## 5. Tester Onboarding
1. Receive registration details.
2. Verify beta registration.
3. Record in register.
4. Send official link: https://jobiest.com
5. Invite to WhatsApp beta group (do not invent link — use actual invite).
6. Explain purpose/rules.
7. Ask to complete profile.
8. Assign first tasks.
9. Ask to report via approved format.
10. Follow up. Confirm joined group + completed onboarding — form ≠ tested.

## 6. Stages
**0 Internal readiness** — audit, gates, site/register/channels ready.
**1 Onboarding** — registration/verification/profile/dashboard access.
**2 Core features** — search/filter/save jobs, create/edit CVs preview/download, AI tools.
**3 Reliability** — repeat tasks, mobile, error handling, persistence.
**4 Bug fix/retest** — share reproducible defects, track, retest.
**5 Closure** — final feedback, top improvements, summary, recommendation.
Timeline relative — coordinator sets start/end and daily targets.

## 7. Task Checklist
- [ ] Open official Jobiest website
- [ ] Register with valid email
- [ ] Receive verification email (check spam)
- [ ] Verify account (6-digit code 10m)
- [ ] Log in
- [ ] Complete profile
- [ ] Explore dashboard
- [ ] Search for jobs
- [ ] Apply filters (location, source)
- [ ] Open job details
- [ ] Save a job
- [ ] Create/edit CV (choose from 30 templates)
- [ ] Preview different templates
- [ ] Download CV PDF/DOCX check layout
- [ ] Try available AI tools (suggest skills, write summary — only with real facts)
- [ ] Track application where supported (create/update status)
- [ ] Refresh page check saved data persists
- [ ] Test on phone
- [ ] Submit feedback / bug

Controlled tests (founder approval): payment, subscription, real external application submission — never spend your money or submit real applications without approval.

## 8. Collecting Feedback
**Bug Report:** Tester ID, Date, Device/Browser, Feature, Task, Expected, Actual, Reproducible (yes/no), Steps, Screenshot, Severity, Suggestions.
**Usability:** What liked? Confused? Difficult? Expected? Improve first? Continue using? Why?
Bug ≠ feature request ≠ opinion.

## 9. Severity
**Critical:** security breach, private data exposure, unauthorized access, data loss, payment danger — escalate immediately private channel, do not post sensitive details in group.
**High:** major feature unusable or many blocked.
**Medium:** works incorrectly with workaround.
**Low:** minor visual/typo.
Acknowledge, record, never promise date.

## 10. Tester Register
| Tester ID | Name | Reg Date | Email | WhatsApp | Verified | Onboarding | Tasks Assigned | Completed | Bugs | Last Activity | Follow-up | Status |
|---|---|---|---|---|---|---|---|

Statuses: Registered, Awaiting group entry, Onboarding, Active testing, Feedback submitted, Awaiting retest, Completed, Inactive. Restrict access, minimize data.

## 11. Daily Ops
Review registrations, onboarding, feedback channel, log bugs, duplicates, escalate urgent, follow inactive, update register, end-of-day report:
Total registered / onboarded / active / tasks completed / new bugs by severity / resolved / awaiting retest / feedback themes / blockers / next actions.

## 12. WhatsApp Group
Welcome new, pin instructions/checklist, share verified updates only, encourage constructive, keep respectful, move sensitive private, separate requests from defects, never promise features/dates.
Samples: Welcome — Hi [Name], welcome to Jobiest beta... Tasks — Your first task: register at jobiest.com... Reminder — Please complete... Bug request — If you hit issue, send steps + screenshot... Retest — [Bug] fixed, please retest... Thank you — Beta closed, thanks...

## 13. Privacy & Safety
Never request passwords/codes/API keys. No sensitive CVs/phones in group. Test payments only, no real applications during testing, no real cards for billing, use sample data, report security privately, limit register access, consent before testimonials.

## 14. Metrics
Registration completion = verified registrations / registrations.
Verification success = verified / attempted.
Onboarding completion = completed profile / registered.
Task completion = tasks done / assigned.
CV creation success = CVs created / attempts.
CV download success = successful downloads / attempts.
Job search success = searches returning results / attempts.
Bugs per severity, time to acknowledge/resolve, retest pass = passed / retested, satisfaction, continue rate. No invented baselines — coordinator proposes targets.

## 15. FAQ
Verification not received → check spam, resend after 60s, ensure RESEND_API_KEY configured (503 truthful error).
Cannot register → check email format, password 8+ number+special, phone E.164 +234..., rate limit 5/h.
Cannot login → reset-password, check verified status.
Blank dashboard → check onboarding-gate, refresh.
Jobs not loading → must be logged in (/api/jobs 401), check filters, board availability.
CV preview not appearing → ensure template selected, check JS enabled, preview is A4 210/297.
Download failing → check entitlement (Free 3 total), document exists.
AI error → check missing info, provider limits, retry once.
Saved info disappearing → check draft autosave + localStorage, login persistence.
Subscription wrong → check webhook verification, entitlements ledger, expiry.
Mobile issues → test 390/320 breakpoints, report device.

## 16. Closure Report
Total registered/onboarded/active/completed, task completion, feedback themes, bugs by severity/resolved/unresolved, risks, top improvements, sentiment, recommended changes, recommendation READY / READY WITH LIMITATIONS / NOT READY — with evidence.

## 17. Appendices
Templates for: tester register, daily report, bug report, feature request, usability feedback, onboarding checklist, weekly progress, fix verification/retest, closure report — as tables above.

