import React, { type CSSProperties, type ReactNode } from 'react';
import type { StudioDraft } from '@/lib/resume-studio/draft';
import { templateColumns, templatePhotoSupport, type ResumeTemplate } from '@/lib/resume-studio/templates';
import styles from './ResumeDocumentPreview.module.css';

type Section = 'summary' | 'experience' | 'projects' | 'education' | 'skills' | 'certifications';

const layoutClass: Record<ResumeTemplate['layout'], string> = {
  'single-column': styles.singleColumn,
  'two-column': styles.twoColumn,
  sidebar: styles.sidebar,
  timeline: styles.timeline,
  'header-band': styles.headerBand,
  'split-header': styles.splitHeader,
  'modular-grid': styles.modularGrid,
};

/** Keep education and projects in the positions described by each design. */
function sectionOrder(template: ResumeTemplate): Section[] {
  const educationFirst = /academic|graduate|entry-level/.test(template.id);
  const projectsFirst = /project|portfolio|maker|software-engineer/.test(template.id);
  if (educationFirst) return ['summary', 'education', 'experience', 'projects', 'skills', 'certifications'];
  if (projectsFirst) return ['summary', 'projects', 'experience', 'skills', 'education', 'certifications'];
  return ['summary', 'experience', 'projects', 'skills', 'education', 'certifications'];
}

function SamplePortrait() {
  return (
    <svg className={styles.portrait} viewBox="0 0 72 88" role="img" aria-label="Fictional sample portrait">
      <rect width="72" height="88" fill="#dae5ec" />
      <path d="M4 88c2-24 14-34 32-34s30 10 32 34" fill="#425879" />
      <circle cx="36" cy="33" r="17" fill="#c99476" />
      <path d="M18 32c-2-17 7-25 19-25 14 0 20 10 17 26-3-3-6-9-7-13-8 8-17 10-29 12Z" fill="#303440" />
      <path d="M25 54l11 11 11-11" fill="#f8fafc" />
    </svg>
  );
}

function SectionContent({ section, draft, template }: { section: Section; draft: StudioDraft; template: ResumeTemplate }): ReactNode {
  if (section === 'summary') {
    return <section className={styles.summarySection} data-section="summary"><h3>Profile</h3><p>{draft.career.summary || 'Your professional summary will appear here as you build your CV.'}</p></section>;
  }
  if (section === 'experience') {
    return (
      <section className={styles.experienceSection} data-section="experience">
        <h3>Experience</h3>
        {draft.experiences.length ? draft.experiences.slice(0, 5).map((exp) => (
          <div key={exp.id} className={styles.entry}>
            <div className={styles.entryHead}>
              <strong>{exp.role || 'Role'}{exp.company ? <span> · {exp.company}</span> : null}</strong>
              <span>{[exp.startDate, exp.current ? 'Present' : exp.endDate].filter(Boolean).join(' - ')}</span>
            </div>
            {exp.location ? <small>{exp.location}</small> : null}
            <ul>{(exp.bullets.length ? exp.bullets : [exp.roughNotes || exp.impact || 'Add your achievements to this role.']).slice(0, 4).map((bullet, i) => <li key={`${exp.id}-${i}`}>{bullet}</li>)}</ul>
          </div>
        )) : <p>Add experience, internships or freelance work to see them here.</p>}
      </section>
    );
  }
  if (section === 'projects') {
    if (!draft.projects.length) return null;
    return (
      <section className={styles.projectsSection} data-section="projects">
        <h3>Selected projects</h3>
        {draft.projects.slice(0, 3).map((project) => (
          <div key={project.id} className={styles.entry}>
            <strong>{project.name}</strong>
            {project.description && <p>{project.description}</p>}
            {project.technologies.length > 0 && <small>{project.technologies.slice(0, 6).join(' / ')}</small>}
          </div>
        ))}
      </section>
    );
  }
  if (section === 'education') {
    if (!draft.education.length) return null;
    return (
      <section className={styles.educationSection} data-section="education">
        <h3>Education</h3>
        {draft.education.slice(0, 3).map((edu) => (
          <div key={edu.id} className={styles.entry}>
            <div className={styles.entryHead}><strong>{[edu.degree, edu.field].filter(Boolean).join(', ') || 'Degree'}</strong><span>{[edu.startDate, edu.endDate].filter(Boolean).join(' - ')}</span></div>
            <p>{edu.institution}</p>
            {edu.achievements && <small>{edu.achievements}</small>}
          </div>
        ))}
      </section>
    );
  }
  if (section === 'skills') {
    const skills = draft.skills.map((skill) => skill.name).filter(Boolean).slice(0, 18);
    if (!skills.length) return <section data-section="skills"><h3>Skills</h3><p>Add your skills to preview this section.</p></section>;
    const style = template.skillStyle;
    return (
      <section className={styles.skillsSection} data-section="skills" data-skill-style={style}>
        <h3>Skills</h3>
        {style === 'matrix' ? (
          <dl className={styles.skillMatrix}>
            {Array.from(new Set(draft.skills.map((skill) => skill.category || 'Core'))).slice(0, 5).map((category) => (
              <div key={category}><dt>{category}</dt><dd>{draft.skills.filter((skill) => (skill.category || 'Core') === category).map((skill) => skill.name).filter(Boolean).slice(0, 8).join(', ')}</dd></div>
            ))}
          </dl>
        ) : style === 'inline' ? (
          <p>{skills.join(' · ')}</p>
        ) : (
          <ul className={style === 'chips' ? styles.skillChips : style === 'bars' ? styles.skillBars : styles.skillColumns}>
            {skills.map((skill) => <li key={skill}>{skill}{style === 'bars' && <i aria-hidden="true" />}</li>)}
          </ul>
        )}
      </section>
    );
  }
  if (section === 'certifications') {
    if (!draft.certifications.length) return null;
    return <section className={styles.certificationsSection} data-section="certifications"><h3>Certifications</h3>{draft.certifications.slice(0, 3).map((cert) => <p key={cert.id}><strong>{cert.name}</strong>{cert.issuer ? ` · ${cert.issuer}` : ''}{cert.date ? ` · ${cert.date}` : ''}</p>)}</section>;
  }
  return null;
}

