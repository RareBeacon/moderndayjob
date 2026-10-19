import React, { type CSSProperties, type ReactNode } from 'react';
import type { StudioDraft } from '@/lib/resume-studio/draft';
import type { DribbbleTemplate } from '@/lib/resume-studio/dribbble30';
import { templatePhotoSupport } from '@/lib/resume-studio/templates';
import styles from './DribbbleResume.module.css';

type Section = 'summary' | 'experience' | 'projects' | 'education' | 'skills' | 'certifications' | 'contact';

function sectionOrder(template: DribbbleTemplate): Section[] {
  // Templates with specific narrative priorities:
  if (template.id.includes('ats-blue') || template.id.includes('rust-gray')) return ['summary', 'experience', 'education', 'projects', 'skills', 'certifications'];
  if (template.id.includes('taupe') || template.id.includes('notch')) return ['summary', 'education', 'experience', 'skills', 'projects', 'certifications'];
  return ['summary', 'experience', 'projects', 'skills', 'education', 'certifications'];
}

function SamplePortrait({ round, notch }: { round?: boolean; notch?: boolean }) {
  const cls = `${styles.portrait} ${round ? styles.portraitRound : ''} ${notch ? styles.portraitNotch : ''}`.trim();
  return (
    <svg className={cls} viewBox="0 0 72 88" role="img" aria-label="Fictional sample portrait">
      <rect width="72" height="88" fill="#dae5ec" rx={round ? 36 : 6} />
      <path d="M4 88c2-24 14-34 32-34s30 10 32 34" fill="#425879" />
      <circle cx="36" cy="33" r="17" fill="#c99476" />
      <path d="M18 32c-2-17 7-25 19-25 14 0 20 10 17 26-3-3-6-9-7-13-8 8-17 10-29 12Z" fill="#303440" />
      <path d="M25 54l11 11 11-11" fill="#f8fafc" />
    </svg>
  );
}

