export type ResumeTemplateCategory = 'minimal' | 'modern' | 'professional' | 'creative' | 'executive';
export type ResumeTemplateDensity = 'airy' | 'balanced' | 'compact';
export type ResumeTemplateLayout = 'single-column' | 'two-column' | 'sidebar' | 'timeline' | 'header-band' | 'split-header' | 'modular-grid';

export interface ResumeTemplate {
  id: string;
  name: string;
  category: ResumeTemplateCategory;
  description: string;
  layout: ResumeTemplateLayout;
  density: ResumeTemplateDensity;
  bestFor: string[];
  accent: string;
  heading: 'serif' | 'sans' | 'mono-accent';
  skillStyle: 'chips' | 'bars' | 'columns' | 'inline' | 'matrix';
  personality: 'quiet' | 'technical' | 'formal' | 'editorial' | 'bold';
}

const minimal: ResumeTemplate[] = [
  { id: 'minimal-clarity', name: 'Minimal Clarity', category: 'minimal', description: 'A calm one-column layout with crisp spacing and zero decoration.', layout: 'single-column', density: 'balanced', bestFor: ['general', 'early-career', 'operations'], accent: '#111827', heading: 'sans', skillStyle: 'inline', personality: 'quiet' },
  { id: 'minimal-air', name: 'Minimal Air', category: 'minimal', description: 'Wide margins, light rules and a spacious executive feel.', layout: 'single-column', density: 'airy', bestFor: ['consulting', 'leadership', 'strategy'], accent: '#334155', heading: 'serif', skillStyle: 'columns', personality: 'quiet' },
  { id: 'minimal-dense', name: 'Minimal Dense', category: 'minimal', description: 'Compact ATS-friendly layout for users with many details.', layout: 'single-column', density: 'compact', bestFor: ['technical', 'senior', 'academic'], accent: '#0f172a', heading: 'sans', skillStyle: 'inline', personality: 'technical' },
  { id: 'minimal-line', name: 'Minimal Line', category: 'minimal', description: 'Fine divider lines with a clean nameplate and balanced content rhythm.', layout: 'header-band', density: 'balanced', bestFor: ['product', 'finance', 'analysis'], accent: '#475569', heading: 'sans', skillStyle: 'columns', personality: 'quiet' },
  { id: 'minimal-focus', name: 'Minimal Focus', category: 'minimal', description: 'Headline-led structure that keeps the candidate identity prominent.', layout: 'split-header', density: 'balanced', bestFor: ['career-change', 'entry-level', 'freelance'], accent: '#1f2937', heading: 'serif', skillStyle: 'chips', personality: 'quiet' },
  { id: 'minimal-stack', name: 'Minimal Stack', category: 'minimal', description: 'Stacked sections with generous whitespace for easy scanning.', layout: 'single-column', density: 'airy', bestFor: ['marketing', 'admin', 'customer-success'], accent: '#374151', heading: 'sans', skillStyle: 'inline', personality: 'quiet' },
  { id: 'minimal-rulebook', name: 'Minimal Rulebook', category: 'minimal', description: 'Structured section rules and compact bullets for recruiters.', layout: 'single-column', density: 'compact', bestFor: ['legal', 'finance', 'operations'], accent: '#111827', heading: 'serif', skillStyle: 'columns', personality: 'formal' },
  { id: 'minimal-slate', name: 'Minimal Slate', category: 'minimal', description: 'Muted slate accent with strong typographic hierarchy.', layout: 'header-band', density: 'balanced', bestFor: ['business', 'project-management', 'sales'], accent: '#475569', heading: 'sans', skillStyle: 'chips', personality: 'quiet' },
  { id: 'minimal-paper', name: 'Minimal Paper', category: 'minimal', description: 'Classic printable resume with modern spacing and clean headings.', layout: 'single-column', density: 'balanced', bestFor: ['education', 'nonprofit', 'general'], accent: '#1e293b', heading: 'serif', skillStyle: 'inline', personality: 'formal' },
  { id: 'minimal-signal', name: 'Minimal Signal', category: 'minimal', description: 'Subtle accent markers guide attention without visual noise.', layout: 'modular-grid', density: 'balanced', bestFor: ['data', 'analytics', 'research'], accent: '#0f172a', heading: 'mono-accent', skillStyle: 'matrix', personality: 'technical' },
];