/** One renderer for gallery cards, large sample previews, and the user's live draft. */
export function ResumeDocumentPreview({ template, draft, size = 'full', demo = false }: {
  template: ResumeTemplate;
  draft: StudioDraft;
  size?: 'mini' | 'full';
  demo?: boolean;
}) {
  const hasRail = templateColumns(template) === 2;
  const order = sectionOrder(template);
  const primary = hasRail ? order.filter((section) => section !== 'skills' && section !== 'certifications' && section !== 'education') : order;
  const rail: Section[] = hasRail ? ['skills', 'education', 'certifications'] : [];
  const showPhoto = templatePhotoSupport(template) !== 'none' && (demo || Boolean(draft.personal.photoDataUrl));
  const classes = [
    styles.page, layoutClass[template.layout],
    template.density === 'compact' ? styles.compact : template.density === 'airy' ? styles.airy : styles.balanced,
    template.personality === 'bold' ? styles.bold : template.personality === 'editorial' ? styles.editorial : template.personality === 'technical' ? styles.technical : template.personality === 'formal' ? styles.formal : styles.quiet,
    template.heading === 'serif' ? styles.serif : template.heading === 'mono-accent' ? styles.monoAccent : styles.sans,
  ].join(' ');

  return (
    <div className={size === 'mini' ? styles.miniViewport : styles.fullViewport} data-preview-size={size}>
      <article className={classes} data-template-id={template.id} data-layout={template.layout} data-demo={demo ? 'true' : 'false'} style={{ '--resume-accent': template.accent } as CSSProperties}>
        <header className={styles.identity} data-photo={showPhoto ? 'true' : 'false'}>
          {showPhoto ? demo ? <SamplePortrait /> : (
            // The upload route and draft normalization only permit JPEG/PNG data URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.portrait} src={draft.personal.photoDataUrl} alt="Your resume photo" />
          ) : null}
          <div className={styles.nameBlock}>
            <h2>{draft.personal.name || 'Your Name'}</h2>
            <p className={styles.headline}>{draft.career.headline || draft.career.targetRole || 'Your professional headline'}</p>
          </div>
          <div className={styles.contactBlock}>
            {[draft.personal.email, draft.personal.phone, draft.personal.location, draft.personal.website].filter(Boolean).map((part) => <span key={part}>{part}</span>)}
          </div>
        </header>
        <div className={styles.content}>
          <div className={styles.main}>{primary.map((section) => <SectionContent key={section} section={section} draft={draft} template={template} />)}</div>
          {hasRail && <aside className={styles.rail}>{rail.map((section) => <SectionContent key={section} section={section} draft={draft} template={template} />)}</aside>}
        </div>
      </article>
    </div>
  );
}
