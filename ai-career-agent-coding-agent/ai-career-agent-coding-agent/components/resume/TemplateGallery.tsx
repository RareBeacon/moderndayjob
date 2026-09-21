'use client';

/**
 * Public template gallery (Workstream C, C4).
 * Filterable grid of resume templates with layout, photo, and ATS badges.
 * Desktop 3-4 columns, mobile 1-2 with horizontal-scroll category filter.
 * All interactive targets are 44px+; badges carry text (no color-only state).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ResumeTemplate, ResumeTemplateCategory } from '@/lib/resume-studio/templates';
import { templatePhotoSupport, templateAtsFriendly, templateColumns } from '@/lib/resume-studio/templates';
import styles from './TemplateGallery.module.css';

type Filter = 'all' | 'ats' | 'photo' | 'onepage' | 'twocolumn' | ResumeTemplateCategory;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ats', label: 'ATS-Friendly' },
  { id: 'photo', label: 'With Photo' },
  { id: 'onepage', label: 'One-Page' },
  { id: 'twocolumn', label: 'Two-Column' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'modern', label: 'Modern' },
  { id: 'professional', label: 'Professional' },
  { id: 'creative', label: 'Creative' },
  { id: 'executive', label: 'Executive' },
];

function matches(template: ResumeTemplate, filter: Filter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'ats': return templateAtsFriendly(template);
    case 'photo': return templatePhotoSupport(template) !== 'none';
    case 'onepage': return template.density === 'compact' || templateColumns(template) === 1;
    case 'twocolumn': return templateColumns(template) === 2;
    default: return template.category === filter;
  }
}

/** Fictional sample data shown on every card (C3: "Alex Morgan"). */
const SAMPLE = {
  name: 'Alex Morgan',
  headline: 'Operations Analyst',
  summary: 'Process improvement and reporting',
  sections: ['Experience', 'Education', 'Skills'],
};

export function TemplateGallery({ templates }: { templates: ResumeTemplate[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const visible = useMemo(() => templates.filter((template) => matches(template, filter)), [templates, filter]);
  const counts = useMemo(() => ({
    ats: templates.filter((t) => templateAtsFriendly(t)).length,
    photo: templates.filter((t) => templatePhotoSupport(t) !== 'none').length,
  }), [templates]);

  return (
    <div>
      <div className={styles.filterBar} role="group" aria-label="Template filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            className={`${styles.filterBtn} ${filter === item.id ? styles.filterActive : ''}`}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
            {item.id === 'ats' && ` (${counts.ats})`}
            {item.id === 'photo' && ` (${counts.photo})`}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className={styles.empty}>No templates match this filter yet. Try another filter.</p>}

      <div className={styles.grid}>
        {visible.map((template) => (
          <article key={template.id} className={styles.card} style={{ '--accent': template.accent } as React.CSSProperties}>
            <div className={styles.mini} data-layout={template.layout} aria-hidden="true">
              {templatePhotoSupport(template) !== 'none' && <span className={styles.miniPhoto} />}
              <div className={styles.miniDoc}>
                <span className={styles.miniName}>{SAMPLE.name}</span>
                <span className={styles.miniHeadline}>{SAMPLE.headline}</span>
                <span className={styles.miniLine} />
                <span className={styles.miniLine} />
                <span className={styles.miniLineShort} />
                <span className={styles.miniLine} />
                <span className={styles.miniLineShort} />
              </div>
            </div>
            <div className={styles.cardBody}>
              <h3 className={styles.cardTitle}>{template.name}</h3>
              <p className={styles.cardDesc}>{template.description}</p>
              <p className={styles.cardFor}>Suitable for: {template.bestFor.slice(0, 3).join(', ')}</p>
              <div className={styles.badges}>
                <span className={styles.badge}>{templateColumns(template) === 2 ? '2-Column' : '1-Column'}</span>
                <span className={styles.badge}>
                  {templatePhotoSupport(template) === 'required' ? 'Photo Required' : templatePhotoSupport(template) === 'optional' ? 'Photo Optional' : 'No Photo'}
                </span>
                {templateAtsFriendly(template) && <span className={styles.badgeAts}>ATS-Friendly</span>}
              </div>
              <Link className={styles.useBtn} href={`/generate?template=${template.id}`}>Use this template</Link>
            </div>
          </article>
        ))}
      </div>
      <p className={styles.note}>
        Previews use fictional sample data (Alex Morgan). Your own resume uses your real, verified information in the Resume Studio.
      </p>
    </div>
  );
}
