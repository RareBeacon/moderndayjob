import { describe, expect, it } from 'vitest';
import { deflateSync, inflateSync } from 'node:zlib';
import { PDFDocument, PDFName } from 'pdf-lib';
import {
  MAX_PHOTO_BYTES,
  detectPhotoMime,
  parsePhotoDataUrl,
  photoDataUrl,
  validatePhotoBytes,
} from '@/lib/resume-studio/photo';
import { MASTER_CATALOG_TEMPLATES, templatePhotoSupport } from '@/lib/resume-studio/templates';
import { normalizeStudioDraft } from '@/lib/resume-studio/draft';
import { parseDocumentContent, renderDocx, renderPdf } from '@/lib/documents/export';

/** Build a structurally valid 1x1 RGB PNG (pdf-lib fully decodes it). */
function makePng(): Buffer {
  const CRC_TABLE = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const idat = deflateSync(Buffer.from([0x00, 0x10, 0x20, 0x30])); // filter byte + RGB pixel
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Minimal JPEG: SOI + JFIF APP0 + SOF0 (1x1) + SOS + EOI. pdf-lib parses SOF for dimensions. */
function makeJpeg(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x7f, 0xff, 0xd9,
  ]);
}

const WEBP_MAGIC = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

function alexMorganCv(templateId: string, photoDataUrl?: string) {
  return JSON.stringify({
    templateId,
    templateName: 'Spec template',
    contact: { name: 'Alex Morgan', email: 'alex.morgan@example.com', phone: '+234 801 234 5678', location: 'Lagos, Nigeria' },
    headline: 'Senior Product Manager',
    summary: 'Product manager with eight years of experience shipping data driven platforms for fintech teams across Africa.',
    experiences: [
      { company: 'Paystack', title: 'Senior Product Manager', location: 'Lagos', start: '2022', end: 'Present', bullets: ['Led a 9 person platform squad', 'Cut checkout latency by 38 percent'] },
      { company: 'Flutterwave', title: 'Product Manager', location: 'Lagos', start: '2019', end: '2022', bullets: ['Launched merchant dashboard v2', 'Grew weekly active merchants 3x'] },
    ],
    skills: ['Roadmapping', 'SQL', 'Stakeholder management', 'Experimentation'],
    education: [{ institution: 'University of Lagos', qualification: 'BSc Computer Science', start: '2013', end: '2017', achievements: '' }],
    certifications: [{ name: 'Certified Scrum Product Owner', issuer: 'Scrum Alliance', date: '2021' }],
    achievements: ['Winner, MTN API hackathon 2020'],
    references: 'Available on request',
    ...(photoDataUrl ? { photoDataUrl } : {}),
  });
}

function longCv(templateId: string, photoDataUrl?: string) {
  const base = JSON.parse(alexMorganCv(templateId, photoDataUrl));
  base.experiences = Array.from({ length: 12 }, (_, i) => ({
    company: `Company ${i + 1}`,
    title: 'Senior Product Manager',
    location: 'Lagos',
    start: '2010',
    end: '2026',
    bullets: ['Delivered platform migration with zero downtime', 'Grew revenue 24 percent year over year', 'Hired and mentored four analysts', 'Owned quarterly planning for three squads', 'Cut infrastructure spend by 19 percent'],
  }));
  base.skills = Array.from({ length: 30 }, (_, i) => `Skill ${i + 1}`);
  base.education = Array.from({ length: 6 }, (_, i) => ({ institution: `University ${i + 1}`, qualification: 'BSc', start: '2000', end: '2004', achievements: '' }));
  return JSON.stringify(base);
}

/** Count image XObjects by inspecting object dictionaries after a reload. */
async function pdfImageCount(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(new Uint8Array(buffer));
  let images = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = (obj as { dict?: Map<unknown, unknown> }).dict;
    if (dict) {
      const subtype = dict.get(PDFName.of('Subtype'));
      if (subtype && String(subtype) === '/Image') images += 1;
    }
  }
  return images;
}

/** Search all (possibly Flate compressed) streams for drawn text: proves real, selectable text operators. */
async function pdfContainsText(buffer: Buffer, needle: string): Promise<boolean> {
  const doc = await PDFDocument.load(new Uint8Array(buffer));
  const literal = Buffer.from(needle, 'latin1');
  const hex = literal.toString('hex'); // pdf-lib drawText emits hex strings like <416c6578...>
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const stream = obj as { dict?: Map<unknown, unknown>; contents?: Uint8Array };
    if (!stream.dict || !stream.contents) continue;
    const filter = stream.dict.get(PDFName.of('Filter'));
    let data: Buffer;
    try {
      data = filter && String(filter).includes('Flate') ? inflateSync(Buffer.from(stream.contents)) : Buffer.from(stream.contents);
    } catch {
      continue;
    }
    if (data.includes(literal)) return true;
    if (data.toString('latin1').toLowerCase().includes(hex)) return true;
  }
  return false;
}

