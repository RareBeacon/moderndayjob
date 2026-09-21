# Resume Template Architecture (Workstream C)

## Current design (deployed 2026-09-21)

Templates are config-driven, not bespoke components: every template is a `ResumeTemplate` record (category, layout, density, skill style, personality, accent, heading style, and now photo support, ATS flag, columns, catalog id) rendered by one shared renderer. This is why 20 new templates could ship as data plus badge helpers rather than 20 new components, and why switching templates preserves content.

- Registry: `lib/resume-studio/templates.ts` (70 templates: 50 original + `MASTER_CATALOG_TEMPLATES` per C3.1)
- Badge helpers: `templatePhotoSupport`, `templateAtsFriendly`, `templateColumns` (legacy entries default to none/false/layout-derived columns)
- Wizard: `/generate` template step with recommendations, category filters, per-category counts, miniature previews
- Public gallery: `/templates` (`components/resume/TemplateGallery.tsx`), server-rendered page, client-side filtering, fictional sample data
- Export: existing PDF/DOCX pipeline via `/api/documents/[id]/export` (selectable text, page-break aware)

## Remaining work for full C-spec completion (next session, sequenced)

1. Photo upload API with server-side MIME (jpeg, png, webp) and size validation, stored per-draft; surfaced in the wizard only on photo-capable templates (optional/required).
2. Photo rendering in the wizard preview and the PDF/DOCX export pipeline for photo-capable templates.
3. The 20 per-template export checklists (selectable PDF text, natural page breaks, no overflow, multi-page flow, optional sections, 375px and 1280px usability) to be executed once photos render end to end.

These items are sequenced deliberately after the catalog and gallery because they touch the document export pipeline and deserve dedicated verification; they are documented here so nothing is silently implied as done. Everything deployed today (catalog, attributes, gallery, badges, tests) is complete and verified live.
