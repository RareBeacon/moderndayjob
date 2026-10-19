import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { templateColumns, templatePhotoSupport, type ResumeTemplate } from '@/lib/resume-studio/templates';
import type { ExportSection, ParsedDocument } from './export';

/** Template-aware print renderers. Content comes from the saved CV, never from preview fixtures. */
const PAGE_W = 612;
const PAGE_H = 792;
const railHeading = /^(skills|education|certifications)$/i;

function accentParts(template: ResumeTemplate): [number, number, number] {
  const hex = /^#[0-9a-f]{6}$/i.test(template.accent) ? template.accent : '#111827';
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
}

function headerParts(title: string, sections: ExportSection[]) {
  const unheaded = sections.filter((section) => !section.heading).flatMap((section) => section.lines);
  return {
    name: unheaded[0] || title,
    contact: unheaded[1] || '',
    headline: unheaded[2] || '',
    body: sections.filter((section) => Boolean(section.heading)),
  };
}

function splitSections(sections: ExportSection[], template: ResumeTemplate) {
  const twoColumns = templateColumns(template) === 2 || template.layout === 'modular-grid';
  return {
    twoColumns,
    main: twoColumns ? sections.filter((section) => !railHeading.test(section.heading ?? '')) : sections,
    rail: twoColumns ? sections.filter((section) => railHeading.test(section.heading ?? '')) : [],
  };
}

