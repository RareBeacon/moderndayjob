import {Ratelimit} from '@upstash/ratelimit';import {Redis} from '@upstash/redis';
const url=process.env.UPSTASH_REDIS_REST_URL;const token=process.env.UPSTASH_REDIS_REST_TOKEN;
const redis=url&&token?new Redis({url,token}):null;
export async function enforceRateLimit(key:string,limit:number,window:'1 m'|'1 h'|'1 d'='1 m'){if(!redis)return {allowed:true,remaining:limit};const rl=new Ratelimit({redis,limiter:Ratelimit.slidingWindow(limit,window),analytics:true,prefix:'aca'});const r=await rl.limit(key);return {allowed:r.success,remaining:r.remaining}}
export function requestIp(req:Request){return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||req.headers.get('x-real-ip')||'unknown'}
