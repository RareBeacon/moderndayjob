# Jobiest Resume Library — Phase 1 Audit & 30-Template Inventory

## 1. Phase 1 Codebase Audit Summary (Pre-Rebuild State)

| Subsystem | Audited Path(s) | Pre-Rebuild Finding | Rebuild Resolution |
| --- | --- | --- | --- |
| Template Catalog | `lib/resume-studio/templates.ts`, `lib/resume-studio/dribbble30.ts` | 30 `DRIBBBLE_30` presets (`drb-01-*`..`drb-30-*`) shared a narrow set of color/sidebar variations (`DribbbleResume.tsx`) and labeled 17 templates ATS-friendly without distinguishing 1-col vs 2-col parser risks. | Built `lib/resume-studio/catalog30.ts` (`tpl-01-executive`..`tpl-30-modern-two-column`, Groups A–F) with 30 distinct layout blueprints while retaining `DRIBBBLE_30` & `MASTER_CATALOG_TEMPLATES` in `LEGACY_TEMPLATES` / `ALL_TEMPLATES` for 100% backward compatibility. |
| Data Normalization | `lib/resume-studio/draft.ts`, `lib/documents/export.ts` | `StudioDraft` lacked structured `languages`, `publications`, `volunteer`, and `memberships`; export parsed sections into flat strings. | Created `lib/resume-studio/document-model.ts` (`NormalizedResumeDocument`) preserving all existing user drafts while adding optional structured sections and graceful empty-section omission. |
| PDF & DOCX Export | `lib/documents/template-export.ts`, `lib/documents/export.ts` | Used US Letter (`612 x 792 pt`) instead of ISO A4 (`595.28 x 841.89 pt`) and routed exports through only 5 generic layout buckets. | Rebuilt `renderTemplatePdf` and `renderTemplateDocx` on true ISO A4 (`595.28 x 841.89 pt` / `11906 x 16838` twips) executing all 30 unique mastheads, section heading treatments, experience structures, skill renderers, and column flows. |
| Preview Renderer | `components/resume/DribbbleResume.tsx`, `ResumeDocumentPreview.tsx` | HTML preview did not use A4 `794 x 1123 px` geometry and diverged visually from exported PDFs. | Built `BespokeResumeDocument.tsx` (`794 x 1123 px` A4 canvas) wired into `ResumeDocumentPreview` (`mini` and `full` scale wrappers) matching `renderTemplatePdf`. |
| Resume Library UI | `app/templates/page.tsx`, `components/resume/TemplateGallery.tsx` | Had only 4 category tabs (`Modern`, `Corporate`, `Creative`, `Minimalist`), no search, no ATS/column/career-group filters, and no zoomable A4 inspector. | Rebuilt `/templates` with Jobiest brand header, breadcrumbs, live search, 10 category tabs + counts, career-group/column/ATS filters, honest ATS badges, and a zoomable (`75%`/`100%`/`125%`) full-size A4 modal inspector. |

## 2. Complete 30-Template Active Catalog (`tpl-01` – `tpl-30`)