const modern: ResumeTemplate[] = [
  { id: 'modern-tech', name: 'Modern Tech', category: 'modern', description: 'Clean tech resume with a compact skills rail and strong project emphasis.', layout: 'sidebar', density: 'balanced', bestFor: ['software', 'ai', 'automation'], accent: '#2563eb', heading: 'sans', skillStyle: 'chips', personality: 'technical' },
  { id: 'modern-product', name: 'Modern Product', category: 'modern', description: 'Product-led structure with outcomes, scope and cross-functional work.', layout: 'two-column', density: 'balanced', bestFor: ['product', 'growth', 'strategy'], accent: '#7c3aed', heading: 'sans', skillStyle: 'columns', personality: 'bold' },
  { id: 'modern-grid', name: 'Modern Grid', category: 'modern', description: 'Card-like sections in a clean modular grid.', layout: 'modular-grid', density: 'balanced', bestFor: ['design', 'marketing', 'consulting'], accent: '#0891b2', heading: 'sans', skillStyle: 'chips', personality: 'bold' },
  { id: 'modern-data', name: 'Modern Data', category: 'modern', description: 'Technical hierarchy for analytics, ML, BI and data roles.', layout: 'timeline', density: 'compact', bestFor: ['data', 'machine-learning', 'analytics'], accent: '#0f766e', heading: 'mono-accent', skillStyle: 'matrix', personality: 'technical' },
  { id: 'modern-builder', name: 'Modern Builder', category: 'modern', description: 'Balanced layout for makers with projects, tools and shipped systems.', layout: 'split-header', density: 'balanced', bestFor: ['engineering', 'founder', 'freelance'], accent: '#ea580c', heading: 'sans', skillStyle: 'chips', personality: 'bold' },
  { id: 'modern-cloud', name: 'Modern Cloud', category: 'modern', description: 'Infrastructure-friendly resume with grouped technologies.', layout: 'sidebar', density: 'compact', bestFor: ['devops', 'cloud', 'security'], accent: '#0284c7', heading: 'mono-accent', skillStyle: 'matrix', personality: 'technical' },
  { id: 'modern-operator', name: 'Modern Operator', category: 'modern', description: 'Sharp operations resume for process, automation and delivery roles.', layout: 'two-column', density: 'balanced', bestFor: ['operations', 'automation', 'project-management'], accent: '#4f46e5', heading: 'sans', skillStyle: 'columns', personality: 'formal' },
  { id: 'modern-narrative', name: 'Modern Narrative', category: 'modern', description: 'A story-forward layout with a prominent professional summary.', layout: 'header-band', density: 'airy', bestFor: ['career-change', 'leadership', 'sales'], accent: '#be123c', heading: 'serif', skillStyle: 'chips', personality: 'editorial' },
  { id: 'modern-compact', name: 'Modern Compact', category: 'modern', description: 'One-page friendly layout for busy recruiters and ATS systems.', layout: 'single-column', density: 'compact', bestFor: ['early-career', 'software', 'business'], accent: '#2563eb', heading: 'sans', skillStyle: 'inline', personality: 'technical' },
  { id: 'modern-lab', name: 'Modern Lab', category: 'modern', description: 'Research and experimentation feel for AI, science and technical work.', layout: 'timeline', density: 'balanced', bestFor: ['ai', 'research', 'engineering'], accent: '#9333ea', heading: 'mono-accent', skillStyle: 'matrix', personality: 'technical' },
];

