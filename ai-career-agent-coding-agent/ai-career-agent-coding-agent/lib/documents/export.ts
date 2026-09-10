import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

/**
 * Server-side PDF/DOCX export for generated career documents.
 *
 * pdf-lib (already a dependency) renders the PDF; the `docx` package renders
 * DOCX. Both are pure-JS and safe in the serverless runtime. This module is
 * imported ONLY by server routes, so no browser bundle grows.
 *
 * The em/en-dash rule applies to the source content (already sanitized at
 * generation time); export is a pure render and adds nothing.
 */

export interface ExportSection {
  heading?: string;
  lines: string[];
  /** Parallel to `lines`: true renders the line as a bullet. */
  bullets?: boolean[];
}

export interface ParsedDocument {
  title: string;
  sections: ExportSection[];
}

interface CvJson {
  headline?: string;
  summary?: string;
  experiences?: { company?: string; title?: string; start?: string; end?: string; bullets?: string[] }[];
  skills?: string[];
  education?: { institution?: string; qualification?: string }[];
  answers?: { question?: string; answer?: string }[];
  body?: string;
}

function firstNonEmpty(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** Interpret stored content into a render-ready title + section list. */
export function parseDocumentContent(kind: string, content: string): ParsedDocument {
  let json: CvJson | null = null;
  try {
    json = JSON.parse(content) as CvJson;
  } catch {
    json = null;
  }

  if (kind === 'CV' && json && (json.headline || json.summary || json.experiences)) {
    const sections: ExportSection[] = [];
    const h = firstNonEmpty(json.headline);
    const s = firstNonEmpty(json.summary);
    if (h) sections.push({ heading: undefined, lines: [h] });
    if (s) sections.push({ heading: 'Professional summary', lines: [s] });
    if (json.experiences?.length) {
      const lines: string[] = [];
      const bullets: boolean[] = [];
      for (const e of json.experiences) {
        const head = [e.title, e.company].filter((x) => x && String(x).trim()).join(' - ');
        const when = [e.start, e.end].filter((x) => x && String(x).trim()).join(' to ');
        if (head || when) {
          lines.push([head, when].filter(Boolean).join(', '));
          bullets.push(false);
        }
        for (const b of e.bullets ?? []) {
          if (b && b.trim()) { lines.push(b.trim()); bullets.push(true); }
        }
      }
      sections.push({ heading: 'Experience', lines, bullets });
    }
    if (json.skills?.length) {
      sections.push({ heading: 'Skills', lines: [json.skills.join(', ')] });
    }
    if (json.education?.length) {
      sections.push({
        heading: 'Education',
        lines: json.education.map((e) => [e.qualification, e.institution].filter((x) => x && String(x).trim()).join(' - ')).filter(Boolean),
      });
    }
    return { title: h ?? 'Resume', sections };
  }

  if (kind === 'ANSWERS' && json?.answers?.length) {
    const lines: string[] = [];
    const bullets: boolean[] = [];
    for (const a of json.answers) {
      if (a.question) { lines.push(`Q: ${a.question}`); bullets.push(false); }
      if (a.answer) { lines.push(a.answer); bullets.push(false); }
    }
    return { title: 'Application answers', sections: [{ heading: 'Answers', lines, bullets }] };
  }

  if (kind === 'COVER_LETTER') {
    const bodyText = json?.body ?? content;
    return {
      title: 'Cover letter',
      sections: bodyText
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => ({ heading: undefined, lines: [p] })),
    };
  }

  // Fallback: plain text (markdown-ish) content.
  const text = (json?.body ?? content).trim();
  const sections: ExportSection[] = [];
  let current: ExportSection | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.replace(/^#+\s*/, '');
    if (line.startsWith('#')) {
      sections.push({ heading, lines: [] });
      current = sections[sections.length - 1];
    } else if (/^[-*•]\s+/.test(line)) {
      if (!current) { current = { heading: undefined, lines: [] }; sections.push(current); }
      current.lines.push(line.replace(/^[-*•]\s+/, ''));
      current.bullets = current.bullets ?? [];
      current.bullets.push(true);
    } else {
      if (!current) { current = { heading: undefined, lines: [] }; sections.push(current); }
      current.lines.push(line);
      current.bullets = current.bullets ?? [];
      current.bullets.push(false);
    }
  }
  return { title: 'Document', sections };
}

/* ---------- PDF ---------- */

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 56;
const MAX_CHARS_PER_LINE = 92;

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (out.length === 0) { out.push(word); continue; }
    const last = out[out.length - 1];
    if ((last + ' ' + word).length <= max) out[out.length - 1] = last + ' ' + word;
    else out.push(word);
  }
  return out;
}

export async function renderPdf(title: string, sections: ExportSection[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawLine = (text: string, size: number, font: typeof regular, color = rgb(0.12, 0.12, 0.16)) => {
    for (const l of wrap(text, MAX_CHARS_PER_LINE)) {
      ensure(size + 4);
      page.drawText(l, { x: MARGIN, y, size, font, color });
      y -= size + 4;
    }
  };

  drawLine(title, 20, bold);
  y -= 6;

  for (const s of sections) {
    if (s.heading) {
      ensure(24);
      y -= 4;
      drawLine(s.heading, 13, bold, rgb(0.15, 0.16, 0.22));
      y -= 2;
    }
    s.lines.forEach((line, i) => {
      const isBullet = s.bullets?.[i] === true;
      ensure(12);
      const prefix = isBullet ? '  •  ' : '';
      for (const l of wrap(prefix + line, MAX_CHARS_PER_LINE)) {
        ensure(12);
        page.drawText(l, { x: MARGIN, y, size: 10.5, font: regular });
        y -= 12.5;
      }
    });
    y -= 4;
  }

  return Buffer.from(await doc.save());
}

/* ---------- DOCX ---------- */

export async function renderDocx(title: string, sections: ExportSection[]): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title, bold: true })] }),
  ];
  for (const s of sections) {
    if (s.heading) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: s.heading, bold: true })] }));
    }
    s.lines.forEach((line, i) => {
      const isBullet = s.bullets?.[i] === true;
      children.push(
        new Paragraph({
          bullet: isBullet ? { level: 0 } : undefined,
          spacing: { after: 80 },
          children: [new TextRun({ text: line, size: 22 /* half-points => 11pt */ })],
        }),
      );
    });
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}
