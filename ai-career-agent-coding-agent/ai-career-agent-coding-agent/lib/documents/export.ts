import {
  Document as DocxDocument,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { DocumentMode } from '@/lib/resume-studio/draft';
import { parsePhotoDataUrl } from '@/lib/resume-studio/photo';
import {
  applyDocumentModeToResume,
  normalizeResumeFromStoredJson,
  toPdfSafeText,
  type NormalizedResumeDocument,
  type StoredCvPayload,
} from '@/lib/resume-studio/document-model';
import { ALL_TEMPLATES, getResumeTemplate } from '@/lib/resume-studio/templates';
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  renderTemplateDocx,
  renderTemplatePdf,
  resolveValidatedPhoto,
  type ExportSection,
  type PhotoInput,
  type ValidatedPhoto,
} from './template-export';

export type { ExportSection, PhotoInput, ValidatedPhoto };

export function isKnownResumeTemplateId(id?: string | null): id is string {
  return Boolean(id && ALL_TEMPLATES.some((t) => t.id === id));
}

export interface ParsedDocument {
  title: string;
  photo?: ValidatedPhoto;
  templateId?: string;
  documentMode?: DocumentMode;
  resume?: NormalizedResumeDocument;
  sections: ExportSection[];
}

export function parseDocumentContent(
  type: string,
  raw: string,
  fallbackTitle = 'Document',
  requestedDocumentMode?: DocumentMode | null,
): ParsedDocument {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { title: fallbackTitle, sections: [{ lines: ['(empty document)'] }] };

  if (type === 'CV') {
    try {
      const json = JSON.parse(trimmed) as StoredCvPayload;
      const sections: ExportSection[] = [];
      const contactBits = [
        json.contact?.name,
        json.contact?.email,
        json.contact?.phone,
        json.contact?.location,
      ].filter(Boolean) as string[];
      const linkBits = [
        json.contact?.website,
        json.contact?.linkedin,
        json.contact?.github,
      ].filter(Boolean) as string[];
      if (contactBits.length || linkBits.length) {
        sections.push({
          lines: [
            ...(contactBits.length ? [contactBits.join('  |  ')] : []),
            ...(linkBits.length ? [linkBits.join('  |  ')] : []),
          ],
        });
      }
      if (json.summary) sections.push({ heading: 'Summary', lines: [json.summary] });
      if (json.experiences?.length) {
        const lines: string[] = [];
        for (const exp of json.experiences) {
          const span = [exp.start, exp.end].filter(Boolean).join(' - ');
          const roleLine = [exp.title, exp.company, exp.location].filter(Boolean).join(' - ');
          lines.push(span ? `${roleLine} (${span})` : roleLine);
          for (const b of exp.bullets ?? []) lines.push(`- ${b}`);
        }
        sections.push({ heading: 'Experience', lines });
      }
      if (json.skills?.length) {
        const skillNames = json.skills
          .map((s) => (typeof s === 'string' ? s : s.name))
          .filter(Boolean);
        sections.push({ heading: 'Skills', lines: [skillNames.join(', ')] });
      }
      if (json.education?.length) {
        const lines: string[] = [];
        for (const e of json.education) {
          const qual = e.qualification || [e.degree, e.field].filter(Boolean).join(', ');
          const span = [e.start, e.end].filter(Boolean).join(' - ');
          const base = [qual, e.institution].filter(Boolean).join(' - ');
          lines.push(span ? `${base} (${span})` : base);
          if (e.achievements) lines.push(`- ${e.achievements}`);
        }
        sections.push({ heading: 'Education', lines });
      }
      if (json.projects?.length) {
        const lines: string[] = [];
        for (const p of json.projects) {
          lines.push([p.name, p.url].filter(Boolean).join(' - '));
          if (p.description) lines.push(p.description);
          for (const a of p.achievements ?? []) lines.push(`- ${a}`);
        }
        sections.push({ heading: 'Projects', lines });
      }
      if (json.certifications?.length) {
        sections.push({
          heading: 'Certifications',
          lines: json.certifications.map((c) => [c.name, c.issuer, c.date].filter(Boolean).join(' - ')),
        });
      }
      if (json.publications?.length) {
        sections.push({
          heading: 'Publications',
          lines: json.publications.map((p) => [p.title, p.venue, p.date, p.url].filter(Boolean).join(' - ')),
        });
      }
      if (json.volunteer?.length) {
        sections.push({
          heading: 'Volunteer Leadership',
          lines: json.volunteer.map((v) => [v.role, v.organization, v.dates, v.summary].filter(Boolean).join(' - ')),
        });
      }
      if (json.memberships?.length) {
        sections.push({ heading: 'Professional Memberships', lines: [json.memberships.join(' | ')] });
      }
      if (json.languages?.length) {
        sections.push({
          heading: 'Languages',
          lines: [
            json.languages
              .map((l) => (typeof l === 'string' ? l : [l.language, l.proficiency].filter(Boolean).join(' - ')))
              .filter(Boolean)
              .join(', '),
          ],
        });
      }
      if (json.achievements?.length) {
        sections.push({ heading: 'Highlights', lines: json.achievements.map((a) => `- ${a}`) });
      }
      if (json.additional) sections.push({ heading: 'Additional', lines: [json.additional] });
      if (json.references) sections.push({ heading: 'References', lines: [json.references] });

      const photoCheck = parsePhotoDataUrl(json.photoDataUrl);
      const validPhoto: ValidatedPhoto | undefined = photoCheck.ok
        ? { bytes: photoCheck.bytes, mime: photoCheck.mime }
        : undefined;

      const baseResume = normalizeResumeFromStoredJson({
        ...json,
        photoDataUrl: validPhoto ? json.photoDataUrl : '',
      });
      const effectiveMode: DocumentMode =
        requestedDocumentMode === 'cv' || requestedDocumentMode === 'resume'
          ? requestedDocumentMode
          : baseResume.documentMode === 'cv'
            ? 'cv'
            : 'resume';
      const resume = requestedDocumentMode ? applyDocumentModeToResume(baseResume, requestedDocumentMode) : baseResume;

      return {
        title: json.headline || json.contact?.name || fallbackTitle,
        photo: validPhoto,
        templateId: isKnownResumeTemplateId(json.templateId) ? json.templateId : undefined,
        documentMode: effectiveMode,
        resume,
        sections: sections.length ? sections : [{ lines: [trimmed] }],
      };
    } catch {
      // fall through to plain text
    }
  }

  if (type === 'ANSWERS') {
    try {
      const json = JSON.parse(trimmed) as { answers?: Array<{ question: string; answer: string }> };
      if (json.answers?.length) {
        return {
          title: fallbackTitle,
          sections: json.answers.map((a, i) => ({
            heading: `Q${i + 1}`,
            lines: [a.question, '', a.answer],
          })),
        };
      }
    } catch {
      // fall through
    }
  }

  const paragraphs = trimmed.split(/\n{2,}/);
  return {
    title: fallbackTitle,
    sections: paragraphs.map((p) => {
      const lines = p.split('\n');
      if (lines[0]?.startsWith('#')) {
        return {
          heading: lines[0].replace(/^#+\s*/, ''),
          lines: lines.slice(1).map((l) => l.replace(/^[-*]\s*/, '')),
        };
      }
      return { lines };
    }),
  };
}

export async function renderPdf(
  title: string,
  sections: ExportSection[],
  photo?: PhotoInput,
  templateId?: string | null,
  resume?: NormalizedResumeDocument | null,
): Promise<Buffer> {
  if (isKnownResumeTemplateId(templateId)) {
    return renderTemplatePdf(title, sections, getResumeTemplate(templateId), photo, resume);
  }
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = A4_WIDTH_PT;
  const pageHeight = A4_HEIGHT_PT;
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawWrapped = (text: string, size: number, useBold = false, color = rgb(0.08, 0.1, 0.14)) => {
    const f = useBold ? bold : font;
    const safeText = toPdfSafeText(text);
    const words = safeText.split(/\s+/).filter(Boolean);
    let current = '';
    const flush = () => {
      if (!current) return;
      ensureSpace(size * 1.45);
      page.drawText(current, { x: margin, y: y - size, size, font: f, color });
      y -= size * 1.45;
      current = '';
    };
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        flush();
        current = w;
      } else {
        current = candidate;
      }
    }
    flush();
  };

  const validPhoto = resolveValidatedPhoto(photo);
  if (validPhoto) {
    const embedded =
      validPhoto.mime === 'image/png'
        ? await pdf.embedPng(validPhoto.bytes)
        : await pdf.embedJpg(validPhoto.bytes);
    const size = 56;
    page.drawImage(embedded, {
      x: pageWidth - margin - size,
      y: pageHeight - margin - size,
      width: size,
      height: size,
    });
  }

  drawWrapped(title, 18, true, rgb(0.04, 0.15, 0.25));
  y -= 8;

  for (const section of sections) {
    if (section.heading) {
      y -= 6;
      ensureSpace(22);
      drawWrapped(section.heading.toUpperCase(), 10, true, rgb(0.06, 0.46, 0.43));
      y -= 2;
    }
    for (const line of section.lines) {
      if (!line) {
        y -= 6;
        continue;
      }
      drawWrapped(line, 10.5, false);
    }
    y -= 4;
  }

  return Buffer.from(await pdf.save());
}