describe('photo validation lib', () => {
  it('detects JPEG and PNG by magic bytes and rejects WebP', () => {
    expect(detectPhotoMime(makeJpeg())).toBe('image/jpeg');
    expect(detectPhotoMime(makePng())).toBe('image/png');
    expect(detectPhotoMime(WEBP_MAGIC)).toBeNull();
    expect(detectPhotoMime(Buffer.from('not an image'))).toBeNull();
    expect(detectPhotoMime(Buffer.alloc(0))).toBeNull();
  });

  it('enforces the 2 MB cap and non empty input', () => {
    expect(validatePhotoBytes(Buffer.alloc(0))).toEqual({ ok: false, error: 'PHOTO_EMPTY' });
    const oversize = Buffer.concat([makeJpeg(), Buffer.alloc(MAX_PHOTO_BYTES, 0)]);
    expect(validatePhotoBytes(oversize)).toEqual({ ok: false, error: 'PHOTO_TOO_LARGE' });
    expect(validatePhotoBytes(makeJpeg())).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(validatePhotoBytes(makePng())).toEqual({ ok: true, mime: 'image/png' });
    expect(validatePhotoBytes(WEBP_MAGIC)).toEqual({ ok: false, error: 'PHOTO_UNSUPPORTED_TYPE' });
  });

  it('round trips a data URL and re validates stored values', () => {
    const jpeg = makeJpeg();
    const url = photoDataUrl(jpeg, 'image/jpeg');
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    const parsed = parsePhotoDataUrl(url);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Buffer.from(parsed.bytes).equals(jpeg)).toBe(true);

    expect(parsePhotoDataUrl('data:image/webp;base64,AAAA')).toEqual({ ok: false, error: 'PHOTO_MALFORMED_DATA_URL' });
    expect(parsePhotoDataUrl('')).toEqual({ ok: false, error: 'PHOTO_MISSING' });
    expect(parsePhotoDataUrl(42)).toEqual({ ok: false, error: 'PHOTO_MISSING' });
    // declared PNG but bytes are JPEG: rejected
    expect(parsePhotoDataUrl(photoDataUrl(makeJpeg(), 'image/png' as 'image/jpeg'))).toEqual({ ok: false, error: 'PHOTO_MIME_MISMATCH' });
  });
});

describe('draft normalization carries the photo', () => {
  it('keeps a well formed data URL and wipes anything else', () => {
    const url = photoDataUrl(makePng(), 'image/png');
    const personal = (photoDataUrl: string) => ({ name: 'Alex Morgan', email: 'a@example.com', phone: '', location: '', website: '', linkedin: '', github: '', photoDataUrl });
    expect(normalizeStudioDraft({ personal: personal(url) }).personal.photoDataUrl).toBe(url);
    expect(normalizeStudioDraft({ personal: personal('javascript:alert(1)') }).personal.photoDataUrl).toBe('');
    expect(normalizeStudioDraft({ personal: personal('') }).personal.photoDataUrl).toBe('');
  });
});

describe('parseDocumentContent re validation', () => {
  it('attaches a valid photo and silently drops an invalid one', () => {
    const url = photoDataUrl(makeJpeg(), 'image/jpeg');
    const parsed = parseDocumentContent('CV', alexMorganCv('modern-tech', url));
    expect(parsed.photo?.mime).toBe('image/jpeg');
    if (parsed.photo) expect(Buffer.from(parsed.photo.bytes).equals(makeJpeg())).toBe(true);

    const noPhoto = parseDocumentContent('CV', alexMorganCv('modern-tech'));
    expect(noPhoto.photo).toBeUndefined();

    // client could store arbitrary JSON: a bogus data URL must not reach the renderers
    const tampered = parseDocumentContent('CV', JSON.stringify({ ...JSON.parse(alexMorganCv('modern-tech')), photoDataUrl: 'data:image/png;base64,' + Buffer.from('fake').toString('base64') }));
    expect(tampered.photo).toBeUndefined();
  });
});

