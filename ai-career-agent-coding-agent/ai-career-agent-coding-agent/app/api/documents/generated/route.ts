import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Lists the user's immutable, versioned generated documents.
 * Creation happens with the AI provider layer (Phase 5/7); this read endpoint
 * and the table model are ready for it. SELECT-only by RLS owner policy.
 */
export async function GET() {
  const user = await requireUser();
  const { data, error } = await supabaseAdmin
    .from('generated_documents')
    .select('id,kind,title,version,is_active,created_at,application_id,content,source_facts')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'GENERATED_DOCUMENT_LIST_FAILED' }, { status: 500 });
  return NextResponse.json({ documents: data });
}
