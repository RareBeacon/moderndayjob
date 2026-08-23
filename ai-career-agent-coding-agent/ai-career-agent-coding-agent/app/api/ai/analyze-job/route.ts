import {requireUser} from '@/lib/auth';import {assertEntitlement} from '@packages/security/entitlements';import {z} from 'zod';
const body=z.object({jobDescription:z.string().min(30).max(30000)});
export async function POST(req:Request){const u=await requireUser();await assertEntitlement(u.id,'ai');const {jobDescription}=body.parse(await req.json());return Response.json({status:'queued',message:'Job analysis pipeline is ready for worker execution.',jobDescriptionLength:jobDescription.length})}
