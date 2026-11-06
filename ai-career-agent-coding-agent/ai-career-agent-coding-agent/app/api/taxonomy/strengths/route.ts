import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { getUser } from '@/lib/auth';

const FALLBACK_STRENGTHS = [
  { name: 'Critical Thinking', category: 'thinking_problem_solving', description: 'Analyzing facts objectively to form a reasoned judgment.' },
  { name: 'Analytical Thinking', category: 'thinking_problem_solving', description: 'Breaking complex problems into components to evaluate evidence systematically.' },
  { name: 'Strategic Thinking', category: 'thinking_problem_solving', description: 'Planning long-term objectives and anticipating future trends.' },
  { name: 'Creative Thinking', category: 'thinking_problem_solving', description: 'Generating innovative approaches, original ideas, and novel perspectives.' },
  { name: 'Logical Reasoning', category: 'thinking_problem_solving', description: 'Using structured deduction and consistent principles to reach sound conclusions.' },
  { name: 'Problem-Solving', category: 'thinking_problem_solving', description: 'Identifying issues, evaluating solutions, and effectively resolving obstacles.' },
  { name: 'Attention to Detail', category: 'thinking_problem_solving', description: 'Ensuring accuracy, thoroughness, and precision across deliverables.' },
  { name: 'Leadership', category: 'leadership_ownership', description: 'Inspiring, guiding, and driving teams toward collective excellence.' },
  { name: 'Initiative', category: 'leadership_ownership', description: 'Taking proactive action without needing external direction.' },
  { name: 'Accountability', category: 'leadership_ownership', description: 'Taking full personal responsibility for outcomes and delivering on commitments.' },
  { name: 'Ownership', category: 'leadership_ownership', description: "Treating projects and products as one's own with deep personal investment." },
  { name: 'Self-Motivation', category: 'leadership_ownership', description: 'Driving forward autonomously with internal passion and discipline.' },
  { name: 'Mentoring', category: 'leadership_ownership', description: 'Coaching and elevating colleagues to develop their capabilities.' },
  { name: 'Verbal Communication', category: 'communication_collaboration', description: 'Articulating ideas clearly, persuasively, and engagingly in speech.' },
  { name: 'Written Communication', category: 'communication_collaboration', description: 'Crafting clear, concise, and structured written documentation.' },
  { name: 'Active Listening', category: 'communication_collaboration', description: 'Fully hearing, understanding, and validating others before responding.' },
  { name: 'Collaboration', category: 'communication_collaboration', description: 'Working harmoniously across functions, backgrounds, and time zones.' },
  { name: 'Teamwork', category: 'communication_collaboration', description: 'Putting team goals first and supporting peers toward shared wins.' },
  { name: 'Empathy', category: 'communication_collaboration', description: 'Understanding and sharing the feelings, perspectives, and needs of others.' },
  { name: 'Discipline', category: 'execution_work_ethic', description: 'Maintaining rigorous focus and consistent standards over time.' },
  { name: 'Consistency', category: 'execution_work_ethic', description: 'Delivering reliable, high-quality results day in and day out.' },
  { name: 'Time Management', category: 'execution_work_ethic', description: 'Optimizing schedules, beating deadlines, and balancing multiple priorities.' },
  { name: 'Reliability', category: 'execution_work_ethic', description: 'Being dependable and consistently executing promised commitments.' },
  { name: 'Adaptability', category: 'execution_work_ethic', description: 'Pivoting effectively in fast-changing environments and shifting demands.' },
  { name: 'Resourcefulness', category: 'execution_work_ethic', description: 'Finding clever, efficient ways to solve problems with available tools.' },
  { name: 'Execution', category: 'execution_work_ethic', description: 'Turning plans and strategies into tangible, shipped outcomes.' },
  { name: 'Creativity', category: 'creativity_innovation', description: 'Bringing imagination, originality, and fresh ideas to life.' },
  { name: 'Innovation', category: 'creativity_innovation', description: 'Pioneering new methods, product features, and business improvements.' },
  { name: 'Continuous Improvement', category: 'creativity_innovation', description: 'Constantly refining processes, code, and products (kaizen).' },
  { name: 'Learning Agility', category: 'learning_growth', description: 'Rapidly absorbing new concepts, tools, and domain dynamics.' },
  { name: 'Growth Mindset', category: 'learning_growth', description: 'Believing skills and intelligence develop through dedicated effort.' },
  { name: 'Resilience', category: 'learning_growth', description: 'Bouncing back from difficulties and turning challenges into fuel.' },
  { name: 'Customer Empathy', category: 'interpersonal_customer_facing', description: 'Deeply understanding customer pain points, emotions, and aspirations.' },
  { name: 'Emotional Intelligence', category: 'interpersonal_customer_facing', description: 'Perceiving, managing, and channeling emotions constructively.' },
];

const STRENGTH_CATEGORIES = [
  { id: 'thinking_problem_solving', label: 'Thinking & Problem-Solving' },
  { id: 'leadership_ownership', label: 'Leadership & Ownership' },
  { id: 'communication_collaboration', label: 'Communication & Collaboration' },
  { id: 'execution_work_ethic', label: 'Execution & Work Ethic' },
  { id: 'creativity_innovation', label: 'Creativity & Innovation' },
  { id: 'learning_growth', label: 'Learning & Growth' },
  { id: 'interpersonal_customer_facing', label: 'Interpersonal & Customer-Facing' },
] as const;

export async function GET(req: Request) {
  const ip = requestIp(req);
  const rl = await enforceRateLimit(`tax:strengths:${ip}`, 120, '1 m');
  if (!rl.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const category = (url.searchParams.get('category') || '').trim();
  const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 80);

  try {
    let query = supabaseAdmin
      .from('personal_strengths')
      .select('id, name, normalized_name, category, description, aliases')
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
        strengths: sorted.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          description: s.description || '',
        })),
        categories: STRENGTH_CATEGORIES,
      });
    }
  } catch {}

  const filtered = FALLBACK_STRENGTHS.filter((s) => {
    if (category && s.category !== category) return false;
    if (!q) return true;
    return s.name.toLowerCase().includes(q);
  }).slice(0, limit);

  return NextResponse.json({ strengths: filtered, categories: STRENGTH_CATEGORIES });
}
