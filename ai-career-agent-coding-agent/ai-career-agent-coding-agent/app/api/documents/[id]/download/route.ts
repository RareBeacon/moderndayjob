import { NextResponse } from 'next/server'; import { requireUser } from '@/lib/auth'; import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  const rl = await enforceRateLimit(`documents:id:download:${requestIp(req)}`, 60, '1 m');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
const user=await requireUser({ req: req }).catch(()=>null);if(!user)return NextResponse.json({error:'UNAUTHENTICATED'},{status:401});const {id}=await params;const {data}=await supabaseAdmin.from('documents').select('storage_path,original_name').eq('id',id).eq('user_id',user.id).maybeSingle();if(!data)return NextResponse.json({error:'NOT_FOUND'},{status:404});const {data:signed,error}=await supabaseAdmin.storage.from('career-documents').createSignedUrl(data.storage_path,60);if(error||!signed)return NextResponse.json({error:'DOWNLOAD_UNAVAILABLE'},{status:500});return NextResponse.json({url:signed.signedUrl,name:data.original_name});}
