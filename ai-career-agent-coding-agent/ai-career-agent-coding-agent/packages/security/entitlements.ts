import {supabaseAdmin} from '../../lib/supabase';
export async function getEntitlement(userId:string){const {data,error}=await supabaseAdmin.from('v_workspace_entitlements').select('*').eq('user_id',userId).single();if(error)throw error;return data}
export async function assertEntitlement(userId:string,feature:string){const e=await getEntitlement(userId);if(e.account_status!=='ACTIVE')throw new Error('ACCOUNT_BLOCKED');if(feature==='automation'&&!e.automation_enabled)throw new Error('AUTOMATION_NOT_ENTITLED');return e}