const professional: ResumeTemplate[] = [
  { id: 'professional-classic', name: 'Professional Classic', category: 'professional', description: 'Traditional recruiter-safe structure with refined spacing.', layout: 'single-column', density: 'balanced', bestFor: ['finance', 'admin', 'general'], accent: '#1d4ed8', heading: 'serif', skillStyle: 'inline', personality: 'formal' },
  { id: 'professional-corporate', name: 'Corporate Standard', category: 'professional', description: 'Conservative layout for enterprise roles and formal industries.', layout: 'header-band', density: 'balanced', bestFor: ['banking', 'consulting', 'enterprise'], accent: '#1e3a8a', heading: 'sans', skillStyle: 'columns', personality: 'formal' },
  { id: 'professional-grid', name: 'Professional Grid', category: 'professional', description: 'Two-column content balance with clear recruiter scan paths.', layout: 'two-column', density: 'balanced', bestFor: ['project-management', 'operations', 'product'], accent: '#0369a1', heading: 'sans', skillStyle: 'chips', personality: 'formal' },
  { id: 'professional-legal', name: 'Legal Brief', category: 'professional', description: 'Precise, formal and text-first for legal or compliance roles.', layout: 'single-column', density: 'compact', bestFor: ['legal', 'compliance', 'policy'], accent: '#334155', heading: 'serif', skillStyle: 'inline', personality: 'formal' },
  { id: 'professional-healthcare', name: 'Healthcare Pro', category: 'professional', description: 'Clear credential and experience hierarchy for care settings.', layout: 'sidebar', density: 'balanced', bestFor: ['healthcare', 'admin', 'operations'], accent: '#047857', heading: 'sans', skillStyle: 'columns', personality: 'formal' },
  { id: 'professional-academic', name: 'Academic Professional', category: 'professional', description: 'Education-forward layout with room for publications and projects.', layout: 'timeline', density: 'compact', bestFor: ['education', 'research', 'academic'], accent: '#6d28d9', heading: 'serif', skillStyle: 'inline', personality: 'editorial' },
  { id: 'professional-sales', name: 'Sales Professional', category: 'professional', description: 'Achievement-led hierarchy for commercial roles.', layout: 'split-header', density: 'balanced', bestFor: ['sales', 'account-management', 'growth'], accent: '#b45309', heading: 'sans', skillStyle: 'chips', personality: 'bold' },
  { id: 'professional-ops', name: 'Operations Pro', category: 'professional', description: 'Process and delivery oriented structure with compact detail sections.', layout: 'modular-grid', density: 'compact', bestFor: ['operations', 'logistics', 'support'], accent: '#0f766e', heading: 'sans', skillStyle: 'matrix', personality: 'formal' },
  { id: 'professional-public', name: 'Public Sector', category: 'professional', description: 'Formal, accessible and compliance-friendly layout.', layout: 'single-column', density: 'balanced', bestFor: ['government', 'nonprofit', 'education'], accent: '#374151', heading: 'serif', skillStyle: 'columns', personality: 'formal' },
  { id: 'professional-consultant', name: 'Consultant Brief', category: 'professional', description: 'High-level summary plus engagement-style experience sections.', layout: 'two-column', density: 'airy', bestFor: ['consulting', 'strategy', 'freelance'], accent: '#1d4ed8', heading: 'serif', skillStyle: 'chips', personality: 'editorial' },
];