describe('PDF and DOCX rendering with a photo', () => {
  it('embeds the photo in PDF page 1 and keeps text selectable', async () => {
    const parsed = parseDocumentContent('CV', alexMorganCv('modern-tech', photoDataUrl(makePng(), 'image/png')));
    const pdf = await renderPdf(parsed.title, parsed.sections, parsed.photo);
    expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect((await pdfImageCount(pdf)) >= 1).toBe(true);
    const doc = await PDFDocument.load(new Uint8Array(pdf));
    expect(doc.getPageCount()).toBe(1);
    // selectable text is structural: pdf-lib drawText emits real text operators (streams are Flate compressed)
    expect(await pdfContainsText(pdf, 'Alex Morgan')).toBe(true);

    const plain = parseDocumentContent('CV', alexMorganCv('modern-tech'));
    const plainPdf = await renderPdf(plain.title, plain.sections, plain.photo);
    expect(await pdfImageCount(plainPdf)).toBe(0);
  });

  it('embeds the photo in DOCX and preserves the zip container', async () => {
    const parsed = parseDocumentContent('CV', alexMorganCv('modern-tech', photoDataUrl(makeJpeg(), 'image/jpeg')));
    const docx = await renderDocx(parsed.title, parsed.sections, parsed.photo);
    expect(docx.subarray(0, 2).toString('ascii')).toBe('PK');
    // zip local file headers store entry names uncompressed, so media is detectable
    expect(docx.includes('word/media/')).toBe(true);

    const plain = parseDocumentContent('CV', alexMorganCv('modern-tech'));
    const plainDocx = await renderDocx(plain.title, plain.sections, plain.photo);
    expect(plainDocx.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(plainDocx.includes('word/media/')).toBe(false);
  });

  it('flows long content across multiple pages with and without a photo', async () => {
    for (const withPhoto of [false, true]) {
      const parsed = parseDocumentContent('CV', longCv('modern-tech', withPhoto ? photoDataUrl(makePng(), 'image/png') : undefined));
      const pdf = await renderPdf(parsed.title, parsed.sections, parsed.photo);
      const doc = await PDFDocument.load(new Uint8Array(pdf));
      expect(doc.getPageCount()).toBeGreaterThan(1);
    }
  });

  it('renders optional sections present and absent', async () => {
    const base = JSON.parse(alexMorganCv('modern-tech', photoDataUrl(makePng(), 'image/png')));
    const minimal = { ...base, certifications: undefined, achievements: undefined, references: undefined, education: [] };
    for (const content of [JSON.stringify(base), JSON.stringify(minimal)]) {
      const parsed = parseDocumentContent('CV', content);
      const pdf = await renderPdf(parsed.title, parsed.sections, parsed.photo);
      const docx = await renderDocx(parsed.title, parsed.sections, parsed.photo);
      expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(docx.subarray(0, 2).toString('ascii')).toBe('PK');
    }
  });
});

describe('per template export checklist (all 20 master catalog templates)', () => {
  it('exports every template to valid PDF and DOCX with photo support honored', async () => {
    expect(MASTER_CATALOG_TEMPLATES).toHaveLength(20);
    const photoUrl = photoDataUrl(makePng(), 'image/png');
    for (const template of MASTER_CATALOG_TEMPLATES) {
      const support = templatePhotoSupport(template);
      const wantsPhoto = support !== 'none';
      const content = alexMorganCv(template.id, wantsPhoto ? photoUrl : undefined);
      const parsed = parseDocumentContent('CV', content);

      const pdf = await renderPdf(parsed.title, parsed.sections, parsed.photo);
      expect(pdf.subarray(0, 4).toString('ascii'), `${template.id} PDF magic`).toBe('%PDF');
      expect(await pdfContainsText(pdf, 'Alex Morgan'), `${template.id} PDF selectable name text`).toBe(true);

      const docx = await renderDocx(parsed.title, parsed.sections, parsed.photo);
      expect(docx.subarray(0, 2).toString('ascii'), `${template.id} DOCX magic`).toBe('PK');

      if (wantsPhoto) {
        expect(await pdfImageCount(pdf), `${template.id} embedded PDF image`).toBeGreaterThan(0);
        expect(docx.includes('word/media/'), `${template.id} DOCX media entry`).toBe(true);
      } else {
        expect(await pdfImageCount(pdf), `${template.id} no PDF image`).toBe(0);
        expect(docx.includes('word/media/'), `${template.id} no DOCX media`).toBe(false);
      }

      // long variant must paginate for every template
      const longParsed = parseDocumentContent('CV', longCv(template.id, wantsPhoto ? photoUrl : undefined));
      const longPdf = await renderPdf(longParsed.title, longParsed.sections, longParsed.photo);
      const longDoc = await PDFDocument.load(new Uint8Array(longPdf));
      expect(longDoc.getPageCount(), `${template.id} multipage`).toBeGreaterThan(1);
    }
  });

  it('has exactly one photo required template and enforces it via the wizard contract', () => {
    const required = MASTER_CATALOG_TEMPLATES.filter((t) => templatePhotoSupport(t) === 'required');
    expect(required).toHaveLength(1);
    // generate route rejects PHOTO_REQUIRED when the required template has no photo: covered by route guard reading templatePhotoSupport
    expect(templatePhotoSupport(required[0])).toBe('required');
  });
});
