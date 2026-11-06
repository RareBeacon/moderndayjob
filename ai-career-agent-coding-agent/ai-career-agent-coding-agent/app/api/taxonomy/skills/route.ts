import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { getUser } from '@/lib/auth';

const FALLBACK_SKILLS = [
  { name: 'JavaScript', category: 'Technical Skills' },
  { name: 'TypeScript', category: 'Technical Skills' },
  { name: 'React', category: 'Software and Technology' },
  { name: 'Next.js', category: 'Software and Technology' },
  { name: 'Node.js', category: 'Software and Technology' },
  { name: 'Python', category: 'Technical Skills' },
  { name: 'SQL', category: 'Data and Analytics' },
  { name: 'PostgreSQL', category: 'Software and Technology' },
  { name: 'HTML5', category: 'Technical Skills' },
  { name: 'CSS3', category: 'Technical Skills' },
  { name: 'Tailwind CSS', category: 'Software and Technology' },
  { name: 'Figma', category: 'Design and Creative' },
  { name: 'UI/UX Design', category: 'Design and Creative' },
  { name: 'Product Design', category: 'Design and Creative' },
  { name: 'Website Design', category: 'Design and Creative' },
  { name: 'Web Development', category: 'Technical Skills' },
  { name: 'Data Analysis', category: 'Data and Analytics' },
  { name: 'Machine Learning', category: 'Data and Analytics' }, // copy-guard:allow
  { name: 'Product Management', category: 'Business and Management' },
  { name: 'Project Management', category: 'Business and Management' },
  { name: 'Agile Methodologies', category: 'Business and Management' },
  { name: 'SEO', category: 'Marketing and Sales' },
  { name: 'Digital Marketing', category: 'Marketing and Sales' },
  { name: 'Copywriting', category: 'Marketing and Sales' },
  { name: 'Sales Development', category: 'Marketing and Sales' },
  { name: 'Financial Analysis', category: 'Finance and Accounting' },
  { name: 'Accounting', category: 'Finance and Accounting' },
  { name: 'Human Resources', category: 'Administration and Operations' },
];

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tax:skills:${ip}`, 120, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const category = (url.searchParams.get('category') || '').trim();
  const limit = Math.min(Number(url.searchParams.get('limit')) || 25, 50);

  try {
    let query = supabaseAdmin
      .from('skills')
      .select('id, name, normalized_name, category, aliases')
      .eq('is_active', true)
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    if (q) {
      query = query.or(`normalized_name.ilike.%${q}%,name.ilike.%${q}%`);
    } else {
      query = query.order('name', { ascending: true });
    }

    const { data, error } = await query;

    if (!error && Array.isArray(data) && data.length > 0) {
      // Sort matches: exact first, prefix second, others third
      const sorted = [...data].sort((a, b) => {
        const aNorm = (a.normalized_name || a.name || '').toLowerCase();
        const bNorm = (b.normalized_name || b.name || '').toLowerCase();
        if (aNorm === q && bNorm !== q) return -1;
        if (bNorm === q && aNorm !== q) return 1;
        if (aNorm.startsWith(q) && !bNorm.startsWith(q)) return -1;
        if (bNorm.startsWith(q) && !aNorm.startsWith(q)) return 1;
        return aNorm.localeCompare(bNorm);
      });

      return NextResponse.json({
        skills: sorted.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
        })),
      });
    }
  } catch {}

  // Fallback filtering if DB is unpopulated or slow
  const filtered = FALLBACK_SKILLS.filter((s) => {
    if (category && s.category.toLowerCase() !== category.toLowerCase()) return false;
    if (!q) return true;
    return s.name.toLowerCase().includes(q);
  }).slice(0, limit);

  return NextResponse.json({ skills: filtered });
}
