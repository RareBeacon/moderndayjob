import {describe,it,expect} from 'vitest';import {PLANS} from '../packages/shared/plans';
describe('plans',()=>{it('has agreed pricing and quotas',()=>{expect(PLANS.BASIC.priceKobo).toBe(500000);expect(PLANS.BASIC.dailyApplications).toBe(10);expect(PLANS.PREMIUM.priceKobo).toBe(1000000);expect(PLANS.PREMIUM.dailyApplications).toBe(20);expect(PLANS.FREE.dailyCredits).toBe(2)})})