function wrapMeasured(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = '';
    // Long URLs and names must wrap instead of painting off the page.
    for (const character of word) {
      if (current && font.widthOfTextAtSize(current + character, size) > maxWidth) {
        lines.push(current);
        current = '';
      }
      current += character;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export async function renderTemplatePdf(title: string, sections: ExportSection[], photo: ParsedDocument['photo'], template: ResumeTemplate): Promise<Buffer> {
  if (templatePhotoSupport(template) === 'none') photo = undefined;
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const heading = await doc.embedFont(template.heading === 'serif' ? StandardFonts.TimesRomanBold : template.heading === 'mono-accent' ? StandardFonts.CourierBold : StandardFonts.HelveticaBold);
  const accent = rgb(...accentParts(template));
  const ink = rgb(.09, .14, .23);
  const muted = rgb(.35, .42, .51);
  const margin = template.density === 'airy' ? 58 : template.density === 'compact' ? 42 : 50;
  const gap = 19;
  const { name, contact, headline, body } = headerParts(title, sections);
  const { twoColumns, main, rail } = splitSections(body, template);
  const sidebar = template.layout === 'sidebar';
  const first = doc.addPage([PAGE_W, PAGE_H]);
  let cursor = PAGE_H - margin - 20;
  const headerTextWidth = PAGE_W - 2 * margin - (photo ? 102 : 0);

  if (template.layout === 'header-band') {
    first.drawRectangle({ x: margin - 12, y: PAGE_H - margin - 123, width: PAGE_W - 2 * margin + 24, height: 142, color: accent, opacity: .09 });
    first.drawRectangle({ x: margin - 12, y: PAGE_H - margin + 12, width: PAGE_W - 2 * margin + 24, height: 6, color: accent });
  }
  const nameLines = wrapMeasured(name, heading, 22, headerTextWidth);
  for (const line of nameLines) {
    first.drawText(line, { x: margin, y: cursor, size: 22, font: heading, color: ink });
    cursor -= 25;
  }
  if (headline) {
    for (const line of wrapMeasured(headline, bold, 11, headerTextWidth)) {
      first.drawText(line, { x: margin, y: cursor, size: 11, font: bold, color: accent });
      cursor -= 15;
    }
  }
  for (const line of wrapMeasured(contact, regular, 9, headerTextWidth)) {
    if (!line.trim()) continue;
    first.drawText(line, { x: margin, y: cursor, size: 9, font: regular, color: muted });
    cursor -= 13;
  }
  let photoBottom = PAGE_H - margin;
  if (photo) {
    const image = photo.mime === 'image/png' ? await doc.embedPng(photo.bytes) : await doc.embedJpg(photo.bytes);
    const scale = Math.min(84 / image.width, 102 / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    photoBottom = PAGE_H - margin - h - 8;
    first.drawImage(image, { x: PAGE_W - margin - w, y: PAGE_H - margin - h, width: w, height: h });
  }
  const startY = Math.min(cursor - 9, photo ? photoBottom : cursor - 9);
  first.drawLine({ start: { x: margin, y: startY + 5 }, end: { x: PAGE_W - margin, y: startY + 5 }, thickness: template.personality === 'bold' ? 2.5 : 1.2, color: accent });

  const railWidth = twoColumns ? (PAGE_W - 2 * margin - gap) * .32 : 0;
  const mainWidth = PAGE_W - 2 * margin - (twoColumns ? railWidth + gap : 0);
  const mainX = sidebar ? margin + railWidth + gap : margin;
  const railX = sidebar ? margin : margin + mainWidth + gap;
  if (twoColumns && rail.length) {
    first.drawLine({ start: { x: sidebar ? mainX - gap / 2 : railX - gap / 2, y: startY - 9 }, end: { x: sidebar ? mainX - gap / 2 : railX - gap / 2, y: margin }, thickness: .6, color: rgb(.84, .88, .93) });
  }

  const pages = [first];
  function drawColumn(columnSections: ExportSection[], x: number, width: number, initialY: number) {
    let pageIndex = 0;
    let page = first;
    let y = initialY - 17;
    const ensure = (needed: number) => {
      if (y - needed < margin) {
        pageIndex += 1;
        page = pages[pageIndex] ?? (pages[pageIndex] = doc.addPage([PAGE_W, PAGE_H]));
        y = PAGE_H - margin;
      }
    };
    for (const section of columnSections) {
      if (!section.heading) continue;
      ensure(31);
      const label = section.heading.toUpperCase();
      for (const part of wrapMeasured(label, heading, 10, width)) {
        page.drawText(part, { x, y, size: 10, font: heading, color: accent });
        y -= 14;
      }
      page.drawLine({ start: { x, y: y + 3 }, end: { x: x + width, y: y + 3 }, thickness: .55, color: accent, opacity: .4 });
      y -= template.density === 'compact' ? 5 : 9;
      section.lines.forEach((line, index) => {
        const bullet = section.bullets?.[index] === true;
        const titleLine = !bullet && /^(Experience|Projects)$/i.test(section.heading ?? '');
        const font = titleLine ? bold : regular;
        const size = titleLine ? 10 : template.density === 'compact' ? 9 : 9.6;
        const indent = bullet ? 10 : 0;
        for (const part of wrapMeasured(line, font, size, width - indent)) {
          ensure(size + 5);
          page.drawText(part, { x: x + indent, y, size, font, color: titleLine ? ink : muted });
          y -= size + (template.density === 'airy' ? 6 : 4);
        }
        if (bullet) {
          page.drawCircle({ x: x + 3.5, y: y + size + 1, size: 1.5, color: accent });
        }
      });
      y -= template.density === 'airy' ? 14 : 9;
    }
  }

  // Main content and rail must paginate onto the same physical pages.
  drawColumn(main, mainX, mainWidth, startY);
  if (twoColumns) drawColumn(rail, railX, railWidth, startY);
  return Buffer.from(await doc.save());
}

function docxSection(section: ExportSection, template: ResumeTemplate): Paragraph[] {
  const children: Paragraph[] = [];
  const color = template.accent.slice(1).toUpperCase();
  const font = template.heading === 'serif' ? 'Georgia' : template.heading === 'mono-accent' ? 'Courier New' : 'Arial';
  if (section.heading) children.push(new Paragraph({
    spacing: { before: template.density === 'airy' ? 220 : 150, after: 90 },
    children: [new TextRun({ text: section.heading.toUpperCase(), bold: true, color, font, size: 21 })],
  }));
  section.lines.forEach((line, index) => children.push(new Paragraph({
    bullet: section.bullets?.[index] ? { level: 0 } : undefined,
    spacing: { after: template.density === 'compact' ? 48 : 92 },
    children: [new TextRun({ text: line, size: template.density === 'compact' ? 19 : 21, font: 'Arial' })],
  })));
  return children;
}

export async function renderTemplateDocx(title: string, sections: ExportSection[], photo: ParsedDocument['photo'], template: ResumeTemplate): Promise<Buffer> {
  if (templatePhotoSupport(template) === 'none') photo = undefined;
  const { name, contact, headline, body } = headerParts(title, sections);
  const { twoColumns, main, rail } = splitSections(body, template);
  const accent = template.accent.slice(1).toUpperCase();
  const font = template.heading === 'serif' ? 'Georgia' : template.heading === 'mono-accent' ? 'Courier New' : 'Arial';
  const children: Array<Paragraph | Table> = [
    new Paragraph({ spacing: { after: 90 }, children: [new TextRun({ text: name, bold: true, size: 42, font, color: accent })] }),
  ];
  if (headline) children.push(new Paragraph({ spacing: { after: 90 }, children: [new TextRun({ text: headline, bold: true, size: 23, font, color: accent })] }));
  if (contact) children.push(new Paragraph({ spacing: { after: 180 }, children: [new TextRun({ text: contact, size: 18, font: 'Arial' })] }));
  if (photo) children.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new ImageRun({ data: Buffer.from(photo.bytes), type: photo.mime === 'image/png' ? 'png' : 'jpg', transformation: { width: 92, height: 112 } })],
  }));
  if (!twoColumns || !rail.length) {
    for (const section of body) children.push(...docxSection(section, template));
  } else {
    const sidebar = template.layout === 'sidebar';
    const mainCell = new TableCell({ children: main.flatMap((section) => docxSection(section, template)) });
    const railCell = new TableCell({ children: rail.flatMap((section) => docxSection(section, template)), shading: { fill: sidebar ? 'F1F5F9' : 'FFFFFF' } });
    const none = { style: BorderStyle.NONE, size: 0 };
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
      rows: [new TableRow({ children: sidebar ? [railCell, mainCell] : [mainCell, railCell] })],
    }));
  }
  return Packer.toBuffer(new Document({ sections: [{ properties: {}, children }] }));
}
