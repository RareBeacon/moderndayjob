import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { getUser } from '@/lib/auth';

const FALLBACK_ROLES = [
  { title: 'Software Engineer', category: 'Software and Technology', seniority: 'Mid' },
  { title: 'Frontend Developer', category: 'Software and Technology', seniority: 'Mid' },
  { title: 'Backend Engineer', category: 'Software and Technology', seniority: 'Mid' },
  { title: 'Full-Stack Engineer', category: 'Software and Technology', seniority: 'Mid' },
  { title: 'Senior Software Engineer', category: 'Software and Technology', seniority: 'Senior' },
  { title: 'Lead Software Engineer', category: 'Software and Technology', seniority: 'Lead' },
  { title: 'Engineering Manager', category: 'Software and Technology', seniority: 'Management' },
  { title: 'DevOps Engineer', category: 'Software and Technology', seniority: 'Mid' },
  { title: 'Data Analyst', category: 'Artificial Intelligence and Data', seniority: 'Mid' },
  { title: 'Data Scientist', category: 'Artificial Intelligence and Data', seniority: 'Mid' },
  { title: 'Data Engineer', category: 'Artificial Intelligence and Data', seniority: 'Mid' },
  { title: 'AI Engineer', category: 'Artificial Intelligence and Data', seniority: 'Mid' },
  { title: 'Product Designer', category: 'Design and Creative', seniority: 'Mid' },
  { title: 'Senior Product Designer', category: 'Design and Creative', seniority: 'Senior' },
  { title: 'Product Manager', category: 'Product and Project Management', seniority: 'Mid' },
  { title: 'Senior Product Manager', category: 'Product and Project Management', seniority: 'Senior' },
  { title: 'Project Manager', category: 'Product and Project Management', seniority: 'Mid' },
  { title: 'Digital Marketing Manager', category: 'Marketing and Communications', seniority: 'Mid' },
  { title: 'SEO Specialist', category: 'Marketing and Communications', seniority: 'Mid' },
  { title: 'Copywriter', category: 'Marketing and Communications', seniority: 'Mid' },
  { title: 'Sales Development Representative', category: 'Sales and Business Development', seniority: 'Entry' },
  { title: 'Account Executive', category: 'Sales and Business Development', seniority: 'Mid' },
  { title: 'Business Development Manager', category: 'Sales and Business Development', seniority: 'Mid' },
  { title: 'Financial Analyst', category: 'Finance and Accounting', seniority: 'Mid' },
  { title: 'Accountant', category: 'Finance and Accounting', seniority: 'Mid' },
  { title: 'Customer Success Manager', category: 'Customer Success and Support', seniority: 'Mid' },
  { title: 'Operations Manager', category: 'Administration and Operations', seniority: 'Mid' },
];

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tax:roles:${ip}`, 120, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const limit = Math.min(Number(url.searchParams.get('limit')) || 25, 50);

  try {
    let query = supabaseAdmin
      .from('job_roles')
      .select('id, title, normalized_title, category, seniority_level, aliases')
      .eq('is_active', true)
      .limit(limit);

    if (q) {
      query = query.or(`normalized_title.ilike.%${q}%,title.ilike.%${q}%`);
    } else {
      query = query.order('title', { ascending: true });
    }

    const { data, error } = await query;

    if (!error && Array.isArray(data) && data.length > 0) {
      const sorted = [...data].sort((a, b) => {
        const aNorm = (a.normalized_title || a.title || '').toLowerCase();
        const bNorm = (b.normalized_title || b.title || '').toLowerCase();
        if (aNorm === q && bNorm !== q) return -1;
        if (bNorm === q && aNorm !== q) return 1;
        if (aNorm.startsWith(q) && !bNorm.startsWith(q)) return -1;
        if (bNorm.startsWith(q) && !aNorm.startsWith(q)) return 1;
        return aNorm.localeCompare(bNorm);
      });

      return NextResponse.json({
        roles: sorted.map((r) => ({
          id: r.id,
          title: r.title,
          category: r.category,
          seniority: r.seniority_level,
        })),
      });
    }
  } catch {}

  const filtered = FALLBACK_ROLES.filter((r) => {
    if (!q) return true;
    return r.title.toLowerCase().includes(q);
  }).slice(0, limit);

  return NextResponse.json({ roles: filtered });
}
