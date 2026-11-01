import { describe, expect, it } from 'vitest';
import { PLANS as SHARED_PLANS, normalizePlanCode } from '@/packages/shared/plans';
import { PLANS as BILLING_PLANS, PAID_PLAN_ORDER } from '@/lib/billing/pricing';
import { hasAdminPermission, type AdminContext } from '@/lib/admin';
import {
  generatePlainRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from '@/lib/security/mfa-recovery';

describe('Ultra Plan Restructuring, 3-Tier RBAC & MFA Recovery Cryptography', () => {
  it('enforces exact 4-tier subscription catalog (Free, Basic, Premium, Ultra) with zero leftover MAX tier', () => {
    expect(Object.keys(SHARED_PLANS)).toEqual(['FREE', 'BASIC', 'PREMIUM', 'ULTRA']);
    expect(PAID_PLAN_ORDER).toEqual(['BASIC', 'PREMIUM', 'ULTRA']);

    expect(SHARED_PLANS.BASIC.monthlyNgn).toBe(5000);
    expect(SHARED_PLANS.BASIC.monthlySuccessfulApplications).toBe(30);
    expect(SHARED_PLANS.BASIC.unlimitedApplications).toBe(false);

    expect(SHARED_PLANS.PREMIUM.monthlyNgn).toBe(10000);
    expect(SHARED_PLANS.PREMIUM.monthlySuccessfulApplications).toBe(50);
    expect(SHARED_PLANS.PREMIUM.unlimitedApplications).toBe(false);

    expect(BILLING_PLANS.ULTRA.name).toBe('Ultra');
    expect(SHARED_PLANS.ULTRA.monthlyNgn).toBe(20000);
    expect(SHARED_PLANS.ULTRA.monthlySuccessfulApplications).toBeNull();
    expect(SHARED_PLANS.ULTRA.unlimitedApplications).toBe(true);

    expect(BILLING_PLANS.ULTRA.monthlyUsd).toBe(14.99);
    expect(BILLING_PLANS.ULTRA.unlimitedApplications).toBe(true);

    expect(normalizePlanCode('MAX')).toBe('ULTRA');
    expect(normalizePlanCode('ultra')).toBe('ULTRA');
    expect(normalizePlanCode('unknown')).toBe('FREE');
  });

  it('enforces 3-tier Admin RBAC boundaries (OWNER -> SUB_ADMIN -> STAFF)', () => {
    const owner: AdminContext = {
      userId: 'u-owner',
      email: 'owner@jobiest.com',
      role: 'OWNER',
      isOwner: true,
      isActive: true,
      requireMfa: true,
      permissions: {},
    };
    const subAdmin: AdminContext = {
      userId: 'u-sub',
      email: 'sub@jobiest.com',
      role: 'SUB_ADMIN',
      isOwner: false,
      isActive: true,
      requireMfa: true,
      permissions: {
        can_view_analytics: true,
        can_manage_programme: true,
        can_manage_subscriptions: false,
      },
    };
    const staff: AdminContext = {
      userId: 'u-staff',
      email: 'staff@jobiest.com',
      role: 'STAFF',
      isOwner: false,
      isActive: true,
      requireMfa: true,
      permissions: {
        can_manage_admins: true, // Even if misconfigured in JSON, STAFF must be denied!
        can_terminate_users: true,
        can_manage_credentials: true,
      },
    };

    expect(hasAdminPermission(owner, 'can_manage_admins')).toBe(true);
    expect(hasAdminPermission(owner, 'can_manage_subscriptions')).toBe(true);
    expect(hasAdminPermission(owner, 'can_manage_programme')).toBe(true);

    expect(hasAdminPermission(subAdmin, 'can_manage_admins')).toBe(false);
    expect(hasAdminPermission(subAdmin, 'can_view_analytics')).toBe(true);
    expect(hasAdminPermission(subAdmin, 'can_manage_programme')).toBe(true);
    expect(hasAdminPermission(subAdmin, 'can_manage_subscriptions')).toBe(false);

    expect(hasAdminPermission(staff, 'can_manage_admins')).toBe(false);
    expect(hasAdminPermission(staff, 'can_terminate_users')).toBe(false);
    expect(hasAdminPermission(staff, 'can_manage_credentials')).toBe(false);
    expect(hasAdminPermission(staff, 'can_manage_support')).toBe(true);
  });

  it('generates 8 single-use recovery codes and hashes them deterministically with per-user + per-code salt', () => {
    const codes = generatePlainRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }

    const normalized = normalizeRecoveryCode('  abcd-efgh-jklm ');
    expect(normalized).toBe('ABCDEFGHJKLM');

    const h1 = hashRecoveryCode('user-1', codes[0]);
    const h1LowerWithDashes = hashRecoveryCode('user-1', codes[0].toLowerCase());
    const hDifferentUser = hashRecoveryCode('user-2', codes[0]);
    const hDifferentCode = hashRecoveryCode('user-1', codes[1]);

    expect(h1).toBe(h1LowerWithDashes);
    expect(h1).not.toContain(codes[0]);
    expect(h1).not.toBe(hDifferentUser);
    expect(h1).not.toBe(hDifferentCode);
  });
});
