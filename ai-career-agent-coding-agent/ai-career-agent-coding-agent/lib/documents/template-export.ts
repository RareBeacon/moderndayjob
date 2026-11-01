import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import {
  normalizeResumeFromStoredJson,
  toPdfSafeText,
  type NormalizedResumeDocument,
} from '@/lib/resume-studio/document-model';
import { parsePhotoDataUrl, type PhotoMime } from '@/lib/resume-studio/photo';
import {
  resolveTemplateSpec,
  type CuratedTemplateSpec,
  type ResumeTemplate,
} from '@/lib/resume-studio/templates';
import type { ResumeSectionKey } from '@/lib/resume-studio/catalog30';

export interface ExportSection {
  heading?: string;
  lines: string[];
}

export interface ValidatedPhoto {
  bytes: Uint8Array;
  mime: PhotoMime;
}

export type PhotoInput = ValidatedPhoto | string | null | undefined;

export function resolveValidatedPhoto(input: PhotoInput, fallbackDataUrl?: string): ValidatedPhoto | null {
  if (input && typeof input === 'object' && 'bytes' in input && 'mime' in input) {
    return input;
  }
  if (typeof input === 'string' && input.length > 0) {
    const check = parsePhotoDataUrl(input);
    return check.ok ? { bytes: check.bytes, mime: check.mime } : null;
  }
  if (fallbackDataUrl) {
    const check = parsePhotoDataUrl(fallbackDataUrl);
    return check.ok ? { bytes: check.bytes, mime: check.mime } : null;
  }
  return null;
}

/** True ISO A4 dimensions in PostScript points (210mm x 297mm). */
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

type RgbTuple = [number, number, number];

