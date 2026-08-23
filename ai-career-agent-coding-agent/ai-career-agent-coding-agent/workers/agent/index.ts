import { supabaseAdmin } from '../../lib/supabase';
type Task={id:string;user_id:string;type:string;lease_token:string;attempts:number;payload:Record<string,unknown>};
const POLL_MS=5000;
async function complete(task:Task,status:string,result:Record<string,unknown>){await supabaseAdmin.from('agent_tasks').update({status,result,completed_at:new Date().toISOString(),lease_token:null,lease_expires_at:null,updated_at:new Date().toISOString()}).eq('id',task.id).eq('lease_token',task.lease_token);}
async function fail(task:Task,error:unknown){const message=error instanceof Error?error.message:'TASK_FAILED';const retry=task.attempts<3;await supabaseAdmin.from('agent_tasks').update({status:retry?'QUEUED':'FAILED',last_error:message,next_attempt_at:new Date(Date.now()+Math.min(60_000,1000*2**task.attempts)).toISOString(),lease_token:null,lease_expires_at:null,updated_at:new Date().toISOString()}).eq('id',task.id).eq('lease_token',task.lease_token);}
async function process(task:Task){if(task.type==='APPLICATION'){await complete(task,'WAITING_APPROVAL',{reason:'Automation is disabled until an approved site adapter and user approval are available.'});return;}await complete(task,'SUCCEEDED',{message:'No operation required.'});}
async function tick(){const {data,error}=await supabaseAdmin.rpc('claim_agent_tasks',{p_limit:5,p_lease_seconds:120});if(error)throw error;for(const task of (data??[]) as Task[]){try{await process(task)}catch(error){await fail(task,error)}}}
async function main(){console.log('agent worker online');await tick().catch(console.error);setInterval(()=>void tick().catch(console.error),POLL_MS)}
void main();