const creative: ResumeTemplate[] = [
  { id: 'creative-studio', name: 'Studio Clean', category: 'creative', description: 'Portfolio-friendly layout with tasteful accent blocks.', layout: 'modular-grid', density: 'balanced', bestFor: ['design', 'content', 'brand'], accent: '#db2777', heading: 'sans', skillStyle: 'chips', personality: 'bold' },
  { id: 'creative-editorial', name: 'Editorial Profile', category: 'creative', description: 'Magazine-inspired heading rhythm while staying professional.', layout: 'split-header', density: 'airy', bestFor: ['writing', 'marketing', 'communications'], accent: '#c2410c', heading: 'serif', skillStyle: 'inline', personality: 'editorial' },
  { id: 'creative-portfolio', name: 'Portfolio Signal', category: 'creative', description: 'Projects and links get stronger placement without clutter.', layout: 'sidebar', density: 'balanced', bestFor: ['designer', 'developer', 'creator'], accent: '#7c3aed', heading: 'sans', skillStyle: 'chips', personality: 'bold' },
  { id: 'creative-maker', name: 'Maker Resume', category: 'creative', description: 'Project-first flow for builders, freelancers and creators.', layout: 'timeline', density: 'balanced', bestFor: ['freelance', 'engineering', 'creative-tech'], accent: '#ea580c', heading: 'mono-accent', skillStyle: 'matrix', personality: 'technical' },
  { id: 'creative-brand', name: 'Brand Profile', category: 'creative', description: 'A polished profile layout for marketing and content roles.', layout: 'header-band', density: 'balanced', bestFor: ['marketing', 'brand', 'social-media'], accent: '#e11d48', heading: 'serif', skillStyle: 'chips', personality: 'editorial' },
  { id: 'creative-clean-color', name: 'Clean Color', category: 'creative', description: 'Color-led but recruiter-safe with strong readability.', layout: 'two-column', density: 'balanced', bestFor: ['design', 'product', 'media'], accent: '#0891b2', heading: 'sans', skillStyle: 'columns', personality: 'bold' },
  { id: 'creative-showcase', name: 'Project Showcase', category: 'creative', description: 'Dedicated project blocks and compact career timeline.', layout: 'modular-grid', density: 'compact', bestFor: ['frontend', 'portfolio', 'creator'], accent: '#9333ea', heading: 'mono-accent', skillStyle: 'chips', personality: 'technical' },
  { id: 'creative-writer', name: 'Writer Profile', category: 'creative', description: 'Elegant typography for writing, communications and editorial roles.', layout: 'single-column', density: 'airy', bestFor: ['writer', 'communications', 'editorial'], accent: '#9f1239', heading: 'serif', skillStyle: 'inline', personality: 'editorial' },
  { id: 'creative-growth', name: 'Growth Story', category: 'creative', description: 'Campaign and experiment-friendly content arrangement.', layout: 'split-header', density: 'balanced', bestFor: ['growth', 'marketing', 'sales'], accent: '#16a34a', heading: 'sans', skillStyle: 'matrix', personality: 'bold' },
  { id: 'creative-minimal-pop', name: 'Minimal Pop', category: 'creative', description: 'Minimal foundation with one confident accent treatment.', layout: 'header-band', density: 'balanced', bestFor: ['general', 'creative', 'startup'], accent: '#2563eb', heading: 'sans', skillStyle: 'chips', personality: 'bold' },
];

