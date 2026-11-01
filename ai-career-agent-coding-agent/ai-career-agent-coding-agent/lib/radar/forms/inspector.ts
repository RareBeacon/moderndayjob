/**
 * Read-Only External Application Form Inspector
 * ==============================================
 * Inspects public Google Forms (`FB_PUBLIC_LOAD_DATA_`), Tally forms, and
 * generic hosted application forms WITHOUT ever submitting a form or bypassing
 * access controls.
 *
 * Enforces standing safety constraints:
 *   - `requiresHumanApproval` is ALWAYS `true` (mirrors SQL `radar_forms_human_approval_chk`).
 *   - Detects closed forms (`AUTHORITATIVE_FORM_CLOSED` for Condition 3).
 *   - Flags sensitive government ID (`SSN`, `BVN`, `NIN`, passport, bank details)
 *     and upfront payment prompts on the form itself (`Condition 2`).
 */

import type { ApplyMechanism } from '@/lib/radar/types';
import { classifyApplyDestination } from '@/lib/radar/dedup/canonicalize';

export interface FormQuestionField {
  id: string;
  label: string;
  required: boolean;
  fieldType: 'SHORT_TEXT' | 'PARAGRAPH' | 'CHOICE' | 'FILE_UPLOAD' | 'DATE_TIME' | 'UNKNOWN';
}

export interface ExternalFormInspectionResult {
  formUrl: string;
  provider: ApplyMechanism;
  formTitle: string | null;
  formClosed: boolean;
  requiresLogin: boolean;
  collectsEmail: boolean;
  requestsFileUpload: boolean;
  requestsSensitiveId: boolean;
  requestsPayment: boolean;
  requiresHumanApproval: true;
  questions: FormQuestionField[];
}

const SENSITIVE_FIELD_PATTERNS = [
  /\bsocial\s+security(?:\s+number)?\b/i,
  /\bssn\b/i,
  /\bbvn\b/i,
  /\bnational\s+identification\s+number\b/i,
  /\bnin\b/i,
  /\bpassport\s+(?:number|copy|scan)\b/i,
  /\bbank\s+account\s+number\b/i,
  /\bcredit\s+card\b/i,
];

const PAYMENT_FIELD_PATTERNS = [
  /\b(?:application|registration|training|onboarding|processing)\s+fee\b/i,
  /\bproof\s+of\s+payment\b/i,
  /\btransaction\s+(?:receipt|hash|id)\b/i,
  /\bsend\s+usdt\b/i,
];

const CLOSED_FORM_PATTERNS = [
  /is\s+no\s+longer\s+accepting\s+responses/i,
  /this\s+form\s+is\s+closed/i,
  /submissions\s+are\s+closed/i,
  /form\s+has\s+expired/i,
];

function extractBalancedJsonArray(source: string, startBracketIdx: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startBracketIdx; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startBracketIdx, i + 1);
      }
    }
  }
  return null;
}

function mapGoogleQuestionType(code: unknown): FormQuestionField['fieldType'] {
  switch (code) {
    case 0:
      return 'SHORT_TEXT';
    case 1:
      return 'PARAGRAPH';
    case 2:
    case 3:
    case 4:
    case 5:
    case 7:
      return 'CHOICE';
    case 9:
    case 10:
      return 'DATE_TIME';
    case 13:
      return 'FILE_UPLOAD';
    default:
      return 'UNKNOWN';
  }
}