| Code | ID | Name | Group | Columns | ATS Status | Photo | Structural Signature |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `01` | `tpl-01-executive` | The Executive | Group A | 1 | `verified` | `none` | Centered sovereign serif masthead + double rules + 3-col board mandate box |
| `02` | `tpl-02-corporate-standard` | The Corporate Standard | Group A | 1 | `verified` | `none` | Wall Street left-split serif header + full-underline headings + right-aligned dates |
| `03` | `tpl-03-modern-professional` | The Modern Professional | Group A | 1 | `verified` | `none` | Cobalt vertical header spine + 108pt left date-rail experience entries |
| `04` | `tpl-04-elegant-minimalist` | The Elegant Minimalist | Group A | 1 | `verified` | `none` | Generous whitespace + 102pt left section-label rail alongside main column |
| `05` | `tpl-05-senior-leader` | The Senior Leader | Group A | 1 | `verified` | `none` | Full-bleed `#111D35` navy banner + executive summary callout + 2-col competency grid |
| `06` | `tpl-06-software-engineer` | The Software Engineer | Group B | 1 | `verified` | `none` | Monospace spec-sheet header + `[ SECTION ]` headings + Technical Stack matrix first |
| `07` | `tpl-07-ai-ml-specialist` | The AI & ML Specialist | Group B | 2 | `partial` | `none` | Lavender-indigo research banner + 66/34 right technical & publications rail |
| `08` | `tpl-08-data-scientist` | The Data Scientist | Group B | 1 | `verified` | `none` | Deep-teal top bar + 3-pillar analytical impact strip + 3-col quantitative methods grid |
| `09` | `tpl-09-product-manager` | The Product Manager | Group B | 1 | `verified` | `none` | Product card masthead + pill-tag headings + 2-col product launch cards |
| `10` | `tpl-10-cybersecurity-specialist` | The Cybersecurity Specialist | Group B | 1 | `verified` | `none` | Dark slate/emerald command dossier + Certifications surfaced immediately after summary |
| `11` | `tpl-11-management-consultant` | The Management Consultant | Group C | 1 | `verified` | `none` | High-density MBB case-sheet + inline `Company — Role` rows + tight bullet rhythm |
| `12` | `tpl-12-financial-analyst` | The Financial Analyst | Group C | 1 | `verified` | `none` | Institutional centered double-rule serif + small-caps centered headings |
| `13` | `tpl-13-business-development` | The Business Development Professional | Group C | 2 | `partial` | `none` | Amber/navy commercial split + 31% left revenue/skills/credentials rail |
| `14` | `tpl-14-marketing-strategist` | The Marketing Strategist | Group C | 2 | `partial` | `none` | Editorial rose/plum masthead + Campaign Portfolio + 35% warm right sidebar |
| `15` | `tpl-15-operations-manager` | The Operations Manager | Group C | 1 | `verified` | `none` | Monogram badge blueprint + numbered `01..05` shaded section bands |
| `16` | `tpl-16-creative-professional` | The Creative Professional | Group D | 2 | `partial` | `optional` | Terracotta/alabaster gallery header + 32% tinted left creative rail |
| `17` | `tpl-17-graphic-designer` | The Graphic Designer | Group D | 2 | `partial` | `optional` | Swiss stacked display typography + Selected Works led main column + 30% studio rail |
| `18` | `tpl-18-ux-ui-designer` | The UX/UI Designer | Group D | 2 | `partial` | `none` | Design-system top bar + Case Studies before experience + 33% methods/tools rail |
| `19` | `tpl-19-content-communications` | The Content & Communications Specialist | Group D | 1 | `verified` | `none` | Literary broadsheet dateline masthead + serif editorial storytelling |
| `20` | `tpl-20-digital-creator` | The Digital Creator | Group D | 2 | `partial` | `optional` | Full-height `#0F172A` dark left sidebar + crisp white main showcase column |
| `21` | `tpl-21-academic-researcher` | The Academic Researcher | Group E | 1 | `verified` | `none` | Formal `CURRICULUM VITAE` serif + Education & Publications before appointments |
| `22` | `tpl-22-graduate-academic` | The Graduate Academic | Group E | 1 | `verified` | `none` | Scholarly indigo serif + Education, Research Projects & Awards prioritized |
| `23` | `tpl-23-teacher-educator` | The Teacher & Educator | Group E | 1 | `verified` | `none` | Warm sage/forest card header + Certifications & Education before classroom roles |
| `24` | `tpl-24-scientific-professional` | The Scientific Professional | Group E | 1 | `verified` | `none` | Journal-abstract double rule + Laboratory/Technical Methodologies before R&D roles |
| `25` | `tpl-25-graduate-starter` | The Graduate Starter | Group F | 1 | `verified` | `none` | Sky-tinted early-career header + Education -> Skills -> Projects -> Experience |
| `26` | `tpl-26-career-changer` | The Career Changer | Group F | 1 | `verified` | `none` | Target-role pivot header + 2-col Transferable Skills & Applied Projects before work history |
| `27` | `tpl-27-experienced-specialist` | The Experienced Specialist | Group F | 1 | `verified` | `none` | Specialist badge header + connected vertical career-progression timeline |
| `28` | `tpl-28-project-based-professional` | The Project-Based Professional | Group F | 1 | `verified` | `none` | Structured engagement header + Major Project & Client Deliveries before employment |
| `29` | `tpl-29-international-professional` | The International Professional | Group F | 2 | `partial` | `optional` | Global mobility header + Languages surfaced at top of 33% right rail |
| `30` | `tpl-30-modern-two-column` | The Modern Two-Column | Group F | 2 | `partial` | `optional` | Signature `#111D35` Jobiest navy banner + balanced 64/36 contemporary two-column layout |
