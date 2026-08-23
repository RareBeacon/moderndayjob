import {requireUser} from '../../../../lib/auth';import {supabaseAdmin} from '../../../../lib/supabase';
async function admin(){const u=await requireUser();const {data:r}=await supabaseAdmin.from('admin_users').select('user_id').eq('user_id',u.id).maybeSingle();if(!r)throw new Error('FORBIDDEN');return u}
export async function GET(){await admin();const {data}=await supabaseAdmin.from('admin_user_overview').select('*').order('created_at',{ascending:false});return Response.json(data??[])}
