export const PLANS={FREE:{priceKobo:0,dailyCredits:2,dailyApplications:0},BASIC:{priceKobo:500000,dailyCredits:4,dailyApplications:10},PREMIUM:{priceKobo:1000000,dailyCredits:8,dailyApplications:20}} as const;
export type Plan=keyof typeof PLANS;
export function trialActive(status:string,ends:string|null){return status==='TRIAL'&&!!ends&&new Date(ends)>new Date()}
