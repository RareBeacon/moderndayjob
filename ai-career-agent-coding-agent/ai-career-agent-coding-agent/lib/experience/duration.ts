/**
 * Employment Duration and Date Validation Engine
 * Implements calendar-month arithmetic and human-readable formatting.
 */

export interface ExperienceDateSpan {
  startMonth?: number | null;
  startYear?: number | null;
  endMonth?: number | null;
  endYear?: number | null;
  isCurrent?: boolean;
  // Also accept snake_case inputs for compatibility with DB/Zod schemas
  start_month?: number | null;
  start_year?: number | null;
  end_month?: number | null;
  end_year?: number | null;
  is_current?: boolean;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTH_ABBRS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatMonthName(monthNumber?: number | null, abbr = false): string {
  if (!monthNumber || monthNumber < 1 || monthNumber > 12) return '';
  return abbr ? MONTH_ABBRS[monthNumber - 1] : MONTH_NAMES[monthNumber - 1];
}

function resolveSpan(span: ExperienceDateSpan) {
  const startMonth = span.startMonth ?? span.start_month ?? null;
  const startYear = span.startYear ?? span.start_year ?? null;
  const endMonth = span.endMonth ?? span.end_month ?? null;
  const endYear = span.endYear ?? span.end_year ?? null;
  const isCurrent = Boolean(span.isCurrent ?? span.is_current);

  return { startMonth, startYear, endMonth, endYear, isCurrent };
}

export function calculateDurationMonths(
  startMonth: number | null | undefined,
  startYear: number,
  endMonth: number | null | undefined,
  endYear: number,
): number {
  const sMonth = startMonth && startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
  const eMonth = endMonth && endMonth >= 1 && endMonth <= 12 ? endMonth : 12;

  const total = (endYear - startYear) * 12 + (eMonth - sMonth) + 1;
  return Math.max(1, total);
}

export function formatExperienceDuration(totalMonths: number): string {
  if (totalMonths <= 0) return '0 mos';
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years > 0 && months > 0) {
    const yrStr = years === 1 ? '1 yr' : `${years} yrs`;
    const moStr = months === 1 ? '1 mo' : `${months} mos`;
    return `${yrStr} ${moStr}`;
  }
  if (years > 0) {
    return years === 1 ? '1 yr' : `${years} yrs`;
  }
  return months === 1 ? '1 mo' : `${months} mos`;
}

export function formatExperienceDateRange(span: ExperienceDateSpan): string {
  const { startMonth, startYear, endMonth, endYear, isCurrent } = resolveSpan(span);

  if (!startYear) {
    return isCurrent ? 'Present' : '';
  }

  const startPart = startMonth
    ? `${formatMonthName(startMonth, true)} ${startYear}`
    : `${startYear}`;

  if (isCurrent) {
    const now = new Date();
    const duration = calculateEmploymentDuration(span, now);
    const durLabel = duration ? ` (${formatExperienceDuration(duration.totalMonths)})` : '';
    return `${startPart} · Present${durLabel}`;
  }

  if (!endYear) {
    return startPart;
  }

  const endPart = endMonth
    ? `${formatMonthName(endMonth, true)} ${endYear}`
    : `${endYear}`;

  const duration = calculateEmploymentDuration(span);
  const durLabel = duration ? ` (${formatExperienceDuration(duration.totalMonths)})` : '';

  return `${startPart} · ${endPart}${durLabel}`;
}

export interface DurationResult {
  totalMonths: number;
  years: number;
  months: number;
  label: string;
}

/**
 * Calculates employment duration from start and end dates.
 * Accounts for current month/year when isCurrent is true.
 */
export function calculateEmploymentDuration(
  span: ExperienceDateSpan,
  now: Date = new Date(),
): DurationResult | null {
  const { startMonth, startYear, endMonth, endYear, isCurrent } = resolveSpan(span);

  if (!startYear) return null;

  const effectiveStartMonth = startMonth && startMonth >= 1 && startMonth <= 12 ? startMonth : 1;

  let effectiveEndYear: number;
  let effectiveEndMonth: number;

  if (isCurrent) {
    effectiveEndYear = now.getFullYear();
    effectiveEndMonth = now.getMonth() + 1; // 1-indexed
  } else if (endYear) {
    effectiveEndYear = endYear;
    effectiveEndMonth = endMonth && endMonth >= 1 && endMonth <= 12 ? endMonth : 12;
  } else {
    return null;
  }

  // Calculate inclusive calendar months
  const totalMonths =
    (effectiveEndYear - startYear) * 12 + (effectiveEndMonth - effectiveStartMonth) + 1;

  if (totalMonths <= 0) {
    return { totalMonths: 0, years: 0, months: 0, label: '0 months' };
  }

  const years = Math.floor(totalMonths / 12);
  const remainingMonths = totalMonths % 12;

  let label = '';
  if (years > 0 && remainingMonths > 0) {
    const yrText = years === 1 ? '1 year' : `${years} years`;
    const moText = remainingMonths === 1 ? '1 month' : `${remainingMonths} months`;
    label = `${yrText}, ${moText}`;
  } else if (years > 0) {
    label = years === 1 ? '1 year' : `${years} years`;
  } else {
    label = remainingMonths === 1 ? '1 month' : `${remainingMonths} months`;
  }

  return { totalMonths, years, months: remainingMonths, label };
}

/**
 * Validates start and end date relationships.
 */
export function validateExperienceDates(
  span: ExperienceDateSpan,
  now: Date = new Date(),
): { valid: boolean; error?: string } {
  const { startMonth, startYear, endMonth, endYear, isCurrent } = resolveSpan(span);

  if (!startYear && !endYear && !isCurrent) {
    // Legacy record without dates
    return { valid: true };
  }

  if (isCurrent && !startYear) {
    return { valid: false, error: 'Please specify start year for your current role.' };
  }

  if (startYear && (startYear < 1950 || startYear > 2100)) {
    return { valid: false, error: 'Start year must be between 1950 and 2100.' };
  }

  if (startMonth && (startMonth < 1 || startMonth > 12)) {
    return { valid: false, error: 'Start month must be between 1 and 12.' };
  }

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (isCurrent) {
    if (startYear && startYear > currentYear) {
      return { valid: false, error: 'Start date for ongoing employment cannot be in the future.' };
    }
    if (
      startYear &&
      startYear === currentYear &&
      startMonth &&
      startMonth > currentMonth
    ) {
      return { valid: false, error: 'Start date for ongoing employment cannot be in the future.' };
    }
    return { valid: true };
  }

  // Not current -> requires end year if start year is provided
  if (startYear && !endYear) {
    return { valid: false, error: 'Please provide an end year or mark this role as current.' };
  }

  if (endYear && (endYear < 1950 || endYear > 2100)) {
    return { valid: false, error: 'End year must be between 1950 and 2100.' };
  }

  if (endMonth && (endMonth < 1 || endMonth > 12)) {
    return { valid: false, error: 'End month must be between 1 and 12.' };
  }

  if (startYear && endYear) {
    if (endYear < startYear) {
      return { valid: false, error: 'End date cannot precede start date.' };
    }
    if (endYear === startYear && startMonth && endMonth && endMonth < startMonth) {
      return { valid: false, error: 'End month cannot precede start month.' };
    }
  }

  return { valid: true };
}

// Alias for convenience
export const validateExperienceDateSpan = validateExperienceDates;
