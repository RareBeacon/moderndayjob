'use client';

/**
 * Public template gallery (Workstream C, C4).
 * Filterable grid of resume templates with layout, photo, and ATS badges.
 * Desktop 3-4 columns, mobile 1-2 with horizontal-scroll category filter.
 * All interactive targets are 44px+; badges carry text (no color-only state).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { ResumeTemplate, ResumeTemplateCategory } from '@/lib/resume-studio/templates';
import { templatePhotoSupport, templateAtsFriendly, templateColumns } from '@/lib/resume-studio/templates';
import { SAMPLE_PREVIEW_DRAFT } from '@/lib/resume-studio/sample';
import { ResumeDocumentPreview } from './ResumeDocumentPreview';
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

export function TemplateGallery({ templates }: { templates: ResumeTemplate[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const visible = useMemo(() => templates.filter((template) => matches(template, filter)), [templates, filter]);
  const counts = useMemo(() => ({
    ats: templates.filter((t) => templateAtsFriendly(t)).length,
    photo: templates.filter((t) => templatePhotoSupport(t) !== 'none').length,
  }), [templates]);
  const previewTemplate = templates.find((template) => template.id === previewId);

  useEffect(() => {
    if (!previewId) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewId(null);
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const targets = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [previewId]);

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
            <div className={styles.mini} aria-hidden="true">
              <ResumeDocumentPreview template={template} draft={SAMPLE_PREVIEW_DRAFT} size="mini" demo />
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
              <div className={styles.actions}>
                <button type="button" className={styles.previewBtn} onClick={() => setPreviewId(template.id)} aria-label={`Preview ${template.name} full size`}>Preview full size</button>
                <Link className={styles.useBtn} href={`/generate?template=${encodeURIComponent(template.id)}`}>Use this template</Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className={styles.note}>
        All sample CVs show the same fictional Alex Morgan profile. Sample details never become part of your draft.
      </p>
      {previewTemplate && typeof document !== 'undefined' && createPortal(
        <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewId(null); }}>
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="template-preview-title" ref={dialogRef}>
            <header className={styles.dialogHeader}>
              <div><p>Fictional sample CV</p><h2 id="template-preview-title">{previewTemplate.name}</h2></div>
              <button type="button" ref={closeRef} className={styles.closeBtn} onClick={() => setPreviewId(null)} aria-label="Close template preview">Close</button>
            </header>
            <p className={styles.dialogIntro}>{previewTemplate.description} This preview uses fictional Alex Morgan details. Your information stays in your own draft.</p>
            <div className={styles.dialogCanvas}>
              <ResumeDocumentPreview template={previewTemplate} draft={SAMPLE_PREVIEW_DRAFT} demo />
            </div>
            <div className={styles.dialogFooter}>
              <Link className={styles.useBtn} href={`/generate?template=${encodeURIComponent(previewTemplate.id)}`}>Use {previewTemplate.name}</Link>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
