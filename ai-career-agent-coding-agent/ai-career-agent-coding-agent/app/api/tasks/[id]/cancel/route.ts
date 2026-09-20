import { NextResponse } from 'next/server'; import { requireUser } from '@/lib/auth'; import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const rl = await enforceRateLimit(`tasks:id:cancel:${requestIp(req)}`, 20, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
const user=await requireUser({ req: req }).catch(()=>null);if(!user)return NextResponse.json({error:'UNAUTHENTICATED'},{status:401});const {id}=await params;const {data,error}=await supabaseAdmin.rpc('cancel_agent_task',{p_task_id:id,p_user_id:user.id});if(error)return NextResponse.json({error:'TASK_CANCEL_FAILED'},{status:500});return NextResponse.json({cancelled:data});}
