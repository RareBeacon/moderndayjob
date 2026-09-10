/**
 * Registration-abuse risk scoring (pure, unit-testable). Thresholds are
 * deliberately generous: shared devices and shared IPs (families, offices,
 * cybercafes, teams) must not be locked out. EXTREME blocks new signups from
 * the same signal; HIGH is flagged in the audit trail but allowed, so we never
 * permanently lock a legitimate shared-device user.
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface RegistrationSignals {
  /** Distinct signups attributed to the same (hashed) source IP in the window. */
  signupsFromIp: number;
  /** Distinct signups attributed to the same device cookie in the window. */
  signupsFromDevice: number;
}

export function classifyRegistrationRisk(s: RegistrationSignals): RiskLevel {
  if (s.signupsFromDevice >= 15 || s.signupsFromIp >= 30) return 'EXTREME';
  if (s.signupsFromDevice >= 5 || s.signupsFromIp >= 12) return 'HIGH';
  if (s.signupsFromDevice >= 2 || s.signupsFromIp >= 5) return 'MEDIUM';
  return 'LOW';
}

export function isRegistrationBlocked(risk: RiskLevel): boolean {
  return risk === 'EXTREME';
}

export function riskDescription(risk: RiskLevel): string {
  switch (risk) {
    case 'EXTREME':
      return 'Registration velocity on this device or network is unusually high. Please try again later or contact support.';
    case 'HIGH':
      return 'Registration velocity is elevated; account creation continues.';
    case 'MEDIUM':
      return 'Registration velocity is above normal.';
    default:
      return 'Registration velocity is normal.';
  }
}
