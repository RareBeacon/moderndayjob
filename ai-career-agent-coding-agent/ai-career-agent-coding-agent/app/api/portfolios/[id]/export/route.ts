import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit, requestIp } from '@/lib/rate-limit';
import { renderPdf, type ExportSection } from '@/lib/documents/export';
import { escapeHtml, sanitizePortfolioData, type PortfolioData } from '@/lib/portfolios';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolios/[id]/export?format=pdf|html (owner only).
 *
 * PDF reuses the document export renderer. The HTML export is a standalone,
 * fully escaped document: every piece of user content passes through
 * escapeHtml, so stored text can never execute in the browser (belt and
 * braces on top of the storage-time sanitizer and React auto-escaping).
 */

function sectionsFor(data: PortfolioData, title: string): ExportSection[] {
  const sections: ExportSection[] = [];
  if (data.headline) sections.push({ heading: 'Headline', lines: [data.headline] });
  if (data.about) sections.push({ heading: 'About', lines: [data.about] });
  if (data.skills.length) sections.push({ heading: 'Skills', lines: [data.skills.join(', ')] });
  if (data.experience.length) {
    sections.push({
      heading: 'Experience',
      lines: data.experience.flatMap((e) => [
        `${e.role} - ${e.company}${e.period ? ` (${e.period})` : ''}`,
        ...e.highlights.map((h) => `- ${h}`),
      ]),
    });
  }
  if (data.projects.length) {
    sections.push({
      heading: 'Projects',
      lines: data.projects.flatMap((p) => [
        `${p.name}${p.url ? ` - ${p.url}` : ''}`,
        ...(p.description ? [p.description] : []),
        ...(p.technologies.length ? [`Built with: ${p.technologies.join(', ')}`] : []),
      ]),
    });
  }
  if (data.education.length) {
    sections.push({
      heading: 'Education',
      lines: data.education.map((e) => `${e.qualification} - ${e.institution}${e.period ? ` (${e.period})` : ''}`),
    });
  }
  const links = [data.links.website, data.links.linkedin, data.links.github].filter(Boolean);
  if (links.length) sections.push({ heading: 'Links', lines: links as string[] });
  return sections.length ? sections : [{ heading: title, lines: ['This portfolio is still empty.'] }];
}

function standaloneHtml(title: string, data: PortfolioData): string {
  const esc = escapeHtml;
  const exp = data.experience
    .map(
      (e) => `<article><h3>${esc(e.role)} - ${esc(e.company)}${e.period ? ` <small>(${esc(e.period)})</small>` : ''}</h3><ul>${e.highlights
        .map((h) => `<li>${esc(h)}</li>`)
        .join('')}</ul></article>`,
    )
    .join('');
  const projects = data.projects
    .map(
      (p) =>
        `<article><h3>${esc(p.name)}${p.url ? ` <small><a href="${esc(p.url)}" rel="noopener">${esc(p.url)}</a></small>` : ''}</h3><p>${esc(p.description)}</p>${p.technologies.length ? `<p><small>${esc(p.technologies.join(', '))}</small></p>` : ''}</article>`,
    )
    .join('');
  const education = data.education
    .map((e) => `<li>${esc(e.qualification)} - ${esc(e.institution)}${e.period ? ` (${esc(e.period)})` : ''}</li>`)
    .join('');
  const links = [data.links.website, data.links.linkedin, data.links.github]
    .filter((l): l is string => Boolean(l))
    .map((l) => `<li><a href="${esc(l)}" rel="noopener">${esc(l)}</a></li>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 20px;color:#111}h1{margin-bottom:4px}h2{border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:32px}small{color:#666}a{color:#0366d6}</style></head><body>
<h1>${esc(title)}</h1>
${data.headline ? `<p><strong>${esc(data.headline)}</strong></p>` : ''}
${data.about ? `<p>${esc(data.about)}</p>` : ''}
${data.skills.length ? `<h2>Skills</h2><p>${esc(data.skills.join(', '))}</p>` : ''}
${exp ? `<h2>Experience</h2>${exp}` : ''}
${projects ? `<h2>Projects</h2>${projects}` : ''}
${education ? `<h2>Education</h2><ul>${education}</ul>` : ''}
${links ? `<h2>Links</h2><ul>${links}</ul>` : ''}
</body></html>`;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = await enforceRateLimit(`portfolios:export:${requestIp(req)}`, 20, '1 h');
  if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const user = await requireUser({ req }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { id } = await params;
  const format = new URL(req.url).searchParams.get('format') ?? 'pdf';
  if (format !== 'pdf' && format !== 'html') return NextResponse.json({ error: 'INVALID_FORMAT' }, { status: 400 });

  const { data: row } = await supabaseAdmin
    .from('portfolios')
    .select('title, data')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const data = sanitizePortfolioData(row.data);
  const title = String(row.title ?? 'Portfolio');

  if (format === 'html') {
    return new NextResponse(standaloneHtml(title, data), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': `attachment; filename="portfolio.html"`,
      },
    });
  }

  const pdf = await renderPdf(title, sectionsFor(data, title));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="portfolio.pdf"`,
    },
  });
}