export async function renderDocx(
  title: string,
  sections: ExportSection[],
  photo?: PhotoInput,
  templateId?: string | null,
  resume?: NormalizedResumeDocument | null,
): Promise<Buffer> {
  if (isKnownResumeTemplateId(templateId)) {
    return renderTemplateDocx(title, sections, getResumeTemplate(templateId), photo, resume);
  }
  const children: Paragraph[] = [];
  const validPhoto = resolveValidatedPhoto(photo);
  if (validPhoto) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new ImageRun({
            data: validPhoto.bytes,
            transformation: { width: 72, height: 72 },
            type: validPhoto.mime === 'image/png' ? 'png' : 'jpg',
          }),
        ],
      }),
    );
  }
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 180 },
      children: [new TextRun({ text: title, bold: true, size: 32 })],
    }),
  );

  for (const section of sections) {
    if (section.heading) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 220, after: 80 },
          children: [new TextRun({ text: section.heading, bold: true, size: 22, color: '0F766E' })],
        }),
      );
    }
    for (const line of section.lines) {
      const isBullet = line.startsWith('- ');
      children.push(
        new Paragraph({
          bullet: isBullet ? { level: 0 } : undefined,
          spacing: { after: 60 },
          children: [new TextRun({ text: isBullet ? line.slice(2) : line, size: 21 })],
        }),
      );
    }
  }

  const doc = new DocxDocument({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
          },
        },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
