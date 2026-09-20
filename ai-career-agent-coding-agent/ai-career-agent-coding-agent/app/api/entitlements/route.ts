import {requireUser} from '../../../lib/auth';import {getEntitlement} from '@packages/security/entitlements';export async function GET(req: Request){
  const rl = await enforceRateLimit(`entitlements:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
const u=await requireUser({ req: req }).catch(()=>null);if(!u)return Response.json({error:'UNAUTHENTICATED'},{status:401});return Response.json(await getEntitlement(u.id))}
import { enforceRateLimit, requestIp } from '../../../lib/rate-limit';