export function inspectExternalFormHtml(input: {
  formUrl: string;
  html: string;
  httpStatus?: number;
  finalUrl?: string;
}): ExternalFormInspectionResult {
  const dest = classifyApplyDestination(input.formUrl);
  const html = input.html || '';

  const redirectedToLogin = Boolean(
    input.finalUrl && /accounts\.google\.com\/ServiceLogin|login\.microsoftonline\.com/i.test(input.finalUrl),
  );
  const requiresLogin =
    redirectedToLogin ||
    input.httpStatus === 401 ||
    input.httpStatus === 403 ||
    /you\s+need\s+permission|sign\s+in\s+to\s+continue/i.test(html);

  const formClosed =
    input.httpStatus === 404 ||
    input.httpStatus === 410 ||
    CLOSED_FORM_PATTERNS.some((re) => re.test(html));

  let formTitle: string | null = null;
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleMatch) {
    formTitle = titleMatch[1].replace(/\s+/g, ' ').trim() || null;
  }

  const questions: FormQuestionField[] = [];
  let collectsEmail = /\bemail\s*address\b/i.test(html);
  let requestsFileUpload = false;

  // Parse Google Forms read-only `FB_PUBLIC_LOAD_DATA_` skeleton if present
  const markerIdx = html.indexOf('FB_PUBLIC_LOAD_DATA_');
  if (markerIdx >= 0) {
    const bracketIdx = html.indexOf('[', markerIdx);
    if (bracketIdx >= 0) {
      const jsonText = extractBalancedJsonArray(html, bracketIdx);
      if (jsonText) {
        try {
          const root = JSON.parse(jsonText) as unknown[];
          const meta = Array.isArray(root[1]) ? (root[1] as unknown[]) : null;
          if (meta) {
            if (typeof meta[8] === 'string' && meta[8].trim()) {
              formTitle = meta[8].trim();
            }
            const rawItems = Array.isArray(meta[1]) ? (meta[1] as unknown[]) : [];
            for (const item of rawItems) {
              if (!Array.isArray(item)) continue;
              const label = typeof item[1] === 'string' ? item[1].trim() : '';
              const typeCode = item[3];
              const fieldType = mapGoogleQuestionType(typeCode);
              if (fieldType === 'FILE_UPLOAD') requestsFileUpload = true;

              const entryMeta = Array.isArray(item[4]) && Array.isArray(item[4][0]) ? (item[4][0] as unknown[]) : null;
              const entryId = entryMeta && (typeof entryMeta[0] === 'number' || typeof entryMeta[0] === 'string')
                ? `entry.${entryMeta[0]}`
                : String(item[0] ?? questions.length);
              const required = Boolean(entryMeta && entryMeta[2] === 1);

              if (label) {
                questions.push({ id: entryId, label, required, fieldType });
              }
            }
          }
        } catch {
          // Malformed skeleton falls back safely to HTML heuristics
        }
      }
    }
  }

  // Fallback HTML label extraction for Tally / generic forms when no FB_PUBLIC_LOAD_DATA_ exists
  if (questions.length === 0) {
    const labelRe = /<label[^>]*>([\s\S]{1,200}?)<\/label>/gi;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = labelRe.exec(html)) !== null && idx < 40) {
      const clean = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean) {
        questions.push({
          id: `field_${idx++}`,
          label: clean,
          required: /\*/.test(clean),
          fieldType: /resume|cv|upload/i.test(clean) ? 'FILE_UPLOAD' : 'UNKNOWN',
        });
      }
    }
    if (/<input[^>]+type\s*=\s*["']file["']/i.test(html)) {
      requestsFileUpload = true;
    }
  }

  const combinedPrompts = [formTitle ?? '', ...questions.map((q) => q.label)].join('\n');
  if (/\bemail\b/i.test(combinedPrompts)) collectsEmail = true;

  const requestsSensitiveId = SENSITIVE_FIELD_PATTERNS.some((re) => re.test(combinedPrompts));
  const requestsPayment = PAYMENT_FIELD_PATTERNS.some((re) => re.test(combinedPrompts));

  return {
    formUrl: input.formUrl,
    provider: dest.applyMechanism,
    formTitle,
    formClosed,
    requiresLogin,
    collectsEmail,
    requestsFileUpload,
    requestsSensitiveId,
    requestsPayment,
    requiresHumanApproval: true,
    questions,
  };
}