const executive: ResumeTemplate[] = [
  { id: 'executive-minimal', name: 'Executive Minimal', category: 'executive', description: 'Senior leadership layout with authority and restraint.', layout: 'single-column', density: 'airy', bestFor: ['executive', 'director', 'leadership'], accent: '#0f172a', heading: 'serif', skillStyle: 'inline', personality: 'formal' },
  { id: 'executive-board', name: 'Board Profile', category: 'executive', description: 'High-level profile, board summary and selected achievements.', layout: 'split-header', density: 'airy', bestFor: ['board', 'c-suite', 'advisory'], accent: '#7f1d1d', heading: 'serif', skillStyle: 'columns', personality: 'formal' },
  { id: 'executive-operator', name: 'Executive Operator', category: 'executive', description: 'Leadership plus execution structure for scale-up operators.', layout: 'two-column', density: 'balanced', bestFor: ['operations', 'vp', 'chief-of-staff'], accent: '#1e40af', heading: 'sans', skillStyle: 'matrix', personality: 'formal' },
  { id: 'executive-technology', name: 'Technology Executive', category: 'executive', description: 'Architecture, leadership and strategic technical scope.', layout: 'sidebar', density: 'balanced', bestFor: ['cto', 'engineering-leader', 'ai-leader'], accent: '#2563eb', heading: 'mono-accent', skillStyle: 'matrix', personality: 'technical' },
  { id: 'executive-finance', name: 'Finance Executive', category: 'executive', description: 'Conservative format for finance and governance leadership.', layout: 'header-band', density: 'balanced', bestFor: ['finance', 'governance', 'banking'], accent: '#065f46', heading: 'serif', skillStyle: 'columns', personality: 'formal' },
  { id: 'executive-growth', name: 'Growth Executive', category: 'executive', description: 'Market, revenue and team narrative without overdesign.', layout: 'modular-grid', density: 'balanced', bestFor: ['growth', 'sales-leader', 'marketing-leader'], accent: '#b45309', heading: 'sans', skillStyle: 'chips', personality: 'bold' },
  { id: 'executive-narrative', name: 'Leadership Narrative', category: 'executive', description: 'Story-driven executive profile with selective detail density.', layout: 'single-column', density: 'airy', bestFor: ['general-manager', 'founder', 'consultant'], accent: '#581c87', heading: 'serif', skillStyle: 'inline', personality: 'editorial' },
  { id: 'executive-enterprise', name: 'Enterprise Leader', category: 'executive', description: 'Enterprise-safe structure for complex organizations.', layout: 'timeline', density: 'compact', bestFor: ['enterprise', 'program-leader', 'transformation'], accent: '#334155', heading: 'sans', skillStyle: 'columns', personality: 'formal' },
  { id: 'executive-advisor', name: 'Advisor Profile', category: 'executive', description: 'Concise advisory-style resume for consulting leaders.', layout: 'split-header', density: 'balanced', bestFor: ['advisor', 'consulting', 'fractional'], accent: '#0f766e', heading: 'serif', skillStyle: 'chips', personality: 'editorial' },
  { id: 'executive-command', name: 'Command Brief', category: 'executive', description: 'Dense, powerful summary for senior candidates with extensive history.', layout: 'header-band', density: 'compact', bestFor: ['senior', 'director', 'operations'], accent: '#111827', heading: 'sans', skillStyle: 'matrix', personality: 'formal' },
];

export const RESUME_TEMPLATES: ResumeTemplate[] = [...minimal, ...modern, ...professional, ...creative, ...executive];
export const TEMPLATE_CATEGORIES: ResumeTemplateCategory[] = ['minimal', 'modern', 'professional', 'creative', 'executive'];

export function getResumeTemplate(id?: string | null): ResumeTemplate {
  return RESUME_TEMPLATES.find((t) => t.id === id) ?? RESUME_TEMPLATES.find((t) => t.id === 'modern-tech') ?? RESUME_TEMPLATES[0];
}

export function recommendResumeTemplates(input: { role?: string | null; yearsExperience?: number | null; industry?: string | null; skills?: string[] | null }) {
  const haystack = [input.role, input.industry, ...(input.skills ?? [])].filter(Boolean).join(' ').toLowerCase();
  const years = Number(input.yearsExperience ?? 0);
  const preferredCategory: ResumeTemplateCategory = years >= 7
    ? 'executive'
    : /designer|creative|content|brand|writer|media/.test(haystack)
      ? 'creative'
      : /ai|software|engineer|developer|automation|data|cloud|security|python|api|llm/.test(haystack)
        ? 'modern'
        : /finance|legal|bank|consult|operation|project|manager/.test(haystack)
          ? 'professional'
          : 'minimal';

  const scored = RESUME_TEMPLATES.map((template) => {
    let score = template.category === preferredCategory ? 4 : 0;
    for (const term of template.bestFor) {
      if (haystack.includes(term.replace(/-/g, ' ')) || haystack.includes(term)) score += 2;
    }
    if (years >= 5 && template.density !== 'airy') score += 1;
    if (years <= 2 && template.density !== 'compact') score += 1;
    return { template, score };
  }).sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name));

  return scored.slice(0, 3).map((s) => s.template);
}
