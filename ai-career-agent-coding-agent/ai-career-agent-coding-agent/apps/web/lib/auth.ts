import {createClient} from '@supabase/ssr';import {cookies} from 'next/headers';import {env} from './env';
export async function getUser(){const c=await cookies();const s=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll(){return c.getAll()},setAll(){}}});const {data:{user}}=await s.auth.getUser();return user;}
export async function requireUser(){const user=await getUser();if(!user)throw new Error('UNAUTHENTICATED');return user;}