function hexToRgbTuple(hex: string, fallback: RgbTuple = [0.08, 0.11, 0.18]): RgbTuple {
  const cleaned = (hex || '').replace('#', '').trim();
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
  const num = parseInt(full, 16);
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function rgbColor(hex: string) {
  const [r, g, b] = hexToRgbTuple(hex);
  return rgb(r, g, b);
}

function cleanHex6(hex: string, fallback = '111D35'): string {
  const cleaned = (hex || '').replace('#', '').trim().toUpperCase();
  if (/^[0-9A-F]{6}$/.test(cleaned)) return cleaned;
  if (/^[0-9A-F]{3}$/.test(cleaned)) {
    return cleaned
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return fallback;
}

/**
 * Reconstruct a NormalizedResumeDocument when callers invoke renderPdf/renderDocx
 * with legacy (title, sections, photo) arguments instead of a full NormalizedResumeDocument.
 */
export function reconstructResumeFromSections(
  title: string,
  sections: ExportSection[],
  photo?: string | null,
): NormalizedResumeDocument {
  let fullName = '';
  let headline = toPdfSafeText(title);
  const contact: Record<string, string> = {};
  let summary = '';
  const experiences: Array<{
    company?: string;
    title?: string;
    start?: string;
    end?: string;
    bullets?: string[];
  }> = [];
  const skills: string[] = [];
  const education: Array<{ institution?: string; qualification?: string; achievements?: string }> = [];
  const projects: Array<{ name?: string; description?: string; url?: string }> = [];
  const certifications: Array<{ name?: string; issuer?: string; date?: string }> = [];
  const achievements: string[] = [];
  let references = '';
  let additional = '';

  for (const sec of sections) {
    const h = (sec.heading || '').trim().toLowerCase();
    const lines = sec.lines.map((l) => toPdfSafeText(l)).filter(Boolean);
    if (!lines.length) continue;

    if (!h) {
      // Contact/header block from parseDocumentContent
      const firstParts = lines[0].split('|').map((s) => s.trim()).filter(Boolean);
      for (const part of firstParts) {
        if (part.includes('@')) contact.email = part;
        else if (/^\+?[0-9][0-9\s()-]{6,}$/.test(part)) contact.phone = part;
        else if (!fullName && part !== headline) fullName = part;
        else if (!contact.location) contact.location = part;
      }
      if (lines[1]) {
        for (const link of lines[1].split('|').map((s) => s.trim()).filter(Boolean)) {
          if (/linkedin/i.test(link)) contact.linkedin = link;
          else if (/github/i.test(link)) contact.github = link;
          else contact.website = link;
        }
      }
      continue;
    }

    if (h.includes('summary') || h.includes('profile')) {
      summary = lines.join(' ');
    } else if (h.includes('experience')) {
      let currentExp: { company?: string; title?: string; start?: string; end?: string; bullets: string[] } | null = null;
      for (const line of lines) {
        if (line.startsWith('- ')) {
          if (!currentExp) currentExp = { title: 'Role', bullets: [] };
          currentExp.bullets.push(line.slice(2).trim());
        } else {
          if (currentExp) experiences.push(currentExp);
          const dateMatch = line.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
          const mainPart = dateMatch ? dateMatch[1].trim() : line;
          const datePart = dateMatch ? dateMatch[2].trim() : '';
          const [start = '', end = ''] = datePart.split(/\s*-\s*/);
          const [rolePart = mainPart, companyPart = ''] = mainPart.split(/\s+-\s+/);
          currentExp = {
            title: rolePart.trim(),
            company: companyPart.trim(),
            start: start.trim(),
            end: end.trim(),
            bullets: [],
          };
        }
      }
      if (currentExp) experiences.push(currentExp);
    } else if (h.includes('skill')) {
      for (const line of lines) {
        for (const token of line.split(/[,|]/)) {
          const s = token.trim();
          if (s) skills.push(s);
        }
      }
    } else if (h.includes('education')) {
      for (const line of lines) {
        if (line.startsWith('- ') && education.length) {
          education[education.length - 1].achievements = line.slice(2).trim();
        } else {
          const [qual = line, inst = ''] = line.split(/\s+-\s+/);
          education.push({ qualification: qual.trim(), institution: inst.trim() });
        }
      }
    } else if (h.includes('project')) {
      let currentProj: { name: string; description: string; url?: string } | null = null;
      for (const line of lines) {
        if (line.startsWith('- ') && currentProj) {
          currentProj.description = [currentProj.description, line.slice(2).trim()].filter(Boolean).join(' ');
        } else if (!currentProj) {
          const [name = line, url = ''] = line.split(/\s+-\s+/);
          currentProj = { name: name.trim(), description: '', url: url.trim() };
        } else {
          if (!currentProj.description) {
            currentProj.description = line;
          } else {
            projects.push(currentProj);
            const [name = line, url = ''] = line.split(/\s+-\s+/);
            currentProj = { name: name.trim(), description: '', url: url.trim() };
          }
        }
      }
      if (currentProj) projects.push(currentProj);
    } else if (h.includes('certification')) {
      for (const line of lines) {
        const parts = line.split(/\s+-\s+/);
        certifications.push({
          name: parts[0]?.trim() || line,
          issuer: parts[1]?.trim() || '',
          date: parts[2]?.trim() || '',
        });
      }
    } else if (h.includes('highlight') || h.includes('achievement') || h.includes('award')) {
      for (const line of lines) achievements.push(line.replace(/^-\s*/, '').trim());
    } else if (h.includes('reference')) {
      references = lines.join(' ');
    } else {
      additional = [additional, ...lines].filter(Boolean).join(' ');
    }
  }

  if (!fullName) {
    fullName = headline || 'Curriculum Vitae';
    headline = '';
  }

  return normalizeResumeFromStoredJson({
    contact: {
      name: fullName,
      email: contact.email,
      phone: contact.phone,
      location: contact.location,
      website: contact.website,
      linkedin: contact.linkedin,
      github: contact.github,
    },
    headline,
    summary,
    experiences,
    skills,
    education,
    projects,
    certifications,
    achievements,
    references,
    additional,
    photoDataUrl: photo ?? '',
  });
}

interface PdfFontSuite {
  headRegular: PDFFont;
  headBold: PDFFont;
  headItalic: PDFFont;
  bodyRegular: PDFFont;
  bodyBold: PDFFont;
  bodyItalic: PDFFont;
  monoRegular: PDFFont;
  monoBold: PDFFont;
}

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = toPdfSafeText(text);
  if (!safe) return [];
  const words = safe.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const pushLongToken = (token: string) => {
    let chunk = '';
    for (const ch of token) {
      const candidate = chunk + ch;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && chunk.length > 0) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = candidate;
      }
    }
    if (chunk) current = chunk;
  };

  for (const word of words) {
    if (!current) {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
      } else {
        pushLongToken(word);
      }
      continue;
    }
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = '';
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
      } else {
        pushLongToken(word);
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function extractVerbatimHighlights(doc: NormalizedResumeDocument): string[] {
  const out: string[] = [];
  for (const exp of doc.experiences) {
    for (const bullet of exp.bullets) {
      if (/\d+%|\d+\+|\d+\.\d+%|\b\d+\s*(hours|days|users|requests|engineers|accounts|ms)\b/i.test(bullet)) {
        const concise = bullet.length > 88 ? `${bullet.slice(0, 85).replace(/\s+\S*$/, '')}...` : bullet;
        out.push(concise);
        if (out.length >= 3) return out;
      }
    }
  }
  return out;
}

function hasSectionContent(doc: NormalizedResumeDocument, key: ResumeSectionKey): boolean {
  switch (key) {
    case 'summary':
      return Boolean(doc.summary);
    case 'skills':
      return doc.skills.length > 0;
    case 'experience':
      return doc.experiences.length > 0;
    case 'projects':
      return doc.projects.length > 0;
    case 'education':
      return doc.education.length > 0;
    case 'certifications':
      return doc.certifications.length > 0;
    case 'publications':
      return doc.publications.length > 0;
    case 'awards':
      return doc.awards.length > 0;
    case 'languages':
      return doc.languages.length > 0;
    case 'volunteer':
      return doc.volunteer.length > 0;
    case 'memberships':
      return doc.memberships.length > 0;
    case 'additional':
      return Boolean(doc.additional);
    case 'references':
      return Boolean(doc.references);
    default:
      return false;
  }
}

const DEFAULT_SECTION_TITLES: Record<ResumeSectionKey, string> = {
  summary: 'Professional Summary',
  skills: 'Skills',
  experience: 'Work Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  publications: 'Publications',
  awards: 'Honours & Awards',
  languages: 'Languages',
  volunteer: 'Volunteer Experience',
  memberships: 'Professional Memberships',
  additional: 'Additional Information',
  references: 'References',
};

function getSectionTitle(spec: CuratedTemplateSpec, key: ResumeSectionKey): string {
  return spec.blueprint.sectionTitles[key] || DEFAULT_SECTION_TITLES[key];
}

interface ColumnRegion {
  x: number;
  width: number;
  isDarkSurface: boolean;
  inkHex: string;
  mutedHex: string;
  accentHex: string;
  ruleHex: string;
  cardHex: string;
}

/**
 * Render an authentic ISO A4 (595.28 x 841.89 pt) resume PDF for any of the
 * 30 curated templates (or legacy mapped templates).
 */
export async function renderTemplatePdf(
  title: string,
  sections: ExportSection[],
  templateInput: ResumeTemplate | string,
  photo?: PhotoInput,
  providedResume?: NormalizedResumeDocument | null,
): Promise<Buffer> {
  const spec = resolveTemplateSpec(templateInput);
  const bp = spec.blueprint;
  const pal = bp.palette;

  const docData = providedResume
    ? {
        ...providedResume,
        photoDataUrl: typeof photo === 'string' ? photo : providedResume.photoDataUrl ?? '',
      }
    : reconstructResumeFromSections(title, sections, typeof photo === 'string' ? photo : null);

  const pdf = await PDFDocument.create();
  pdf.setTitle(toPdfSafeText(`${docData.fullName || 'Candidate'} - ${spec.name}`));
  pdf.setSubject(toPdfSafeText(docData.professionalTitle || spec.intendedUse));
  pdf.setCreator('Jobiest Resume Studio');
  pdf.setProducer('Jobiest A4 Template Engine');

  const serifReg = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sansReg = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sansItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const monoReg = await pdf.embedFont(StandardFonts.Courier);
  const monoBold = await pdf.embedFont(StandardFonts.CourierBold);

  const fonts: PdfFontSuite = {
    headRegular: bp.headingFont === 'serif' ? serifReg : bp.headingFont === 'mono' ? monoReg : sansReg,
    headBold: bp.headingFont === 'serif' ? serifBold : bp.headingFont === 'mono' ? monoBold : sansBold,
    headItalic: bp.headingFont === 'serif' ? serifItalic : sansItalic,
    bodyRegular: bp.bodyFont === 'serif' ? serifReg : sansReg,
    bodyBold: bp.bodyFont === 'serif' ? serifBold : sansBold,
    bodyItalic: bp.bodyFont === 'serif' ? serifItalic : sansItalic,
    monoRegular: monoReg,
    monoBold: monoBold,
  };

  let embeddedPhoto: PDFImage | null = null;
  if (spec.photoSupport !== 'none') {
    const validPhoto = resolveValidatedPhoto(photo, docData.photoDataUrl);
    if (validPhoto) {
      embeddedPhoto =
        validPhoto.mime === 'image/png'
          ? await pdf.embedPng(validPhoto.bytes)
          : await pdf.embedJpg(validPhoto.bytes);
    }
  }

  const margin = bp.pageMarginPt;
  const bottomLimit = 40;
  const pages: PDFPage[] = [];

  // Geometry calculation for 1-column vs 2-column layouts
  const contentWidth = A4_WIDTH_PT - margin * 2;
  const colGap = 18;
  const railRatio = bp.railRatio ?? 0.33;

  const paintPageChrome = (page: PDFPage, pageIdx: number) => {
    // Base white paper
    page.drawRectangle({
      x: 0,
      y: 0,
      width: A4_WIDTH_PT,
      height: A4_HEIGHT_PT,
      color: rgbColor(pal.paper),
    });

    if (bp.bodyStructure === 'full-bleed-dark-sidebar') {
      const sideW = Math.round(A4_WIDTH_PT * (bp.railRatio ?? 0.33));
      page.drawRectangle({
        x: 0,
        y: 0,
        width: sideW,
        height: A4_HEIGHT_PT,
        color: rgbColor(pal.railBg),
      });
      page.drawRectangle({
        x: sideW,
        y: 0,
        width: 2.2,
        height: A4_HEIGHT_PT,
        color: rgbColor(pal.accent),
      });
    } else if (pageIdx > 0 && spec.columns === 2) {
      // Continuation sidebar background on page 2+
      if (bp.bodyStructure === 'two-col-left-rail') {
        const railW = Math.round(contentWidth * railRatio);
        page.drawRectangle({
          x: margin - 8,
          y: bottomLimit - 6,
          width: railW + 12,
          height: A4_HEIGHT_PT - margin - bottomLimit + 12,
          color: rgbColor(pal.railBg),
        });
      } else if (bp.bodyStructure === 'two-col-right-rail' || bp.bodyStructure === 'two-col-editorial-tint') {
        const railW = Math.round(contentWidth * railRatio);
        const railX = margin + contentWidth - railW;
        page.drawRectangle({
          x: railX - 8,
          y: bottomLimit - 6,
          width: railW + 14,
          height: A4_HEIGHT_PT - margin - bottomLimit + 12,
          color: rgbColor(pal.railBg),
        });
      }
    }

    if (pageIdx > 0 && bp.bodyStructure !== 'full-bleed-dark-sidebar') {
      const contLabel = toPdfSafeText(`${docData.fullName || 'Resume'}  |  ${docData.professionalTitle || spec.name}`);
      page.drawText(contLabel, {
        x: margin,
        y: A4_HEIGHT_PT - 24,
        size: 7.5,
        font: sansReg,
        color: rgbColor(pal.muted),
      });
      page.drawLine({
        start: { x: margin, y: A4_HEIGHT_PT - 29 },
        end: { x: A4_WIDTH_PT - margin, y: A4_HEIGHT_PT - 29 },
        thickness: 0.4,
        color: rgbColor(pal.rule),
      });
    }
  };

  const getOrCreatePage = (pageIdx: number): PDFPage => {
    while (pages.length <= pageIdx) {
      const newPage = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
      paintPageChrome(newPage, pages.length);
      pages.push(newPage);
    }
    return pages[pageIdx];
  };

  const page0 = getOrCreatePage(0);

  // =========================================================================
  // MASTHEAD RENDERING (Page 1)
  // =========================================================================
  let bodyStartY = A4_HEIGHT_PT - margin;
  const contactJoined = docData.contactItems.map((c) => c.value).join('  |  ');
  const contactRow1 = docData.contactItems.slice(0, 3).map((c) => c.value).join('  |  ');
  const contactRow2 = docData.contactItems.slice(3).map((c) => c.value).join('  |  ');

  if (bp.bodyStructure === 'full-bleed-dark-sidebar') {
    // Template 20: Dark full-height left rail + white right main canvas nameplate
    const sideW = Math.round(A4_WIDTH_PT * (bp.railRatio ?? 0.33));
    const mainX = sideW + 24;
    const mainW = A4_WIDTH_PT - mainX - 30;
    let mainTopY = A4_HEIGHT_PT - 42;

    const nameLines = wrapLine(docData.fullName || 'Candidate Name', fonts.headBold, bp.nameSizePt + 2, mainW);
    for (const line of nameLines) {
      page0.drawText(line, {
        x: mainX,
        y: mainTopY,
        size: bp.nameSizePt + 2,
        font: fonts.headBold,
        color: rgbColor(pal.ink),
      });
      mainTopY -= bp.nameSizePt + 6;
    }
    if (docData.professionalTitle) {
      const titleLines = wrapLine(docData.professionalTitle, fonts.bodyBold, 11, mainW);
      for (const line of titleLines) {
        page0.drawText(line, {
          x: mainX,
          y: mainTopY + 2,
          size: 11,
          font: fonts.bodyBold,
          color: rgbColor(pal.accent),
        });
        mainTopY -= 14;
      }
    }
    page0.drawRectangle({
      x: mainX,
      y: mainTopY - 2,
      width: 54,
      height: 3,
      color: rgbColor(pal.accent),
    });
    page0.drawLine({
      start: { x: mainX + 58, y: mainTopY - 0.5 },
      end: { x: mainX + mainW, y: mainTopY - 0.5 },
      thickness: 0.6,
      color: rgbColor('#CBD5E1'),
    });
    bodyStartY = mainTopY - 16;
  } else if (
    bp.masthead === 'executive-banner' ||
    bp.masthead === 'security-dossier' ||
    bp.masthead === 'commercial-amber-band' ||
    bp.masthead === 'architectural-split'
  ) {
    // Full-bleed dark/rich header bands (05, 10, 13, 30)
    const bannerH = bp.masthead === 'architectural-split' ? 112 : 106;
    const bannerBottom = A4_HEIGHT_PT - bannerH;
    page0.drawRectangle({
      x: 0,
      y: bannerBottom,
      width: A4_WIDTH_PT,
      height: bannerH,
      color: rgbColor(pal.headerBg),
    });

    if (bp.masthead === 'architectural-split') {
      const railW = Math.round(contentWidth * railRatio);
      const splitX = margin + contentWidth - railW - 8;
      page0.drawRectangle({
        x: splitX,
        y: bannerBottom,
        width: A4_WIDTH_PT - splitX,
        height: bannerH,
        color: rgbColor('#1B2B4B'),
      });
      page0.drawRectangle({
        x: margin,
        y: bannerBottom + 14,
        width: 38,
        height: 3,
        color: rgbColor('#38BDF8'),
      });
      let hy = A4_HEIGHT_PT - 38;
      for (const nl of wrapLine(docData.fullName || 'Candidate Name', fonts.headBold, bp.nameSizePt, splitX - margin - 18)) {
        page0.drawText(nl, { x: margin, y: hy, size: bp.nameSizePt, font: fonts.headBold, color: rgbColor(pal.headerInk) });
        hy -= bp.nameSizePt + 4;
      }
      if (docData.professionalTitle) {
        for (const tl of wrapLine(docData.professionalTitle, fonts.bodyRegular, 10.2, splitX - margin - 18)) {
          page0.drawText(tl, { x: margin, y: hy, size: 10.2, font: fonts.bodyRegular, color: rgbColor('#BAE6FD') });
          hy -= 13;
        }
      }
      // Contact items in right split header block
      let cy = A4_HEIGHT_PT - 28;
      const rightX = splitX + 14;
      const rightW = A4_WIDTH_PT - rightX - margin + 6;
      if (embeddedPhoto) {
        page0.drawImage(embeddedPhoto, { x: A4_WIDTH_PT - margin - 38, y: A4_HEIGHT_PT - 64, width: 38, height: 38 });
      }
      for (const item of docData.contactItems.slice(0, 6)) {
        for (const cl of wrapLine(item.value, sansReg, 7.9, embeddedPhoto ? rightW - 44 : rightW)) {
          if (cy >= bannerBottom + 10) {
            page0.drawText(cl, { x: rightX, y: cy, size: 7.9, font: sansReg, color: rgbColor('#E2E8F0') });
            cy -= 11;
          }
        }
      }
    } else {
      // Accent strip along bottom of banner
      const stripColor =
        bp.masthead === 'executive-banner'
          ? '#D7F94B'
          : bp.masthead === 'commercial-amber-band'
            ? '#F59E0B'
            : '#10B981';
      page0.drawRectangle({
        x: 0,
        y: bannerBottom,
        width: A4_WIDTH_PT,
        height: 3.2,
        color: rgbColor(stripColor),
      });

      let hy = bp.masthead === 'security-dossier' ? A4_HEIGHT_PT - 42 : A4_HEIGHT_PT - 34;
      if (bp.masthead === 'security-dossier') {
        page0.drawText('TECHNICAL & SECURITY DOSSIER', {
          x: margin,
          y: A4_HEIGHT_PT - 21,
          size: 7.2,
          font: monoBold,
          color: rgbColor('#34D399'),
        });
      }
      for (const nl of wrapLine(docData.fullName || 'Candidate Name', fonts.headBold, bp.nameSizePt, contentWidth)) {
        page0.drawText(nl, { x: margin, y: hy, size: bp.nameSizePt, font: fonts.headBold, color: rgbColor(pal.headerInk) });
        hy -= bp.nameSizePt + 4;
      }
      if (docData.professionalTitle) {
        page0.drawText(toPdfSafeText(docData.professionalTitle).slice(0, 95), {
          x: margin,
          y: hy,
          size: 10.5,
          font: fonts.bodyBold,
          color: rgbColor(pal.headerMuted),
        });
        hy -= 15;
      }
      if (contactRow1) {
        page0.drawText(contactRow1, { x: margin, y: hy, size: 8.2, font: sansReg, color: rgbColor('#E2E8F0') });
        hy -= 11;
      }
      if (contactRow2) {
        page0.drawText(contactRow2, { x: margin, y: hy, size: 8.0, font: sansReg, color: rgbColor('#CBD5E1') });
      }
    }
    bodyStartY = bannerBottom - 16;
  } else if (
    bp.masthead === 'research-tint-split' ||
    bp.masthead === 'editorial-magazine' ||
    bp.masthead === 'operations-monogram' ||
    bp.masthead === 'studio-portrait' ||
    bp.masthead === 'ux-system-bar' ||
    bp.masthead === 'educator-sage' ||
    bp.masthead === 'graduate-launchpad' ||
    bp.masthead === 'pivot-target-role' ||
    bp.masthead === 'engagement-brief' ||
    bp.masthead === 'diplomatic-mobility'
  ) {
    // Tinted / Structured Band Mastheads (07, 14, 15, 16, 18, 23, 25, 26, 28, 29)
    const bandH = bp.masthead === 'pivot-target-role' || bp.masthead === 'engagement-brief' ? 106 : 98;
    const bandBottom = A4_HEIGHT_PT - bandH - 12;
    page0.drawRectangle({
      x: margin - 10,
      y: bandBottom,
      width: contentWidth + 20,
      height: bandH,
      color: rgbColor(pal.headerBg),
    });
    page0.drawLine({
      start: { x: margin - 10, y: bandBottom },
      end: { x: margin + contentWidth + 10, y: bandBottom },
      thickness: 1.6,
      color: rgbColor(pal.accent),
    });

    if (bp.masthead === 'educator-sage' || bp.masthead === 'engagement-brief') {
      page0.drawRectangle({
        x: margin - 10,
        y: bandBottom,
        width: 4.5,
        height: bandH,
        color: rgbColor(pal.accent),
      });
    }

    let textX = margin + 4;
    let availW = contentWidth - 8;

    if (bp.masthead === 'operations-monogram') {
      // Geometric monogram square on left
      page0.drawRectangle({
        x: margin + 2,
        y: bandBottom + 24,
        width: 44,
        height: 44,
        color: rgbColor(pal.accent),
      });
      const initW = sansBold.widthOfTextAtSize(docData.initials, 15);
      page0.drawText(docData.initials, {
        x: margin + 2 + (44 - initW) / 2,
        y: bandBottom + 40,
        size: 15,
        font: sansBold,
        color: rgbColor('#FFFFFF'),
      });
      textX = margin + 56;
      availW = contentWidth - 62;
    } else if ((bp.masthead === 'studio-portrait' || bp.masthead === 'ux-system-bar' || bp.masthead === 'diplomatic-mobility') && embeddedPhoto) {
      page0.drawImage(embeddedPhoto, {
        x: margin + contentWidth - 52,
        y: bandBottom + 20,
        width: 50,
        height: 50,
      });
      availW -= 62;
    } else if (bp.masthead === 'studio-portrait') {
      // Terracotta studio monogram badge when photo omitted
      page0.drawRectangle({
        x: margin + 2,
        y: bandBottom + 26,
        width: 40,
        height: 40,
        color: rgbColor(pal.accent),
      });
      const initW = serifBold.widthOfTextAtSize(docData.initials, 14);
      page0.drawText(docData.initials, {
        x: margin + 2 + (40 - initW) / 2,
        y: bandBottom + 41,
        size: 14,
        font: serifBold,
        color: rgbColor('#FFFFFF'),
      });
      textX = margin + 52;
      availW = contentWidth - 58;
    }

    let hy =
      bp.masthead === 'pivot-target-role' || bp.masthead === 'engagement-brief'
        ? A4_HEIGHT_PT - 49
        : A4_HEIGHT_PT - 34;
    if (bp.masthead === 'pivot-target-role' || bp.masthead === 'engagement-brief') {
      const eyebrow =
        bp.masthead === 'pivot-target-role'
          ? `TARGET ALIGNMENT: ${(docData.professionalTitle || 'CAREER TRANSITION').toUpperCase()}`
          : 'PROJECT & ADVISORY DELIVERY BRIEF';
      page0.drawText(eyebrow.slice(0, 82), {
        x: textX,
        y: A4_HEIGHT_PT - 22,
        size: 7.3,
        font: sansBold,
        color: rgbColor(pal.accent),
      });
    }

    for (const nl of wrapLine(docData.fullName || 'Candidate Name', fonts.headBold, bp.nameSizePt, availW)) {
      page0.drawText(nl, { x: textX, y: hy, size: bp.nameSizePt, font: fonts.headBold, color: rgbColor(pal.headerInk) });
      hy -= bp.nameSizePt + 3.5;
    }
    if (docData.professionalTitle) {
      page0.drawText(toPdfSafeText(docData.professionalTitle).slice(0, 92), {
        x: textX,
        y: hy,
        size: 10.2,
        font: fonts.bodyBold,
        color: rgbColor(pal.headerMuted),
      });
      hy -= 13.5;
    }
    if (contactRow1) {
      page0.drawText(contactRow1, { x: textX, y: hy, size: 8.1, font: sansReg, color: rgbColor(pal.ink) });
      hy -= 10.5;
    }
    if (contactRow2) {
      page0.drawText(contactRow2, { x: textX, y: hy, size: 7.9, font: sansReg, color: rgbColor(pal.muted) });
    }
    bodyStartY = bandBottom - 15;
  } else if (
    bp.masthead === 'sovereign-centered' ||
    bp.masthead === 'institutional-framed' ||
    bp.masthead === 'literary-broadsheet' ||
    bp.masthead === 'scholar-clean'
  ) {
    // Centered Serif / Editorial Mastheads (01, 12, 19, 22)
    let hy = A4_HEIGHT_PT - margin;
    if (bp.masthead === 'institutional-framed' || bp.masthead === 'literary-broadsheet') {
      page0.drawLine({
        start: { x: margin, y: hy + 8 },
        end: { x: margin + contentWidth, y: hy + 8 },
        thickness: bp.masthead === 'institutional-framed' ? 1.5 : 0.7,
        color: rgbColor(pal.rule),
      });
      hy -= 10;
    }

    const displayName =
      bp.masthead === 'sovereign-centered' || bp.masthead === 'institutional-framed'
        ? (docData.fullName || 'Candidate Name').toUpperCase()
        : docData.fullName || 'Candidate Name';

    for (const nl of wrapLine(displayName, fonts.headBold, bp.nameSizePt, contentWidth)) {
      const nw = fonts.headBold.widthOfTextAtSize(nl, bp.nameSizePt);
      page0.drawText(nl, {
        x: margin + (contentWidth - nw) / 2,
        y: hy,
        size: bp.nameSizePt,
        font: fonts.headBold,
        color: rgbColor(pal.headerInk),
      });
      hy -= bp.nameSizePt + 4;
    }

    if (docData.professionalTitle) {
      const titleFont = bp.masthead === 'literary-broadsheet' ? fonts.headItalic : fonts.bodyBold;
      for (const tl of wrapLine(docData.professionalTitle, titleFont, 10.4, contentWidth)) {
        const tw = titleFont.widthOfTextAtSize(tl, 10.4);
        page0.drawText(tl, {
          x: margin + (contentWidth - tw) / 2,
          y: hy,
          size: 10.4,
          font: titleFont,
          color: rgbColor(pal.accent),
        });
        hy -= 14;
      }
    }

    for (const cl of wrapLine(contactJoined, sansReg, 8.1, contentWidth)) {
      const cw = sansReg.widthOfTextAtSize(cl, 8.1);
      page0.drawText(cl, {
        x: margin + (contentWidth - cw) / 2,
        y: hy,
        size: 8.1,
        font: sansReg,
        color: rgbColor(pal.muted),
      });
      hy -= 11;
    }

    // Bottom rule(s)
    page0.drawLine({
      start: { x: margin, y: hy - 2 },
      end: { x: margin + contentWidth, y: hy - 2 },
      thickness: bp.masthead === 'scholar-clean' ? 1.2 : 1.5,
      color: rgbColor(pal.rule),
    });
    if (bp.masthead === 'sovereign-centered' || bp.masthead === 'literary-broadsheet') {
      page0.drawLine({
        start: { x: margin, y: hy - 5 },
        end: { x: margin + contentWidth, y: hy - 5 },
        thickness: 0.5,
        color: rgbColor(pal.rule),
      });
      hy -= 4;
    }
    bodyStartY = hy - 16;
  } else if (bp.masthead === 'swiss-oversized') {
    // Template 17: Bold Swiss Grid Header
    let hy = A4_HEIGHT_PT - margin;
    page0.drawRectangle({
      x: margin,
      y: hy + 6,
      width: contentWidth,
      height: 4.5,
      color: rgbColor('#09090B'),
    });
    hy -= 16;
    page0.drawRectangle({
      x: margin,
      y: hy - 2,
      width: 12,
      height: 12,
      color: rgbColor(pal.accent),
    });
    page0.drawText(toPdfSafeText(docData.professionalTitle || 'DESIGN & SYSTEMS').toUpperCase().slice(0, 70), {
      x: margin + 18,
      y: hy,
      size: 8.5,
      font: sansBold,
      color: rgbColor(pal.accent),
    });
    hy -= bp.nameSizePt + 7;
    for (const nl of wrapLine(docData.fullName || 'Candidate Name', sansBold, bp.nameSizePt, contentWidth - (embeddedPhoto ? 64 : 0))) {
      page0.drawText(nl, { x: margin, y: hy, size: bp.nameSizePt, font: sansBold, color: rgbColor('#09090B') });
      hy -= bp.nameSizePt + 3;
    }
    if (embeddedPhoto) {
      page0.drawImage(embeddedPhoto, { x: margin + contentWidth - 52, y: hy + 8, width: 50, height: 50 });
    }
    for (const cl of wrapLine(contactJoined, sansReg, 8.0, contentWidth)) {
      page0.drawText(cl, { x: margin, y: hy + 2, size: 8.0, font: sansReg, color: rgbColor(pal.muted) });
      hy -= 10.5;
    }
    page0.drawLine({
      start: { x: margin, y: hy - 3 },
      end: { x: margin + contentWidth, y: hy - 3 },
      thickness: 2,
      color: rgbColor('#09090B'),
    });
    bodyStartY = hy - 16;
  } else {
    // Left/Split/Spec/Analytical/Academic/Specialist Mastheads (02, 03, 04, 06, 08, 09, 11, 21, 24, 27)
    let hy = A4_HEIGHT_PT - margin;

    if (bp.masthead === 'analytical-top-bar') {
      page0.drawRectangle({
        x: 0,
        y: A4_HEIGHT_PT - 7,
        width: A4_WIDTH_PT,
        height: 7,
        color: rgbColor(pal.accent),
      });
    } else if (bp.masthead === 'journal-abstract') {
      page0.drawLine({ start: { x: margin, y: hy + 8 }, end: { x: margin + contentWidth, y: hy + 8 }, thickness: 1.8, color: rgbColor(pal.accent) });
      page0.drawLine({ start: { x: margin, y: hy + 5 }, end: { x: margin + contentWidth, y: hy + 5 }, thickness: 0.5, color: rgbColor(pal.accent) });
      hy -= 8;
    } else if (bp.masthead === 'developer-spec' || bp.masthead === 'product-card-split') {
      page0.drawRectangle({
        x: margin,
        y: hy - 68,
        width: contentWidth,
        height: 80,
        color: rgbColor(pal.headerBg),
        borderColor: rgbColor(pal.rule),
        borderWidth: 0.7,
      });
      page0.drawRectangle({
        x: margin,
        y: hy - 68,
        width: 3.8,
        height: 80,
        color: rgbColor(pal.accent),
      });
      hy -= 8;
    }

    const innerX = bp.masthead === 'developer-spec' || bp.masthead === 'product-card-split' ? margin + 12 : bp.masthead === 'spine-accent' ? margin + 11 : margin;
    const innerW = contentWidth - (innerX - margin) - (bp.masthead === 'developer-spec' || bp.masthead === 'product-card-split' ? 10 : 0);

    if (bp.masthead === 'spine-accent') {
      page0.drawRectangle({
        x: margin,
        y: hy - 52,
        width: 4,
        height: 64,
        color: rgbColor(pal.accent),
      });
    }

    if (bp.masthead === 'academic-cv') {
      const tag = 'CURRICULUM VITAE';
      const tw = serifBold.widthOfTextAtSize(tag, 8.2);
      page0.drawText(tag, { x: margin + contentWidth - tw, y: hy + 2, size: 8.2, font: serifBold, color: rgbColor(pal.accent) });
    } else if (bp.masthead === 'specialist-badge' && docData.experiences.length > 0) {
      const badge = 'SENIOR SPECIALIST PROFILE';
      const bw = sansBold.widthOfTextAtSize(badge, 7.5) + 12;
      page0.drawRectangle({ x: margin + contentWidth - bw, y: hy - 2, width: bw, height: 15, color: rgbColor(pal.accentSoft) });
      page0.drawText(badge, { x: margin + contentWidth - bw + 6, y: hy + 2, size: 7.5, font: sansBold, color: rgbColor(pal.accent) });
    }

    if (bp.masthead === 'corporate-split') {
      // Left name + title, right contact stack
      const leftW = innerW * 0.58;
      let ly = hy;
      for (const nl of wrapLine(docData.fullName || 'Candidate Name', fonts.headBold, bp.nameSizePt, leftW)) {
        page0.drawText(nl, { x: innerX, y: ly, size: bp.nameSizePt, font: fonts.headBold, color: rgbColor(pal.headerInk) });
        ly -= bp.nameSizePt + 4;
      }
      if (docData.professionalTitle) {
        for (const tl of wrapLine(docData.professionalTitle, fonts.headItalic, 10.2, leftW)) {
          page0.drawText(tl, { x: innerX, y: ly + 2, size: 10.2, font: fonts.headItalic, color: rgbColor(pal.muted) });
          ly -= 13;
        }
      }
      let ry = hy + 2;
      for (const item of docData.contactItems.slice(0, 5)) {
        const txt = item.value;
        const tw = sansReg.widthOfTextAtSize(txt, 8.2);
        page0.drawText(txt, { x: margin + contentWidth - tw, y: ry, size: 8.2, font: sansReg, color: rgbColor(pal.muted) });
        ry -= 11;
      }
      hy = Math.min(ly, ry) - 4;
    } else {
      if (embeddedPhoto) {
        page0.drawImage(embeddedPhoto, {
          x: margin + contentWidth - 46,
          y: hy - 36,
          width: 44,
          height: 44,
        });
      }
      for (const nl of wrapLine(docData.fullName || 'Candidate Name', fonts.headBold, bp.nameSizePt, innerW * (embeddedPhoto ? 0.75 : 0.85))) {
        page0.drawText(nl, { x: innerX, y: hy, size: bp.nameSizePt, font: fonts.headBold, color: rgbColor(pal.headerInk) });
        hy -= bp.nameSizePt + 3.5;
      }
      if (docData.professionalTitle) {
        const prefix = bp.masthead === 'developer-spec' ? '// ' : '';
        const titleFont = bp.masthead === 'developer-spec' ? monoBold : fonts.bodyBold;
        const titleSize = bp.masthead === 'developer-spec' ? 9.6 : 10.3;
        page0.drawText(toPdfSafeText(`${prefix}${docData.professionalTitle}`).slice(0, 92), {
          x: innerX,
          y: hy,
          size: titleSize,
          font: titleFont,
          color: rgbColor(pal.accent),
        });
        hy -= 13.5;
      }
      const contactFont = bp.masthead === 'developer-spec' ? monoReg : sansReg;
      const contactFontSize = bp.masthead === 'developer-spec' ? 7.6 : 8.1;
      for (const cl of wrapLine(contactJoined, contactFont, contactFontSize, innerW)) {
        page0.drawText(cl, { x: innerX, y: hy, size: contactFontSize, font: contactFont, color: rgbColor(pal.muted) });
        hy -= 10.5;
      }
    }

    if (bp.masthead !== 'developer-spec' && bp.masthead !== 'product-card-split') {
      page0.drawLine({
        start: { x: margin, y: hy - 3 },
        end: { x: margin + contentWidth, y: hy - 3 },
        thickness: bp.masthead === 'atelier-minimal' ? 0.5 : 1.1,
        color: rgbColor(pal.rule),
      });
      bodyStartY = hy - 15;
    } else {
      bodyStartY = Math.min(hy - 12, A4_HEIGHT_PT - margin - 82);
    }
  }

  // Paint Page 1 two-column background rail below masthead (except Template 20 which already spans full height)
  if (spec.columns === 2 && bp.bodyStructure !== 'full-bleed-dark-sidebar') {
    const railW = Math.round(contentWidth * railRatio);
    if (bp.bodyStructure === 'two-col-left-rail') {
      page0.drawRectangle({
        x: margin - 8,
        y: bottomLimit - 6,
        width: railW + 12,
        height: bodyStartY - bottomLimit + 14,
        color: rgbColor(pal.railBg),
      });
    } else {
      const railX = margin + contentWidth - railW;
      page0.drawRectangle({
        x: railX - 8,
        y: bottomLimit - 6,
        width: railW + 14,
        height: bodyStartY - bottomLimit + 14,
        color: rgbColor(pal.railBg),
      });
    }
  }

  // Optional Top Callout Strip on 1-column analytical/executive templates (e.g. 08 KPI highlights)
  if (spec.columns === 1 && bp.callout === 'kpi-highlights') {
    const highlights = extractVerbatimHighlights(docData);
    if (highlights.length >= 2) {
      const boxGap = 8;
      const boxW = (contentWidth - boxGap * (highlights.length - 1)) / highlights.length;
      const boxH = 38;
      const boxBottom = bodyStartY - boxH;
      highlights.forEach((hl, i) => {
        const bx = margin + i * (boxW + boxGap);
        page0.drawRectangle({
          x: bx,
          y: boxBottom,
          width: boxW,
          height: boxH,
          color: rgbColor(pal.cardBg),
          borderColor: rgbColor(pal.rule),
          borderWidth: 0.6,
        });
        page0.drawRectangle({
          x: bx,
          y: boxBottom + boxH - 2.2,
          width: boxW,
          height: 2.2,
          color: rgbColor(pal.accent),
        });
        const lines = wrapLine(hl, sansReg, 7.6, boxW - 10).slice(0, 3);
        let ly = boxBottom + boxH - 12;
        for (const l of lines) {
          page0.drawText(l, { x: bx + 5, y: ly, size: 7.6, font: sansReg, color: rgbColor(pal.ink) });
          ly -= 9.5;
        }
      });
      bodyStartY = boxBottom - 14;
    }
  }

  // =========================================================================
  // COLUMN STREAM RENDERER (Supports 1-Col & 2-Col without horizontal collision)
  // =========================================================================
  const renderSectionFlow = (
    sectionKeys: ResumeSectionKey[],
    region: ColumnRegion,
    initialPageIndex: number,
    initialY: number,
    isSecondaryRail: boolean,
  ) => {
    let pageIdx = initialPageIndex;
    let y = initialY;
    let numberedIndex = 0;

    const pageTopForContinuation = () => (bp.bodyStructure === 'full-bleed-dark-sidebar' ? A4_HEIGHT_PT - 38 : A4_HEIGHT_PT - 46);

    const ensureSpace = (neededPt: number): PDFPage => {
      if (y - neededPt < bottomLimit) {
        pageIdx += 1;
        y = pageTopForContinuation();
      }
      return getOrCreatePage(pageIdx);
    };

    const bodySize = isSecondaryRail ? Math.max(8.4, bp.bodySizePt - 0.6) : bp.bodySizePt;
    const lineLead = bodySize * 1.34;
    const useLeftSectionRail = !isSecondaryRail && spec.columns === 1 && bp.bodyStructure === 'left-section-rail';
    const sectionRailW = useLeftSectionRail ? 104 : 0;
    const flowX = region.x + sectionRailW;
    const flowW = region.width - sectionRailW;

    const drawSectionHeading = (label: string): void => {
      numberedIndex += 1;
      const cleanLabel = toPdfSafeText(label);
      const upperLabel = cleanLabel.toUpperCase();

      if (useLeftSectionRail) {
        const pg = ensureSpace(38);
        pg.drawLine({
          start: { x: region.x, y: y + 4 },
          end: { x: region.x + region.width, y: y + 4 },
          thickness: 0.5,
          color: rgbColor(region.ruleHex),
        });
        const railLines = wrapLine(upperLabel, fonts.headBold, 8.2, sectionRailW - 12);
        let ry = y - 8;
        for (const rl of railLines) {
          pg.drawText(rl, {
            x: region.x,
            y: ry,
            size: 8.2,
            font: fonts.headBold,
            color: rgbColor(region.accentHex),
          });
          ry -= 10;
        }
        y -= 8;
        return;
      }

      const pg = ensureSpace(isSecondaryRail ? 44 : 62);
      const headFont = fonts.headBold;
      const headSize = isSecondaryRail ? 8.8 : 9.6;

      if (!isSecondaryRail && bp.sectionHeadingStyle === 'tinted-band') {
        pg.drawRectangle({
          x: flowX,
          y: y - 13,
          width: flowW,
          height: 17,
          color: rgbColor(pal.accentSoft),
        });
        pg.drawRectangle({
          x: flowX,
          y: y - 13,
          width: 3,
          height: 17,
          color: rgbColor(region.accentHex),
        });
        pg.drawText(upperLabel, {
          x: flowX + 8,
          y: y - 8,
          size: headSize - 0.4,
          font: headFont,
          color: rgbColor(region.accentHex),
        });
        y -= 23;
      } else if (!isSecondaryRail && bp.sectionHeadingStyle === 'numbered-index') {
        const idxStr = String(numberedIndex).padStart(2, '0');
        pg.drawRectangle({
          x: flowX,
          y: y - 13,
          width: flowW,
          height: 17,
          color: rgbColor(pal.accentSoft),
        });
        pg.drawRectangle({
          x: flowX,
          y: y - 13,
          width: 22,
          height: 17,
          color: rgbColor(region.accentHex),
        });
        pg.drawText(idxStr, {
          x: flowX + 5,
          y: y - 8,
          size: 8.2,
          font: sansBold,
          color: rgbColor('#FFFFFF'),
        });
        pg.drawText(upperLabel, {
          x: flowX + 28,
          y: y - 8,
          size: headSize - 0.3,
          font: headFont,
          color: rgbColor(region.inkHex),
        });
        y -= 23;
      } else if (!isSecondaryRail && bp.sectionHeadingStyle === 'pill-tag') {
        const pillW = Math.min(flowW, headFont.widthOfTextAtSize(upperLabel, 8.4) + 16);
        pg.drawRectangle({
          x: flowX,
          y: y - 12,
          width: pillW,
          height: 16,
          color: rgbColor(pal.accentSoft),
        });
        pg.drawText(upperLabel, {
          x: flowX + 8,
          y: y - 7.5,
          size: 8.4,
          font: headFont,
          color: rgbColor(region.accentHex),
        });
        pg.drawLine({
          start: { x: flowX + pillW + 6, y: y - 4 },
          end: { x: flowX + flowW, y: y - 4 },
          thickness: 0.6,
          color: rgbColor(region.ruleHex),
        });
        y -= 21;
      } else if (!isSecondaryRail && bp.sectionHeadingStyle === 'mono-bracket') {
        const bracketed = `[ ${upperLabel} ]`;
        pg.drawText(bracketed, {
          x: flowX,
          y: y - 8,
          size: 9.0,
          font: monoBold,
          color: rgbColor(region.accentHex),
        });
        pg.drawLine({
          start: { x: flowX, y: y - 12 },
          end: { x: flowX + flowW, y: y - 12 },
          thickness: 0.7,
          color: rgbColor(region.ruleHex),
        });
        y -= 21;
      } else if (!isSecondaryRail && bp.sectionHeadingStyle === 'centered-ornament') {
        const tw = headFont.widthOfTextAtSize(upperLabel, headSize);
        const cx = flowX + (flowW - tw) / 2;
        pg.drawLine({ start: { x: flowX, y: y - 4 }, end: { x: Math.max(flowX, cx - 10), y: y - 4 }, thickness: 0.6, color: rgbColor(region.ruleHex) });
        pg.drawText(upperLabel, { x: cx, y: y - 7.5, size: headSize, font: headFont, color: rgbColor(region.accentHex) });
        pg.drawLine({ start: { x: Math.min(flowX + flowW, cx + tw + 10), y: y - 4 }, end: { x: flowX + flowW, y: y - 4 }, thickness: 0.6, color: rgbColor(region.ruleHex) });
        y -= 19;
      } else if (bp.sectionHeadingStyle === 'short-accent-lead') {
        pg.drawRectangle({
          x: flowX,
          y: y - 8,
          width: 14,
          height: 2.2,
          color: rgbColor(region.accentHex),
        });
        pg.drawText(upperLabel, {
          x: flowX + 19,
          y: y - 8.5,
          size: headSize,
          font: headFont,
          color: rgbColor(region.isDarkSurface ? region.inkHex : region.accentHex),
        });
        y -= 18;
      } else if (bp.sectionHeadingStyle === 'swiss-heavy-top') {
        pg.drawLine({
          start: { x: flowX, y: y },
          end: { x: flowX + flowW, y: y },
          thickness: 1.6,
          color: rgbColor(region.isDarkSurface ? region.ruleHex : region.inkHex),
        });
        pg.drawText(upperLabel, {
          x: flowX,
          y: y - 11,
          size: headSize,
          font: headFont,
          color: rgbColor(region.isDarkSurface ? region.inkHex : region.accentHex),
        });
        y -= 20;
      } else {
        // double-rule or full-bottom-rule
        pg.drawText(upperLabel, {
          x: flowX,
          y: y - 8,
          size: headSize,
          font: headFont,
          color: rgbColor(region.isDarkSurface ? region.inkHex : region.accentHex),
        });
        pg.drawLine({
          start: { x: flowX, y: y - 11.5 },
          end: { x: flowX + flowW, y: y - 11.5 },
          thickness: 0.9,
          color: rgbColor(region.ruleHex),
        });
        if (!isSecondaryRail && bp.sectionHeadingStyle === 'double-rule') {
          pg.drawLine({
            start: { x: flowX, y: y - 13.8 },
            end: { x: flowX + flowW, y: y - 13.8 },
            thickness: 0.4,
            color: rgbColor(region.ruleHex),
          });
          y -= 22;
        } else {
          y -= 19;
        }
      }
    };

    const drawParagraphLines = (lines: string[], font: PDFFont, size: number, colorHex: string, indent = 0) => {
      for (const line of lines) {
        const pg = ensureSpace(size * 1.35);
        pg.drawText(line, {
          x: flowX + indent,
          y: y - size,
          size,
          font,
          color: rgbColor(colorHex),
        });
        y -= size * 1.34;
      }
    };

    const drawBulletList = (bullets: string[], maxW: number, startX: number) => {
      for (const bullet of bullets) {
        const wrapped = wrapLine(bullet, fonts.bodyRegular, bodySize, maxW - 11);
        if (!wrapped.length) continue;
        ensureSpace(Math.min(wrapped.length, 2) * lineLead + 2);
        wrapped.forEach((line, idx) => {
          const pg = ensureSpace(lineLead);
          if (idx === 0) {
            pg.drawCircle({
              x: startX + 3,
              y: y - bodySize + 3,
              size: 1.4,
              color: rgbColor(region.accentHex),
            });
          }
          pg.drawText(line, {
            x: startX + 10,
            y: y - bodySize,
            size: bodySize,
            font: fonts.bodyRegular,
            color: rgbColor(region.inkHex),
          });
          y -= lineLead;
        });
        y -= 1.5;
      }
    };

    // Template 20 Dark Sidebar Top Identity + Contact Block
    if (isSecondaryRail && bp.bodyStructure === 'full-bleed-dark-sidebar') {
      const pg = getOrCreatePage(0);
      if (embeddedPhoto) {
        pg.drawImage(embeddedPhoto, {
          x: flowX + (flowW - 58) / 2,
          y: y - 58,
          width: 58,
          height: 58,
        });
        y -= 68;
      } else {
        const circleR = 24;
        const cx = flowX + circleR + 2;
        const cy = y - circleR;
        pg.drawCircle({ x: cx, y: cy, size: circleR, color: rgbColor(pal.accent) });
        const iw = sansBold.widthOfTextAtSize(docData.initials, 15);
        pg.drawText(docData.initials, { x: cx - iw / 2, y: cy - 5, size: 15, font: sansBold, color: rgbColor('#FFFFFF') });
        y -= circleR * 2 + 14;
      }

      if (docData.contactItems.length > 0) {
        drawSectionHeading('Contact & Channels');
        for (const item of docData.contactItems) {
          const pgItem = ensureSpace(22);
          pgItem.drawText(item.label.toUpperCase(), {
            x: flowX,
            y: y - 7,
            size: 6.8,
            font: sansBold,
            color: rgbColor('#38BDF8'),
          });
          y -= 9;
          const vLines = wrapLine(item.value, sansReg, 8.0, flowW);
          drawParagraphLines(vLines, sansReg, 8.0, region.inkHex);
          y -= 3;
        }
        y -= 6;
      }
    }

    for (const key of sectionKeys) {
      if (!hasSectionContent(docData, key)) continue;
      const sectionLabel = getSectionTitle(spec, key);

      if (key === 'summary') {
        drawSectionHeading(sectionLabel);
        if (!isSecondaryRail && bp.callout === 'summary-card') {
          const sumLines = wrapLine(docData.summary, fonts.bodyRegular, bodySize, flowW - 18);
          const cardH = sumLines.length * lineLead + 12;
          const pg = ensureSpace(cardH + 4);
          pg.drawRectangle({
            x: flowX,
            y: y - cardH + 2,
            width: flowW,
            height: cardH,
            color: rgbColor(region.cardHex),
            borderColor: rgbColor(region.ruleHex),
            borderWidth: 0.6,
          });
          pg.drawRectangle({
            x: flowX,
            y: y - cardH + 2,
            width: 3,
            height: cardH,
            color: rgbColor(region.accentHex),
          });
          y -= 5;
          drawParagraphLines(sumLines, fonts.bodyRegular, bodySize, region.inkHex, 10);
          y -= 6;
        } else {
          const sumLines = wrapLine(docData.summary, fonts.bodyRegular, bodySize, flowW);
          drawParagraphLines(sumLines, fonts.bodyRegular, bodySize, region.inkHex);
        }
        y -= bp.sectionGapPt;
      } else if (key === 'skills') {
        drawSectionHeading(sectionLabel);

        if (isSecondaryRail) {
          for (const group of docData.skillGroups) {
            const pg = ensureSpace(24);
            pg.drawText(group.category, {
              x: flowX,
              y: y - bodySize,
              size: bodySize - 0.2,
              font: fonts.bodyBold,
              color: rgbColor(region.isDarkSurface ? '#38BDF8' : region.accentHex),
            });
            y -= lineLead;
            const joined = group.items.join('  -  ');
            const lines = wrapLine(joined, fonts.bodyRegular, bodySize - 0.3, flowW);
            drawParagraphLines(lines, fonts.bodyRegular, bodySize - 0.3, region.inkHex);
            y -= 4;
          }
        } else if (bp.skillsPresentation === 'three-col-pillars' || bp.skillsPresentation === 'two-col-grid') {
          const cols = bp.skillsPresentation === 'three-col-pillars' ? 3 : 2;
          const gap = 12;
          const colW = (flowW - gap * (cols - 1)) / cols;
          const groups = docData.skillGroups.length >= 2 ? docData.skillGroups : [{ category: 'Core Skills', items: docData.skills }];
          for (let i = 0; i < groups.length; i += cols) {
            const rowGroups = groups.slice(i, i + cols);
            const prepared = rowGroups.map((g) => ({
              cat: g.category,
              lines: wrapLine(g.items.join(', '), fonts.bodyRegular, bodySize - 0.2, colW - 10),
            }));
            const maxLines = Math.max(...prepared.map((p) => p.lines.length), 1);
            const blockH = 16 + maxLines * (bodySize * 1.28) + 8;
            const pg = ensureSpace(blockH);
            prepared.forEach((p, cIdx) => {
              const gx = flowX + cIdx * (colW + gap);
              pg.drawRectangle({
                x: gx,
                y: y - blockH + 4,
                width: colW,
                height: blockH,
                color: rgbColor(region.cardHex),
                borderColor: rgbColor(region.ruleHex),
                borderWidth: 0.5,
              });
              pg.drawText(p.cat, {
                x: gx + 6,
                y: y - 10,
                size: bodySize - 0.2,
                font: fonts.bodyBold,
                color: rgbColor(region.accentHex),
              });
              let ly = y - 22;
              for (const ln of p.lines) {
                pg.drawText(ln, { x: gx + 6, y: ly, size: bodySize - 0.3, font: fonts.bodyRegular, color: rgbColor(region.inkHex) });
                ly -= bodySize * 1.26;
              }
            });
            y -= blockH + 4;
          }
        } else if (bp.skillsPresentation === 'grouped-matrix' || bp.skillsPresentation === 'key-value-rows') {
          const labelColW = Math.min(126, flowW * 0.28);
          for (const group of docData.skillGroups) {
            const valLines = wrapLine(group.items.join(', '), fonts.bodyRegular, bodySize, flowW - labelColW - 8);
            const catLines = wrapLine(`${group.category}:`, fonts.bodyBold, bodySize, labelColW);
            const rows = Math.max(valLines.length, catLines.length);
            ensureSpace(rows * lineLead + 2);
            for (let r = 0; r < rows; r += 1) {
              const pg = ensureSpace(lineLead);
              if (catLines[r]) {
                pg.drawText(catLines[r], {
                  x: flowX,
                  y: y - bodySize,
                  size: bodySize,
                  font: fonts.bodyBold,
                  color: rgbColor(region.inkHex),
                });
              }
              if (valLines[r]) {
                pg.drawText(valLines[r], {
                  x: flowX + labelColW + 6,
                  y: y - bodySize,
                  size: bodySize,
                  font: fonts.bodyRegular,
                  color: rgbColor(region.inkHex),
                });
              }
              y -= lineLead;
            }
            y -= 2;
          }
        } else if (bp.skillsPresentation === 'pill-chips') {
          // Drawn as crisp bordered text pills that flow cleanly in natural reading order
          let cx = flowX;
          let pg = ensureSpace(20);
          for (const skill of docData.skills) {
            const sw = fonts.bodyRegular.widthOfTextAtSize(skill, bodySize - 0.4) + 12;
            if (cx + sw > flowX + flowW && cx > flowX) {
              y -= 17;
              cx = flowX;
              pg = ensureSpace(18);
            }
            pg.drawRectangle({
              x: cx,
              y: y - 12,
              width: sw,
              height: 14.5,
              color: rgbColor(pal.accentSoft),
              borderColor: rgbColor(region.ruleHex),
              borderWidth: 0.5,
            });
            pg.drawText(skill, {
              x: cx + 6,
              y: y - 8.5,
              size: bodySize - 0.4,
              font: fonts.bodyRegular,
              color: rgbColor(region.inkHex),
            });
            cx += sw + 5;
          }
          y -= 16;
        } else {
          const inlineText = docData.skills.join('  |  ');
          const lines = wrapLine(inlineText, fonts.bodyRegular, bodySize, flowW);
          drawParagraphLines(lines, fonts.bodyRegular, bodySize, region.inkHex);
        }
        y -= bp.sectionGapPt - 2;
      } else if (key === 'experience') {
        drawSectionHeading(sectionLabel);

        docData.experiences.forEach((exp, expIdx) => {
          const roleTitle = exp.role || 'Professional Role';
          const companyLoc = [exp.company, exp.location].filter(Boolean).join(', ');
          const dateStr = exp.dateRange;

          if (!isSecondaryRail && bp.experienceStyle === 'date-gutter-row') {
            const gutterW = 92;
            const rightX = flowX + gutterW + 10;
            const rightW = flowW - gutterW - 10;
            const pg = ensureSpace(36);
            if (dateStr) {
              for (const [di, dl] of wrapLine(dateStr, sansBold, 8.1, gutterW).entries()) {
                pg.drawText(dl, {
                  x: flowX,
                  y: y - bodySize - di * 10,
                  size: 8.1,
                  font: sansBold,
                  color: rgbColor(region.accentHex),
                });
              }
            }
            if (exp.location) {
              const locLines = wrapLine(exp.location, sansReg, 7.8, gutterW);
              locLines.forEach((ll, li) => {
                pg.drawText(ll, {
                  x: flowX,
                  y: y - bodySize - 12 - li * 9.5,
                  size: 7.8,
                  font: sansReg,
                  color: rgbColor(region.mutedHex),
                });
              });
            }
            const headerLine = [roleTitle, exp.company].filter(Boolean).join('  -  ');
            for (const hl of wrapLine(headerLine, fonts.bodyBold, bodySize + 0.7, rightW)) {
              const pgh = ensureSpace(lineLead + 2);
              pgh.drawText(hl, {
                x: rightX,
                y: y - bodySize,
                size: bodySize + 0.7,
                font: fonts.bodyBold,
                color: rgbColor(region.inkHex),
              });
              y -= lineLead + 1;
            }
            drawBulletList(exp.bullets, rightW, rightX);
            y -= 5;
          } else if (!isSecondaryRail && bp.experienceStyle === 'timeline-node') {
            const nodeGutter = 16;
            const rightX = flowX + nodeGutter;
            const rightW = flowW - nodeGutter;
            const startPage = ensureSpace(38);
            const nodeY = y - bodySize + 3;
            startPage.drawCircle({
              x: flowX + 5,
              y: nodeY,
              size: 3.2,
              color: rgbColor(region.accentHex),
            });
            const dw = dateStr ? sansBold.widthOfTextAtSize(dateStr, 8.2) : 0;
            if (dateStr) {
              startPage.drawText(dateStr, {
                x: rightX + rightW - dw,
                y: y - bodySize,
                size: 8.2,
                font: sansBold,
                color: rgbColor(region.accentHex),
              });
            }
            for (const rl of wrapLine(roleTitle, fonts.bodyBold, bodySize + 0.8, rightW - dw - 10)) {
              startPage.drawText(rl, {
                x: rightX,
                y: y - bodySize,
                size: bodySize + 0.8,
                font: fonts.bodyBold,
                color: rgbColor(region.inkHex),
              });
              y -= lineLead + 1;
            }
            if (companyLoc) {
              const pg2 = ensureSpace(lineLead);
              pg2.drawText(companyLoc, {
                x: rightX,
                y: y - bodySize + 1,
                size: bodySize,
                font: fonts.bodyItalic,
                color: rgbColor(region.mutedHex),
              });
              y -= lineLead;
            }
            const beforeBulletsPage = pageIdx;
            drawBulletList(exp.bullets, rightW, rightX);
            if (pageIdx === beforeBulletsPage && expIdx < docData.experiences.length - 1) {
              startPage.drawLine({
                start: { x: flowX + 5, y: nodeY - 4 },
                end: { x: flowX + 5, y: Math.max(bottomLimit, y - 2) },
                thickness: 0.9,
                color: rgbColor(region.ruleHex),
              });
            }
            y -= 5;
          } else {
            // Standard, Shaded-Role-Bar, Bordered-Card, Executive, Academic, Compact-Consulting
            const pg = ensureSpace(36);
            if (bp.experienceStyle === 'shaded-role-bar') {
              pg.drawRectangle({
                x: flowX,
                y: y - 13,
                width: flowW,
                height: 16,
                color: rgbColor(region.cardHex),
              });
            }
            const padX = bp.experienceStyle === 'shaded-role-bar' ? 5 : 0;
            const dw = dateStr ? sansBold.widthOfTextAtSize(dateStr, 8.2) : 0;
            if (dateStr) {
              pg.drawText(dateStr, {
                x: flowX + flowW - dw - padX,
                y: y - bodySize,
                size: 8.2,
                font: sansBold,
                color: rgbColor(region.mutedHex),
              });
            }

            const firstLineText =
              bp.experienceStyle === 'compact-consulting'
                ? [exp.company, exp.location].filter(Boolean).join(' - ') || roleTitle
                : roleTitle;
            const secondLineText =
              bp.experienceStyle === 'compact-consulting'
                ? exp.company
                  ? roleTitle
                  : ''
                : companyLoc;

            const roleLines = wrapLine(firstLineText, fonts.bodyBold, bodySize + 0.6, Math.max(110, flowW - dw - 14 - padX));
            roleLines.forEach((rl) => {
              const pgr = ensureSpace(lineLead + 1);
              pgr.drawText(rl, {
                x: flowX + padX,
                y: y - bodySize,
                size: bodySize + 0.6,
                font: fonts.bodyBold,
                color: rgbColor(region.inkHex),
              });
              y -= lineLead + 1;
            });

            if (secondLineText) {
              for (const cl of wrapLine(secondLineText, fonts.bodyItalic, bodySize, flowW - padX * 2)) {
                const pgc = ensureSpace(lineLead);
                pgc.drawText(cl, {
                  x: flowX + padX,
                  y: y - bodySize + 1,
                  size: bodySize,
                  font: fonts.bodyItalic,
                  color: rgbColor(region.accentHex),
                });
                y -= lineLead;
              }
            }

            drawBulletList(exp.bullets, flowW - padX, flowX + padX);
            y -= bp.experienceStyle === 'compact-consulting' ? 3.5 : 5.5;
          }
        });
        y -= bp.sectionGapPt - 4;
      } else if (key === 'projects') {
        drawSectionHeading(sectionLabel);

        if (!isSecondaryRail && bp.projectStyle === 'two-col-cards' && docData.projects.length >= 2) {
          const gap = 10;
          const colW = (flowW - gap) / 2;
          for (let i = 0; i < docData.projects.length; i += 2) {
            const pair = docData.projects.slice(i, i + 2);
            const cards = pair.map((proj) => {
              const titleLines = wrapLine(proj.name, fonts.bodyBold, bodySize + 0.3, colW - 14);
              const descText = [proj.description, ...proj.achievements].filter(Boolean).join(' ');
              const descLines = wrapLine(descText, fonts.bodyRegular, bodySize - 0.3, colW - 14);
              const techLines = proj.technologies.length
                ? wrapLine(`Stack: ${proj.technologies.join(', ')}`, sansBold, 7.6, colW - 14)
                : [];
              const totalH =
                12 +
                titleLines.length * (bodySize * 1.3) +
                descLines.length * ((bodySize - 0.3) * 1.28) +
                techLines.length * 10 +
                8;
              return { proj, titleLines, descLines, techLines, totalH };
            });
            const rowH = Math.max(...cards.map((c) => c.totalH));
            const pg = ensureSpace(rowH + 4);
            cards.forEach((c, idx) => {
              const cx = flowX + idx * (colW + gap);
              pg.drawRectangle({
                x: cx,
                y: y - rowH + 3,
                width: colW,
                height: rowH,
                color: rgbColor(region.cardHex),
                borderColor: rgbColor(region.ruleHex),
                borderWidth: 0.6,
              });
              let cy = y - 11;
              for (const tl of c.titleLines) {
                pg.drawText(tl, { x: cx + 7, y: cy, size: bodySize + 0.3, font: fonts.bodyBold, color: rgbColor(region.inkHex) });
                cy -= bodySize * 1.3;
              }
              for (const dl of c.descLines) {
                pg.drawText(dl, { x: cx + 7, y: cy, size: bodySize - 0.3, font: fonts.bodyRegular, color: rgbColor(region.inkHex) });
                cy -= (bodySize - 0.3) * 1.28;
              }
              cy -= 2;
              for (const kl of c.techLines) {
                pg.drawText(kl, { x: cx + 7, y: cy, size: 7.6, font: sansBold, color: rgbColor(region.accentHex) });
                cy -= 9.5;
              }
            });
            y -= rowH + 6;
          }
        } else {
          for (const proj of docData.projects) {
            const pg = ensureSpace(32);
            const urlText = proj.url ? proj.url : '';
            const uw = urlText ? sansReg.widthOfTextAtSize(urlText, 7.9) : 0;
            if (urlText && uw < flowW * 0.48) {
              pg.drawText(urlText, {
                x: flowX + flowW - uw,
                y: y - bodySize,
                size: 7.9,
                font: sansReg,
                color: rgbColor(region.accentHex),
              });
            }
            for (const nl of wrapLine(proj.name, fonts.bodyBold, bodySize + 0.4, flowW - (uw < flowW * 0.48 ? uw + 10 : 0))) {
              const pgn = ensureSpace(lineLead);
              pgn.drawText(nl, {
                x: flowX,
                y: y - bodySize,
                size: bodySize + 0.4,
                font: fonts.bodyBold,
                color: rgbColor(region.inkHex),
              });
              y -= lineLead;
            }
            if (proj.technologies.length > 0) {
              const stackFont = bp.projectStyle === 'tech-spec-cards' ? monoReg : sansBold;
              const stackSize = bp.projectStyle === 'tech-spec-cards' ? 7.8 : 8.0;
              const stackLines = wrapLine(`Technologies: ${proj.technologies.join(', ')}`, stackFont, stackSize, flowW);
              drawParagraphLines(stackLines, stackFont, stackSize, region.accentHex);
            }
            if (proj.description) {
              const dLines = wrapLine(proj.description, fonts.bodyRegular, bodySize, flowW);
              drawParagraphLines(dLines, fonts.bodyRegular, bodySize, region.inkHex);
            }
            if (proj.achievements.length > 0) {
              drawBulletList(proj.achievements, flowW, flowX);
            }
            y -= 4.5;
          }
        }
        y -= bp.sectionGapPt - 4;
      } else if (key === 'education') {
        drawSectionHeading(sectionLabel);
        for (const edu of docData.education) {
          const pg = ensureSpace(44);
          const qual = edu.qualificationLine || edu.degree || 'Qualification';
          const dw = edu.dateRange && !isSecondaryRail ? sansBold.widthOfTextAtSize(edu.dateRange, 8.1) : 0;
          if (edu.dateRange && !isSecondaryRail) {
            pg.drawText(edu.dateRange, {
              x: flowX + flowW - dw,
              y: y - bodySize,
              size: 8.1,
              font: sansBold,
              color: rgbColor(region.mutedHex),
            });
          }
          for (const ql of wrapLine(qual, fonts.bodyBold, bodySize + 0.3, flowW - (dw ? dw + 10 : 0))) {
            const pgq = ensureSpace(lineLead);
            pgq.drawText(ql, {
              x: flowX,
              y: y - bodySize,
              size: bodySize + 0.3,
              font: fonts.bodyBold,
              color: rgbColor(region.inkHex),
            });
            y -= lineLead;
          }
          const instLine = isSecondaryRail && edu.dateRange
            ? [edu.institution, edu.dateRange].filter(Boolean).join('  |  ')
            : edu.institution;
          if (instLine) {
            const iLines = wrapLine(instLine, fonts.bodyItalic, bodySize - 0.1, flowW);
            drawParagraphLines(iLines, fonts.bodyItalic, bodySize - 0.1, region.isDarkSurface ? '#CBD5E1' : region.mutedHex);
          }
          if (edu.achievements) {
            const aLines = wrapLine(edu.achievements, fonts.bodyRegular, bodySize - 0.3, flowW);
            drawParagraphLines(aLines, fonts.bodyRegular, bodySize - 0.3, region.inkHex);
          }
          y -= 4;
        }
        y -= bp.sectionGapPt - 4;
      } else if (key === 'certifications') {
        drawSectionHeading(sectionLabel);
        for (const cert of docData.certifications) {
          const certLine = [cert.name, cert.issuer, cert.date].filter(Boolean).join('  -  ');
          const lines = wrapLine(certLine, fonts.bodyRegular, bodySize, flowW - 10);
          ensureSpace(lines.length * lineLead + 2);
          lines.forEach((ln, idx) => {
            const pg = ensureSpace(lineLead);
            if (idx === 0) {
              pg.drawCircle({
                x: flowX + 3,
                y: y - bodySize + 3,
                size: 1.4,
                color: rgbColor(region.isDarkSurface ? '#38BDF8' : region.accentHex),
              });
            }
            pg.drawText(ln, {
              x: flowX + 10,
              y: y - bodySize,
              size: bodySize,
              font: idx === 0 ? fonts.bodyBold : fonts.bodyRegular,
              color: rgbColor(region.inkHex),
            });
            y -= lineLead;
          });
          y -= 2;
        }
        y -= bp.sectionGapPt - 4;
      } else if (key === 'languages') {
        drawSectionHeading(sectionLabel);
        if (isSecondaryRail) {
          for (const lang of docData.languages) {
            const text = lang.proficiency ? `${lang.language} (${lang.proficiency})` : lang.language;
            const lines = wrapLine(text, fonts.bodyRegular, bodySize, flowW);
            drawParagraphLines(lines, fonts.bodyRegular, bodySize, region.inkHex);
            y -= 1.5;
          }
        } else {
          const joined = docData.languages
            .map((l) => (l.proficiency ? `${l.language} (${l.proficiency})` : l.language))
            .join('   |   ');
          const lines = wrapLine(joined, fonts.bodyRegular, bodySize, flowW);
          drawParagraphLines(lines, fonts.bodyRegular, bodySize, region.inkHex);
        }
        y -= bp.sectionGapPt - 4;
      } else if (key === 'publications') {
        drawSectionHeading(sectionLabel);
        for (const pub of docData.publications) {
          const cite = [pub.title, pub.venue, pub.date, pub.url].filter(Boolean).join(' - ');
          drawBulletList([cite], flowW, flowX);
        }
        y -= bp.sectionGapPt - 4;
      } else if (key === 'awards') {
        drawSectionHeading(sectionLabel);
        drawBulletList(docData.awards, flowW, flowX);
        y -= bp.sectionGapPt - 4;
      } else if (key === 'volunteer') {
        drawSectionHeading(sectionLabel);
        for (const vol of docData.volunteer) {
          const head = [vol.role, vol.organization, vol.dates].filter(Boolean).join(' - ');
          const hLines = wrapLine(head, fonts.bodyBold, bodySize, flowW);
          drawParagraphLines(hLines, fonts.bodyBold, bodySize, region.inkHex);
          if (vol.summary) {
            const sLines = wrapLine(vol.summary, fonts.bodyRegular, bodySize - 0.2, flowW);
            drawParagraphLines(sLines, fonts.bodyRegular, bodySize - 0.2, region.inkHex);
          }
          y -= 3;
        }
        y -= bp.sectionGapPt - 4;
      } else if (key === 'memberships') {
        drawSectionHeading(sectionLabel);
        const mLines = wrapLine(docData.memberships.join('  |  '), fonts.bodyRegular, bodySize, flowW);
        drawParagraphLines(mLines, fonts.bodyRegular, bodySize, region.inkHex);
        y -= bp.sectionGapPt - 4;
      } else if (key === 'additional') {
        drawSectionHeading(sectionLabel);
        const aLines = wrapLine(docData.additional, fonts.bodyRegular, bodySize, flowW);
        drawParagraphLines(aLines, fonts.bodyRegular, bodySize, region.inkHex);
        y -= bp.sectionGapPt - 4;
      } else if (key === 'references') {
        drawSectionHeading(sectionLabel);
        const rLines = wrapLine(docData.references, fonts.bodyRegular, bodySize, flowW);
        drawParagraphLines(rLines, fonts.bodyRegular, bodySize, region.inkHex);
        y -= bp.sectionGapPt - 4;
      }
    }
  };

  if (spec.columns === 1) {
    renderSectionFlow(
      bp.primarySections,
      {
        x: margin,
        width: contentWidth,
        isDarkSurface: false,
        inkHex: pal.ink,
        mutedHex: pal.muted,
        accentHex: pal.accent,
        ruleHex: pal.rule,
        cardHex: pal.cardBg,
      },
      0,
      bodyStartY,
      false,
    );
  } else if (bp.bodyStructure === 'full-bleed-dark-sidebar') {
    const sideW = Math.round(A4_WIDTH_PT * (bp.railRatio ?? 0.33));
    const mainX = sideW + 24;
    const mainW = A4_WIDTH_PT - mainX - 30;
    // Primary column drawn FIRST in PDF stream order
    renderSectionFlow(
      bp.primarySections,
      {
        x: mainX,
        width: mainW,
        isDarkSurface: false,
        inkHex: pal.ink,
        mutedHex: pal.muted,
        accentHex: pal.accent,
        ruleHex: '#CBD5E1',
        cardHex: pal.cardBg,
      },
      0,
      bodyStartY,
      false,
    );
    // Secondary dark sidebar drawn SECOND in PDF stream order
    renderSectionFlow(
      bp.secondarySections,
      {
        x: 20,
        width: sideW - 36,
        isDarkSurface: true,
        inkHex: pal.railInk,
        mutedHex: pal.railMuted,
        accentHex: '#38BDF8',
        ruleHex: pal.rule,
        cardHex: '#1E293B',
      },
      0,
      A4_HEIGHT_PT - 36,
      true,
    );
  } else if (bp.bodyStructure === 'two-col-left-rail') {
    const railW = Math.round(contentWidth * railRatio);
    const mainX = margin + railW + colGap;
    const mainW = contentWidth - railW - colGap;
    // Primary right column drawn FIRST in PDF stream order
    renderSectionFlow(
      bp.primarySections,
      {
        x: mainX,
        width: mainW,
        isDarkSurface: false,
        inkHex: pal.ink,
        mutedHex: pal.muted,
        accentHex: pal.accent,
        ruleHex: pal.rule,
        cardHex: pal.cardBg,
      },
      0,
      bodyStartY,
      false,
    );
    // Secondary left rail drawn SECOND in PDF stream order
    renderSectionFlow(
      bp.secondarySections,
      {
        x: margin,
        width: railW - 4,
        isDarkSurface: false,
        inkHex: pal.railInk,
        mutedHex: pal.railMuted,
        accentHex: pal.accent,
        ruleHex: pal.rule,
        cardHex: pal.cardBg,
      },
      0,
      bodyStartY,
      true,
    );
  } else {
    // two-col-right-rail or two-col-editorial-tint
    const railW = Math.round(contentWidth * railRatio);
    const mainW = contentWidth - railW - colGap;
    const railX = margin + mainW + colGap;
    // Primary left column drawn FIRST in PDF stream order
    renderSectionFlow(
      bp.primarySections,
      {
        x: margin,
        width: mainW,
        isDarkSurface: false,
        inkHex: pal.ink,
        mutedHex: pal.muted,
        accentHex: pal.accent,
        ruleHex: pal.rule,
        cardHex: pal.cardBg,
      },
      0,
      bodyStartY,
      false,
    );
    // Secondary right rail drawn SECOND in PDF stream order
    renderSectionFlow(
      bp.secondarySections,
      {
        x: railX,
        width: railW - 4,
        isDarkSurface: false,
        inkHex: pal.railInk,
        mutedHex: pal.railMuted,
        accentHex: pal.accent,
        ruleHex: pal.rule,
        cardHex: pal.cardBg,
      },
      0,
      bodyStartY,
      true,
    );
  }

  // Page numbering footer when resume spans 2+ pages
  if (pages.length > 1) {
    pages.forEach((p, idx) => {
      const label = `Page ${idx + 1} of ${pages.length}`;
      const lw = sansReg.widthOfTextAtSize(label, 7.5);
      p.drawText(label, {
        x: A4_WIDTH_PT - margin - lw,
        y: 18,
        size: 7.5,
        font: sansReg,
        color: rgbColor(pal.muted),
      });
    });
  }

  return Buffer.from(await pdf.save());
}

/**
 * Render an ISO A4 DOCX matching the selected template's palette, typography,
 * section priority order, and 1-column vs 2-column structure.
 */
export async function renderTemplateDocx(
  title: string,
  sections: ExportSection[],
  templateInput: ResumeTemplate | string,
  photo?: PhotoInput,
  providedResume?: NormalizedResumeDocument | null,
): Promise<Buffer> {
  const spec = resolveTemplateSpec(templateInput);
  const bp = spec.blueprint;
  const accentHex = cleanHex6(spec.accent, '111D35');
  const inkHex = cleanHex6(bp.palette.ink, '0F172A');
  const mutedHex = cleanHex6(bp.palette.muted, '475569');
  const headerFillHex = cleanHex6(bp.palette.headerBg, 'FFFFFF');
  const headerInkHex = cleanHex6(bp.palette.headerInk, '0F172A');
  const railFillHex = cleanHex6(bp.palette.railBg, 'F8FAFC');
  const railInkHex = cleanHex6(bp.palette.railInk, '0F172A');
  const fontFace = bp.bodyFont === 'serif' ? 'Georgia' : 'Calibri';
  const headFace = bp.headingFont === 'serif' ? 'Georgia' : bp.headingFont === 'mono' ? 'Consolas' : 'Calibri';

  const docData = providedResume
    ? { ...providedResume, photoDataUrl: typeof photo === 'string' ? photo : providedResume.photoDataUrl ?? '' }
    : reconstructResumeFromSections(title, sections, typeof photo === 'string' ? photo : null);

  const buildSectionParagraphs = (keys: ResumeSectionKey[], textHex: string, subHex: string): Paragraph[] => {
    const out: Paragraph[] = [];
    for (const key of keys) {
      if (!hasSectionContent(docData, key)) continue;
      const headingText = getSectionTitle(spec, key).toUpperCase();
      out.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          border: {
            bottom: { color: accentHex, size: 6, style: BorderStyle.SINGLE, space: 3 },
          },
          children: [
            new TextRun({ text: headingText, bold: true, size: 20, color: accentHex, font: headFace }),
          ],
        }),
      );

      if (key === 'summary') {
        out.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: docData.summary, size: 20, color: textHex, font: fontFace })],
          }),
        );
      } else if (key === 'skills') {
        for (const group of docData.skillGroups) {
          out.push(
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({ text: `${group.category}: `, bold: true, size: 19, color: textHex, font: fontFace }),
                new TextRun({ text: group.items.join(', '), size: 19, color: textHex, font: fontFace }),
              ],
            }),
          );
        }
      } else if (key === 'experience') {
        for (const exp of docData.experiences) {
          const line1 = [exp.role, exp.company, exp.location].filter(Boolean).join(' - ');
          out.push(
            new Paragraph({
              spacing: { before: 80, after: 30 },
              children: [
                new TextRun({ text: line1, bold: true, size: 20, color: textHex, font: fontFace }),
                ...(exp.dateRange
                  ? [new TextRun({ text: `  (${exp.dateRange})`, size: 18, color: subHex, font: fontFace })]
                  : []),
              ],
            }),
          );
          for (const b of exp.bullets) {
            out.push(
              new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 40 },
                children: [new TextRun({ text: b, size: 19, color: textHex, font: fontFace })],
              }),
            );
          }
        }
      } else if (key === 'projects') {
        for (const proj of docData.projects) {
          out.push(
            new Paragraph({
              spacing: { before: 70, after: 30 },
              children: [
                new TextRun({ text: proj.name, bold: true, size: 20, color: textHex, font: fontFace }),
                ...(proj.url ? [new TextRun({ text: `  (${proj.url})`, size: 18, color: accentHex, font: fontFace })] : []),
              ],
            }),
          );
          if (proj.technologies.length) {
            out.push(
              new Paragraph({
                spacing: { after: 30 },
                children: [new TextRun({ text: `Technologies: ${proj.technologies.join(', ')}`, italics: true, size: 18, color: subHex, font: fontFace })],
              }),
            );
          }
          if (proj.description) {
            out.push(
              new Paragraph({
                spacing: { after: 40 },
                children: [new TextRun({ text: proj.description, size: 19, color: textHex, font: fontFace })],
              }),
            );
          }
          for (const ach of proj.achievements) {
            out.push(
              new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 40 },
                children: [new TextRun({ text: ach, size: 19, color: textHex, font: fontFace })],
              }),
            );
          }
        }
      } else if (key === 'education') {
        for (const edu of docData.education) {
          out.push(
            new Paragraph({
              spacing: { before: 60, after: 30 },
              children: [
                new TextRun({ text: edu.qualificationLine || edu.degree, bold: true, size: 20, color: textHex, font: fontFace }),
                ...(edu.institution ? [new TextRun({ text: ` - ${edu.institution}`, size: 19, color: subHex, font: fontFace })] : []),
                ...(edu.dateRange ? [new TextRun({ text: ` (${edu.dateRange})`, size: 18, color: subHex, font: fontFace })] : []),
              ],
            }),
          );
          if (edu.achievements) {
            out.push(
              new Paragraph({
                spacing: { after: 40 },
                children: [new TextRun({ text: edu.achievements, size: 18, color: textHex, font: fontFace })],
              }),
            );
          }
        }
      } else if (key === 'certifications') {
        for (const cert of docData.certifications) {
          out.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 40 },
              children: [
                new TextRun({
                  text: [cert.name, cert.issuer, cert.date].filter(Boolean).join(' - '),
                  size: 19,
                  color: textHex,
                  font: fontFace,
                }),
              ],
            }),
          );
        }
      } else if (key === 'languages') {
        out.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: docData.languages.map((l) => (l.proficiency ? `${l.language} (${l.proficiency})` : l.language)).join(' | '),
                size: 19,
                color: textHex,
                font: fontFace,
              }),
            ],
          }),
        );
      } else if (key === 'publications') {
        for (const pub of docData.publications) {
          out.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 40 },
              children: [
                new TextRun({
                  text: [pub.title, pub.venue, pub.date, pub.url].filter(Boolean).join(' - '),
                  size: 19,
                  color: textHex,
                  font: fontFace,
                }),
              ],
            }),
          );
        }
      } else if (key === 'awards') {
        for (const award of docData.awards) {
          out.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 40 },
              children: [new TextRun({ text: award, size: 19, color: textHex, font: fontFace })],
            }),
          );
        }
      } else if (key === 'volunteer') {
        for (const vol of docData.volunteer) {
          out.push(
            new Paragraph({
              spacing: { after: 40 },
              children: [
                new TextRun({ text: [vol.role, vol.organization, vol.dates].filter(Boolean).join(' - '), bold: true, size: 19, color: textHex, font: fontFace }),
                ...(vol.summary ? [new TextRun({ text: `: ${vol.summary}`, size: 19, color: textHex, font: fontFace })] : []),
              ],
            }),
          );
        }
      } else if (key === 'memberships') {
        out.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: docData.memberships.join(' | '), size: 19, color: textHex, font: fontFace })],
          }),
        );
      } else if (key === 'additional') {
        out.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: docData.additional, size: 19, color: textHex, font: fontFace })],
          }),
        );
      } else if (key === 'references') {
        out.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: docData.references, size: 19, color: textHex, font: fontFace })],
          }),
        );
      }
    }
    return out;
  };

  const headerChildren: Paragraph[] = [];
  if (spec.photoSupport !== 'none') {
    const validPhoto = resolveValidatedPhoto(photo, docData.photoDataUrl);
    if (validPhoto) {
      headerChildren.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new ImageRun({
              data: validPhoto.bytes,
              transformation: { width: 68, height: 68 },
              type: validPhoto.mime === 'image/png' ? 'png' : 'jpg',
            }),
          ],
        }),
      );
    }
  }

  const headerShaded = headerFillHex !== 'FFFFFF';
  headerChildren.push(
    new Paragraph({
      alignment: bp.masthead === 'sovereign-centered' || bp.masthead === 'institutional-framed' ? AlignmentType.CENTER : AlignmentType.LEFT,
      shading: headerShaded ? { type: ShadingType.CLEAR, color: 'auto', fill: headerFillHex } : undefined,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: docData.fullName || 'Curriculum Vitae', bold: true, size: 32, color: headerShaded ? headerInkHex : accentHex, font: headFace }),
      ],
    }),
  );

  if (docData.professionalTitle) {
    headerChildren.push(
      new Paragraph({
        alignment: bp.masthead === 'sovereign-centered' || bp.masthead === 'institutional-framed' ? AlignmentType.CENTER : AlignmentType.LEFT,
        shading: headerShaded ? { type: ShadingType.CLEAR, color: 'auto', fill: headerFillHex } : undefined,
        spacing: { after: 40 },
        children: [
          new TextRun({ text: docData.professionalTitle, bold: true, size: 22, color: headerShaded ? headerInkHex : accentHex, font: fontFace }),
        ],
      }),
    );
  }

  if (docData.contactItems.length > 0) {
    headerChildren.push(
      new Paragraph({
        alignment: bp.masthead === 'sovereign-centered' || bp.masthead === 'institutional-framed' ? AlignmentType.CENTER : AlignmentType.LEFT,
        shading: headerShaded ? { type: ShadingType.CLEAR, color: 'auto', fill: headerFillHex } : undefined,
        spacing: { after: 140 },
        children: [
          new TextRun({
            text: docData.contactItems.map((c) => c.value).join('  |  '),
            size: 18,
            color: headerShaded ? headerInkHex : mutedHex,
            font: fontFace,
          }),
        ],
      }),
    );
  }

  const twoColumn = spec.columns === 2 || ['two-column', 'sidebar', 'modular-grid'].includes(spec.layout);

  let bodyNodes: Array<Paragraph | Table>;
  if (twoColumn) {
    const primaryParas = buildSectionParagraphs(bp.primarySections, inkHex, mutedHex);
    const secondaryParas = buildSectionParagraphs(
      bp.secondarySections,
      bp.bodyStructure === 'full-bleed-dark-sidebar' ? railInkHex : inkHex,
      bp.bodyStructure === 'full-bleed-dark-sidebar' ? 'CBD5E1' : mutedHex,
    );
    const leftFirst = bp.bodyStructure === 'two-col-left-rail' || bp.bodyStructure === 'full-bleed-dark-sidebar';

    const railCell = new TableCell({
      width: { size: 34, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: railFillHex },
      margins: { top: 120, bottom: 120, left: 140, right: 140 },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      children: secondaryParas.length ? secondaryParas : [new Paragraph('')],
    });

    const mainCell = new TableCell({
      width: { size: 66, type: WidthType.PERCENTAGE },
      margins: { top: 120, bottom: 120, left: 140, right: 140 },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      children: primaryParas.length ? primaryParas : [new Paragraph('')],
    });

    bodyNodes = [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: leftFirst ? [railCell, mainCell] : [mainCell, railCell] })],
      }),
    ];
  } else {
    bodyNodes = buildSectionParagraphs(bp.primarySections, inkHex, mutedHex);
  }

  // ISO A4 in twentieths of a point (twips): 210mm = 11906 twips, 297mm = 16838 twips
  const doc = new DocxDocument({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 820, bottom: 820, left: 860, right: 860 },
          },
        },
        children: [...headerChildren, ...bodyNodes],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
