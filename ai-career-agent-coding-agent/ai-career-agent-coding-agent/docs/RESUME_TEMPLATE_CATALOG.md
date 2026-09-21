# Resume Template Catalog (Workstream C, C3.1)

Deployed: 2026-09-21, commit 21ef02e. The spec's exact 20-template catalog ships as `MASTER_CATALOG_TEMPLATES` in `lib/resume-studio/templates.ts`, growing the library from 50 to 70 templates. Attributes per the spec table, enforced by `tests/resume-templates-master.test.ts`.

| # | Catalog id | Template Name | Photo | ATS-Oriented | Columns |
|---|---|---|---|---|---|
| 1 | TPL-01 | Modern Professional | Optional | No | 1 |
| 2 | TPL-02 | Classic Professional | No | Yes | 1 |
| 3 | TPL-03 | ATS-Friendly Simple | No | Yes | 1 |
| 4 | TPL-04 | Graduate Entry-Level | Optional | Yes | 1 |
| 5 | TPL-05 | Academic CV | No | No | 1 |
| 6 | TPL-06 | Technology Professional | No | Partial (flagged non-ATS) | 2 |
| 7 | TPL-07 | Software Engineer | No | Partial (flagged non-ATS) | 2 |
| 8 | TPL-08 | Data Scientist | No | Partial (flagged non-ATS) | 2 |
| 9 | TPL-09 | Business Analyst | No | Yes | 1 |
| 10 | TPL-10 | Project Manager | No | Yes | 1 |
| 11 | TPL-11 | Marketing Professional | Optional | No | 2 |
| 12 | TPL-12 | Sales Professional | Optional | No | 1 |
| 13 | TPL-13 | Finance Professional | No | Yes | 1 |
| 14 | TPL-14 | Creative Professional | Optional | No | 2 |
| 15 | TPL-15 | Executive Leadership | No | No | 1 |
| 16 | TPL-16 | International Professional | Optional | No | 1 |
| 17 | TPL-17 | Career Change | Optional | Yes | 1 |
| 18 | TPL-18 | Minimalist One-Page | No | Yes | 1 |
| 19 | TPL-19 | Modern Two-Column | Optional | No | 2 |
| 20 | TPL-20 | Professional Photo Resume | Required | No | 2 |

Note on "Partial" ATS rows (TPL-06/07/08): the spec marks these partial because two-column layouts parse less reliably in some applicant tracking systems. The catalog encodes this honestly as `atsFriendly: false` with a two-column layout, and the gallery badge shows "2-Column" without an ATS badge, so users can make an informed choice rather than seeing a misleading "ATS-Friendly" badge.

## Integration

- Each catalog entry is a full `ResumeTemplate` config (layout, density, skill style, personality, accent) rendered by the existing shared renderer, so all 20 are selectable in the Resume Studio wizard today.
- The public gallery at `/templates` shows all 70 templates with cards, filters (All, ATS-Friendly, With Photo, One-Page, Two-Column, Category), and fictional sample data (Alex Morgan) per the spec's C4 requirements.
- Wizard copy updated to 70 templates with per-category counts.
- The original 50 templates are untouched except one: "Sales Professional" (original) was renamed "Sales Pro" so the spec's exact catalog name "Sales Professional" belongs to TPL-12.

## Gallery verification (live, 2026-09-21)

`/templates` returns HTTP 200 with a 56-character title, 70 cards, 70 photo badges, 11 ATS badges, and the Alex Morgan sample present. Added to the sitemap and the canonical public URL allowlist.
