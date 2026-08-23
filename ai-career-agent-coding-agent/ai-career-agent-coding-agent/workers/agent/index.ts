/** Render worker entrypoint. Poll/consume agent_tasks from Supabase in production. */
import {supabaseAdmin} from '../../apps/web/lib/supabase';
async function main(){console.log('agent worker online');setInterval(async()=>{const {data}=await supabaseAdmin.from('agent_tasks').select('*').eq('status','QUEUED').limit(5);for(const task of data??[]){await supabaseAdmin.from('agent_tasks').update({status:'RUNNING',updated_at:new Date().toISOString()}).eq('id',task.id);}},5000)}main();
