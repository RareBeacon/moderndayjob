/**
 * Resume photo validation (Workstream C).
 *
 * Server-side validation at BOTH boundaries: the upload endpoint validates
 * what the browser sends, and the export pipeline re-validates the data URL
 * stored in draft content before embedding it in a PDF or DOCX. Magic-byte
 * sniffing is used (never the client-declared Content-Type). WebP is excluded
 * deliberately: the PDF renderer (pdf-lib) cannot embed WebP.
 */

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB
export type PhotoMime = 'image/jpeg' | 'image/png';

export type PhotoValidation =
  | { ok: true; mime: PhotoMime }
  | { ok: false; error: 'PHOTO_TOO_LARGE' | 'PHOTO_UNSUPPORTED_TYPE' | 'PHOTO_EMPTY' };

/** Detect the true image type from magic bytes. */
export function detectPhotoMime(bytes: Uint8Array): PhotoMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return null;
}

export function validatePhotoBytes(bytes: Uint8Array): PhotoValidation {
  if (!bytes || bytes.length === 0) return { ok: false, error: 'PHOTO_EMPTY' };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: 'PHOTO_TOO_LARGE' };
  const mime = detectPhotoMime(bytes);
  if (!mime) return { ok: false, error: 'PHOTO_UNSUPPORTED_TYPE' };
  return { ok: true, mime };
}

/** Build a data URL from validated bytes. */
export function photoDataUrl(bytes: Uint8Array, mime: PhotoMime): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/**
 * Parse and RE-VALIDATE a stored data URL (export-time defense: draft content
 * is user-controlled JSON, so a client could have bypassed the upload route).
 */
export function parsePhotoDataUrl(value: unknown): { ok: true; bytes: Uint8Array; mime: PhotoMime } | { ok: false; error: string } {
  if (typeof value !== 'string' || value.length === 0) return { ok: false, error: 'PHOTO_MISSING' };
  const match = /^data:(image\/jpeg|image\/png);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return { ok: false, error: 'PHOTO_MALFORMED_DATA_URL' };
  const bytes = Buffer.from(match[2], 'base64');
  const validation = validatePhotoBytes(new Uint8Array(bytes));
  if (!validation.ok) return { ok: false, error: validation.error };
  if (detectPhotoMime(new Uint8Array(bytes)) !== match[1] as PhotoMime) return { ok: false, error: 'PHOTO_MIME_MISMATCH' };
  return { ok: true, bytes: new Uint8Array(bytes), mime: validation.mime };
}