function SectionContent({ section, draft, template }: { section: Section; draft: StudioDraft; template: DribbbleTemplate }): ReactNode {
  if (section === 'contact') {
    const contact = [draft.personal.email, draft.personal.phone, draft.personal.location].filter(Boolean);
    if (!contact.length) return null;
    return (
      <section className={styles.section} data-section="contact">
        <h3>Contact</h3>
        <div className={styles.chips} style={{ gap: 6 }}>
          {contact.map((c) => (
            <span key={c} style={{ fontSize: 10, color: 'var(--muted)' }}>{c}</span>
          ))}
        </div>
      </section>
    );
  }
  if (section === 'summary') {
    return (
      <section className={styles.section} data-section="summary">
        <h3>Profile</h3>
        <p>{draft.career.summary || 'Your professional summary will appear here as you build your CV.'}</p>
      </section>
    );
  }
  if (section === 'experience') {
    return (
      <section className={styles.section} data-section="experience">
        <h3>Experience</h3>
        {draft.experiences.length ? (
          draft.experiences.slice(0, 4).map((exp) => (
            <div key={exp.id} className={styles.entry}>
              <div className={styles.entryHead}>
                <strong>{exp.role || 'Role'}{exp.company ? ` · ${exp.company}` : ''}</strong>
                <span className={styles.date}>{[exp.startDate, exp.current ? 'Present' : exp.endDate].filter(Boolean).join(' – ')}</span>
              </div>
              {exp.location ? <small style={{ color: 'var(--muted)' }}>{exp.location}</small> : null}
              <ul>{(exp.bullets.length ? exp.bullets : [exp.roughNotes || exp.impact || 'Add achievements.']).slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          ))
        ) : (
          <p>Add experience to see it here.</p>
        )}
      </section>
    );
  }
  if (section === 'projects') {
    if (!draft.projects.length) return null;
    return (
      <section className={styles.section} data-section="projects">
        <h3>Projects</h3>
        {draft.projects.slice(0, 2).map((p) => (
          <div key={p.id} className={styles.entry}>
            <strong>{p.name}</strong>
            {p.description && <p>{p.description}</p>}
            {!!p.technologies.length && <small style={{ color: 'var(--muted)' }}>{p.technologies.slice(0, 6).join(' / ')}</small>}
          </div>
        ))}
      </section>
    );
  }
  if (section === 'education') {
    if (!draft.education.length) return null;
    return (
      <section className={styles.section} data-section="education">
        <h3>Education</h3>
        {draft.education.slice(0, 2).map((edu) => (
          <div key={edu.id} className={styles.entry}>
            <div className={styles.entryHead}>
              <strong>{[edu.degree, edu.field].filter(Boolean).join(', ') || 'Degree'}</strong>
              <span className={styles.date}>{[edu.startDate, edu.endDate].filter(Boolean).join(' – ')}</span>
            </div>
            <p>{edu.institution}</p>
            {edu.achievements && <small>{edu.achievements}</small>}
          </div>
        ))}
      </section>
    );
  }
  if (section === 'skills') {
    const names = draft.skills.map((s) => s.name).filter(Boolean).slice(0, 12);
    if (!names.length) return (
      <section className={styles.section} data-section="skills"><h3>Skills</h3><p>Add skills to preview.</p></section>
    );
    const style = template.skillStyle;
    if (style === 'bars') {
      return (
        <section className={styles.section} data-section="skills">
          <h3>Skills</h3>
          <ul className={styles.bars}>
            {names.slice(0, 6).map((n) => (
              <li key={n}><span>{n}</span><i style={{ width: `${60 + (n.length % 5) * 8}%` }} aria-hidden /></li>
            ))}
          </ul>
        </section>
      );
    }
    if (style === 'columns') {
      return (
        <section className={styles.section} data-section="skills">
          <h3>Skills</h3>
          <ul className={styles.columns}>{names.map((n) => <li key={n}>• {n}</li>)}</ul>
        </section>
      );
    }
    return (
      <section className={styles.section} data-section="skills">
        <h3>Skills</h3>
        <ul className={styles.chips}>{names.map((n) => <li key={n}>{n}</li>)}</ul>
      </section>
    );
  }
  if (section === 'certifications') {
    if (!draft.certifications.length) return null;
    return (
      <section className={styles.section} data-section="certifications">
        <h3>Certifications</h3>
        {draft.certifications.slice(0, 2).map((c) => (
          <p key={c.id}><strong>{c.name}</strong>{c.issuer ? ` · ${c.issuer}` : ''}</p>
        ))}
      </section>
    );
  }
  return null;
}

export function DribbbleResume({ template, draft, size = 'full', demo = false }: {
  template: DribbbleTemplate;
  draft: StudioDraft;
  size?: 'mini' | 'full';
  demo?: boolean;
}) {
  const order = sectionOrder(template);
  const showPhoto = templatePhotoSupport(template as unknown as import('@/lib/resume-studio/templates').ResumeTemplate) !== 'none' && (demo || Boolean(draft.personal.photoDataUrl));
  const palette = template.palette as Record<string, string>;
  const styleVars = {
    '--bg': palette.pageBg,
    '--card': palette.cardBg,
    '--ink': palette.ink,
    '--muted': palette.muted,
    '--accent': palette.accent,
    '--accent2': palette.accent2 ?? palette.accent,
    '--headerBg': palette.headerBg ?? palette.pageBg,
    '--sidebarBg': palette.sidebarBg ?? palette.cardBg,
    '--sidebarInk': palette.sidebarInk ?? palette.ink,
    '--rule': palette.rule ?? palette.muted,
    '--hl': palette.highlight ?? palette.accent2 ?? '#fef08a',
  } as CSSProperties;

  const headerClass = template.header === 'band' ? styles.headerBand : template.header === 'dark-band' ? styles.darkBand : template.header === 'split' ? styles.splitHeader : template.header === 'diagonal' ? styles.diagonal : template.header === 'torn' ? styles.torn : styles.header;
  const contentClass = template.columns === 2 && template.sidebar === 'left' ? styles.sidebarLeft : template.columns === 2 && template.sidebar === 'right' ? styles.sidebarRight : template.columns === 2 ? styles.twoCol : styles.single;
  const isRail = template.columns === 2;
  const mainSections: Section[] = isRail ? order.filter((s) => s !== 'skills' && s !== 'education' && s !== 'certifications') : order;
  const railSections: Section[] = isRail ? order.filter((s) => s === 'skills' || s === 'education' || s === 'certifications') : [];

  return (
    <div className={size === 'mini' ? 'miniViewport' : 'fullViewport'} data-preview-size={size} style={{ width: '100%' }}>
      <article className={styles.page} data-template-id={template.id} data-layout={template.layout} data-demo={demo ? 'true' : 'false'} style={styleVars}>
        <header className={`${styles.header} ${headerClass}`}>
          <div style={{ display: 'grid', gridTemplateColumns: showPhoto ? 'auto 1fr' : '1fr', gap: 12, alignItems: 'center', minWidth: 0 }}>
            {showPhoto ? (
              demo ? <SamplePortrait round={template.id.includes('blush') || template.id.includes('mint') || template.id.includes('ink-sidebar')} notch={template.decor === 'notch'} /> : (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={template.decor === 'notch' ? `${styles.portrait} ${styles.portraitNotch}` : styles.portrait} src={draft.personal.photoDataUrl} alt="Your resume photo" />
              )
            ) : null}
            <div style={{ minWidth: 0 }}>
              <h2 className={template.heading === 'serif' ? styles.nameSerif : styles.name}>{draft.personal.name || 'Your Name'}</h2>
              <p className={styles.headline}>{draft.career.headline || draft.career.targetRole || 'Your professional headline'}</p>
              <div className={styles.contact}>
                {[draft.personal.email, draft.personal.phone, draft.personal.location, draft.personal.website].filter(Boolean).map((p) => <span key={p}>{p}</span>)}
              </div>
            </div>
          </div>
          {template.decor === 'disc' && <span className={styles.discDecor} aria-hidden />}
          {template.decor === 'notch' && <span className={styles.notchDecor} aria-hidden />}
          {template.decor === 'arrow' && <span className={styles.arrowDecor} aria-hidden>→</span>}
        </header>
        <div className={`${styles.content} ${contentClass}`}>
          <div className={styles.main}>
            {mainSections.map((s) => <SectionContent key={s} section={s} draft={draft} template={template} />)}
          </div>
          {isRail && (
            <aside className={styles.rail}>
              {railSections.map((s) => <SectionContent key={s} section={s} draft={draft} template={template} />)}
            </aside>
          )}
        </div>
      </article>
    </div>
  );
}
