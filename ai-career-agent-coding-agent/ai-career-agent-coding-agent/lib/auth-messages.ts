/**
 * Maps raw Supabase auth error strings to calm, actionable messages
 * (UI/UX Brief §11 — never show only "something went wrong").
 */
export function humanizeAuthError(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'That email and password didn’t match. Double-check them, or create an account.';
  }
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (m.includes('password should be') || m.includes('weak') || m.includes('at least')) {
    return 'Please choose a stronger password (at least 8 characters).';
  }
  if (m.includes('email') && m.includes('invalid')) {
    return 'Please enter a valid email address.';
  }
  if (m.includes('confirm')) {
    return 'We couldn’t sign you in. Confirm your email if you haven’t already.';
  }
  return 'Something went wrong on our end. Please try again.';
}
