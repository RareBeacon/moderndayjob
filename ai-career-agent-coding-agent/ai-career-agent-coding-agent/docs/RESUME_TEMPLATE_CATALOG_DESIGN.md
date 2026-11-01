# Jobiest Resume Template Design System & ATS Specification

## 1. Canonical Document & Geometry System

- **Paper Standard**: ISO A4 across preview, PDF, and DOCX:
  - **PDF (`pdf-lib`)**: `595.28 x 841.89 pt` (`210 x 297 mm`), selectable standard vector fonts (`Helvetica`, `TimesRoman`, `Courier`), dynamic line wrapping, widow/orphan heading protection, and clean multi-page flow.
  - **DOCX (`docx`)**: `11906 x 16838` twips (`210 x 297 mm`) with matching header shading, palette accents, font family (`Calibri`, `Georgia`, `Consolas`), and 1-column vs 2-column table layout.
  - **Live HTML Preview (`BespokeResumeDocument.tsx`)**: `794 x 1123 px` (`96 DPI` A4) scaled proportionally inside `.miniFrame` cards and `.fullFrame` zoomable (`75%`/`100%`/`125%`) modal inspectors.
- **Canonical Data Contract (`lib/resume-studio/document-model.ts`)**:
  - `NormalizedResumeDocument` normalizes live `StudioDraft`, stored `CV` JSON payloads, and legacy `ExportSection[]` into a single schema covering identity, contact items, summary, experience, categorized skills, education, projects, certifications, publications, awards, languages, volunteer work, memberships, additional notes, and references.
  - Optional sections with empty content are omitted automatically with zero orphan headings or blank layout gaps.

## 2. Structural Differentiation Matrix

Every template in `lib/resume-studio/catalog30.ts` defines an explicit `TemplateBlueprint` varying across 7 orthogonal layout axes:

1. **Masthead Architecture (30 distinct variants)**: Centered sovereign serif, corporate left-split, vertical spine accent, Swiss atelier minimal, full-bleed executive banner, monospace developer spec, AI research banner, data impact strip, product card split, security command dossier, consulting dense line, institutional framed serif, commercial left-split, editorial magazine, operations monogram, creative gallery, Swiss display stack, UX system bar, broadsheet dateline, dark creator sidebar, academic CV, graduate scholar, educator warm card, journal abstract, starter clean objective, pivot hybrid header, specialist badge, project delivery header, global mobility header, and modern split banner.
2. **Body Column Topology (4 flows)**: `single` (linear top-to-bottom), `single-section-rail` (102pt left section-title rail alongside main stream), `two-col-left-rail`, `two-col-right-rail`, and `two-col-dark-left` (full-height dark sidebar).
3. **Section Ordering by Career Archetype**:
   - Corporate / Executive (`01`–`05`, `11`–`15`): Summary -> Experience -> Education / Skills.
   - Engineering / Data / Security (`06`, `08`, `10`): Summary -> Technical Stack / Certifications -> Experience -> Projects.
   - Product / UX / Creative / Project (`09`, `17`, `18`, `28`): Summary -> Selected Projects / Case Studies -> Experience.
   - Academic / Research / Education (`21`–`24`): Summary -> Education & Publications / Credentials -> Appointments.
   - Early Career & Career Pivot (`25`, `26`): Summary -> Education / Transferable Skills & Projects -> Experience.
4. **Section Heading Treatments (10 styles)**: `double-rule`, `full-underline`, `accent-bar-left`, `shaded-band`, `pill-tag`, `centered-rules`, `numbered-index`, `minimal-caps`, `mono-bracket`, and `rail-label`.
5. **Experience Entry Layouts (6 styles)**: `classic` (Role left, Date right, Company subline), `company-first` (Company bold left, Role italic subline), `date-left-rail` (108pt date/location gutter + right content column), `timeline` (vertical accent spine + node markers), `card` (bordered surface container), and `compact-inline` (consulting single-line header).
6. **Skills Presentations (6 styles — zero fake percentage bars)**: `categorized-rows`, `pill-cloud`, `two-col-grid`, `three-col-grid`, `inline-slash`, and `compact-list`.

## 3. Honest ATS Classification Policy

- **`verified` (`atsFriendly: true` — 21 single-column templates)**:
  - Strictly linear top-to-bottom reading order in both stream-order and coordinate-sorted PDF parsers (Workday, Greenhouse, Lever, Taleo, iCIMS).
  - Contact fields placed in main body stream (never trapped in Word/PDF header/footer metadata).
  - Standard recognizable section headings and plain text bullet markers.
- **`partial` (`atsFriendly: false` — 9 two-column templates: `07`, `13`, `14`, `16`, `17`, `18`, `20`, `29`, `30`)**:
  - Primary experience/education stream is emitted first in PDF operator order so stream-order parsers read cleanly, while coordinate-based horizontal parsers may interleave left/right columns at shared Y coordinates.
  - Disclosed transparently on every gallery card (`2-Col Visual`), in the preview modal inspector, and in Resume Studio's template picker.
