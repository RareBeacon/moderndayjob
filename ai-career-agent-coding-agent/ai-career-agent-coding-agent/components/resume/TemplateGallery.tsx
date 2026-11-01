'use client';

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ResumeDocumentPreview } from '@/components/resume/ResumeDocumentPreview';
import type { DocumentMode } from '@/lib/resume-studio/draft';
import { SAMPLE_PREVIEW_DRAFT } from '@/lib/resume-studio/sample';
import { savePendingTemplateSelection } from '@/lib/resume-studio/selection';
import {
  LIBRARY_FILTER_CATEGORIES,
  RESUME_TEMPLATES,
  TEMPLATE_GROUPS,
  resolveTemplateSpec,
  type LibraryFilterCategory,
  type ResumeTemplate,
  type TemplateGroupCode,
} from '@/lib/resume-studio/templates';
import styles from './TemplateGallery.module.css';

const PAGE_STEP = 8;

type SelectedCategory = 'All Templates' | LibraryFilterCategory;
type ColumnFilter = 'all' | '1' | '2';
type AtsFilter = 'all' | 'verified' | 'partial';
type GroupFilter = 'all' | TemplateGroupCode;

function matchesSearch(template: ResumeTemplate, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const spec = resolveTemplateSpec(template);
  const searchable = [
    spec.code,
    template.id,
    template.name,
    template.description,
    spec.intendedUse,
    spec.groupName,
    template.layout,
    ...(spec.libraryCategories ?? []),
    ...(template.bestFor ?? []),
    ...(spec.industries ?? []),
  ]
    .join(' ')
    .toLowerCase();

  return q.split(/\s+/).every((term) => searchable.includes(term));
}

export function TemplateGallery({ templates: propTemplates }: { templates?: ResumeTemplate[] } = {}) {
  const sourceTemplates = propTemplates ?? RESUME_TEMPLATES;
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SelectedCategory>('All Templates');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [columnFilter, setColumnFilter] = useState<ColumnFilter>('all');
  const [atsFilter, setAtsFilter] = useState<AtsFilter>('all');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_STEP);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [modalDocMode, setModalDocMode] = useState<DocumentMode>('resume');

  const modalPreviewDraft = useMemo(
    () =>
      modalDocMode === 'cv'
        ? { ...SAMPLE_PREVIEW_DRAFT, documentMode: 'cv' as const }
        : SAMPLE_PREVIEW_DRAFT,
    [modalDocMode],
  );

  const isFiltered =
    searchQuery.trim().length > 0 ||
    activeCategory !== 'All Templates' ||
    groupFilter !== 'all' ||
    columnFilter !== 'all' ||
    atsFilter !== 'all';

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Templates': sourceTemplates.length };
    for (const cat of LIBRARY_FILTER_CATEGORIES) {
      counts[cat] = sourceTemplates.filter((t) => t.libraryCategories?.includes(cat)).length;
    }
    return counts;
  }, [sourceTemplates]);

  const filteredTemplates = useMemo(() => {
    return sourceTemplates.filter((t) => {
      if (activeCategory !== 'All Templates' && !t.libraryCategories?.includes(activeCategory)) {
        return false;
      }
      if (groupFilter !== 'all' && t.group !== groupFilter) {
        return false;
      }
      if (columnFilter !== 'all' && String(t.columns ?? 1) !== columnFilter) {
        return false;
      }
      if (atsFilter === 'verified' && t.atsCompatibility !== 'verified') {
        return false;
      }
      if (atsFilter === 'partial' && t.atsCompatibility !== 'partial') {
        return false;
      }
      return matchesSearch(t, searchQuery);
    });
  }, [sourceTemplates, activeCategory, groupFilter, columnFilter, atsFilter, searchQuery]);

  const displayedTemplates = useMemo(() => {
    if (isFiltered) return filteredTemplates;
    return filteredTemplates.slice(0, visibleCount);
  }, [filteredTemplates, isFiltered, visibleCount]);

  const previewIndex = useMemo(
    () => (previewId ? filteredTemplates.findIndex((t) => t.id === previewId) : -1),
    [filteredTemplates, previewId],
  );

  const activePreviewTemplate = useMemo(() => {
    if (!previewId) return null;
    return sourceTemplates.find((t) => t.id === previewId) ?? null;
  }, [previewId, sourceTemplates]);

  useEffect(() => {
    if (!previewId) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewId(null);
      } else if (e.key === 'ArrowRight' && filteredTemplates.length > 1 && previewIndex >= 0) {
        const next = filteredTemplates[(previewIndex + 1) % filteredTemplates.length];
        if (next) setPreviewId(next.id);
      } else if (e.key === 'ArrowLeft' && filteredTemplates.length > 1 && previewIndex >= 0) {
        const prev = filteredTemplates[(previewIndex - 1 + filteredTemplates.length) % filteredTemplates.length];
        if (prev) setPreviewId(prev.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [previewId, filteredTemplates, previewIndex]);

  const openPreview = useCallback((templateId: string) => {
    setZoom(1);
    setModalDocMode('resume');
    setPreviewId(templateId);
  }, []);

  const resetAllFilters = () => {
    setSearchQuery('');
    setActiveCategory('All Templates');
    setGroupFilter('all');
    setColumnFilter('all');
    setAtsFilter('all');
    setVisibleCount(PAGE_STEP);
  };

  return (
    <section className={styles.librarySection} aria-label="Resume template library">
      {/* Search & Multi-Faceted Filter Bar */}
      <div className={styles.controlPanel}>
        <div className={styles.searchRow}>
          <div className={styles.searchInputWrap}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={styles.searchIcon}
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by role, industry, style, or template name (e.g. Software Engineer, Executive, Academic, Finance)..."
              aria-label="Search resume templates"
              className={styles.searchInput}
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.clearSearchBtn}
                onClick={() => setSearchQuery('')}
              >
                Clear
              </button>
            )}
          </div>

          <div className={styles.facetsInline}>
            <select
              aria-label="Filter by career group"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value as GroupFilter)}
              className={styles.facetSelect}
            >
              <option value="all">All 6 Career Groups</option>
              {(Object.keys(TEMPLATE_GROUPS) as TemplateGroupCode[]).map((code) => (
                <option key={code} value={code}>
                  Group {code}: {TEMPLATE_GROUPS[code].name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by column layout"
              value={columnFilter}
              onChange={(e) => setColumnFilter(e.target.value as ColumnFilter)}
              className={styles.facetSelect}
            >
              <option value="all">All Layouts (1 &amp; 2 Col)</option>
              <option value="1">Single-Column (21)</option>
              <option value="2">Two-Column (9)</option>
            </select>

            <select
              aria-label="Filter by ATS compatibility"
              value={atsFilter}
              onChange={(e) => setAtsFilter(e.target.value as AtsFilter)}
              className={styles.facetSelect}
            >
              <option value="all">All ATS Modes</option>
              <option value="verified">ATS-Verified Only (21)</option>
              <option value="partial">2-Col Visual / Direct (9)</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className={styles.categoryTabs} role="toolbar" aria-label="Template categories">
          {(['All Templates', ...LIBRARY_FILTER_CATEGORIES] as SelectedCategory[]).map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveCategory(cat)}
                className={`${styles.catTab} ${active ? styles.catTabActive : ''}`}
              >
                <span>{cat}</span>
                <span className={styles.catCount}>{categoryCounts[cat] ?? 0}</span>
              </button>
            );
          })}
        </div>

        {/* Live Result Summary */}
        <div className={styles.statusRow} aria-live="polite">
          <span className={styles.statusSummary}>
            Showing <strong>{displayedTemplates.length}</strong> of{' '}
            <strong>{filteredTemplates.length}</strong> matching templates
            {filteredTemplates.length !== RESUME_TEMPLATES.length
              ? ` (${RESUME_TEMPLATES.length} total in library)`
              : ''}
          </span>
          {isFiltered && (
            <button type="button" className={styles.resetFiltersBtn} onClick={resetAllFilters}>
              Reset all filters
            </button>
          )}
        </div>
      </div>

      {/* Empty Search / Filter State */}
      {filteredTemplates.length === 0 ? (
        <div className={styles.emptyFilterState}>
          <h3>No templates match those exact filters</h3>
          <p>
            Try clearing a filter or searching by a broader discipline such as Engineering, Executive, Finance, Design, or Academic.
          </p>
          <button type="button" className={styles.moreBtn} onClick={resetAllFilters}>
            Show all 30 templates
          </button>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {displayedTemplates.map((template) => (
              <GalleryCard
                key={template.id}
                template={template}
                onOpenPreview={openPreview}
              />
            ))}
          </div>

          {!isFiltered && visibleCount < filteredTemplates.length && (
            <div className={styles.paginationWrap}>
              <button
                type="button"
                className={styles.moreBtn}
                onClick={() =>
                  setVisibleCount((current) => Math.min(filteredTemplates.length, current + PAGE_STEP))
                }
              >
                Show {PAGE_STEP} more
              </button>
              {filteredTemplates.length - visibleCount > PAGE_STEP && (
                <button
                  type="button"
                  className={styles.showAllBtn}
                  onClick={() => setVisibleCount(filteredTemplates.length)}
                >
                  View all {filteredTemplates.length} templates
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Full-Size Zoomable Multi-Page A4 Preview Modal */}
      {activePreviewTemplate && (() => {
        const spec = resolveTemplateSpec(activePreviewTemplate);
        const verifiedAts = spec.atsCompatibility === 'verified';

        return (
          <div
            className={styles.modalBackdrop}
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-preview-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPreviewId(null);
            }}
          >
            <div className={styles.modalDialog}>
              <div className={styles.modalTopBar}>
                <div className={styles.modalTitleBlock}>
                  <span className={styles.modalCodeBadge}>#{spec.code}</span>
                  <div>
                    <h2 id="template-preview-title" className={styles.modalTitle}>
                      {activePreviewTemplate.name}
                    </h2>
                    <div className={styles.modalSub}>
                      Group {spec.group}: {spec.groupName} &middot; ISO A4 (210 &times; 297 mm)
                    </div>
                  </div>
                </div>

                <div className={styles.modalToolbar}>
                  <div className={styles.zoomGroup} role="group" aria-label="Document format mode">
                    {([
                      { label: 'Resume', value: 'resume' as const },
                      { label: 'CV', value: 'cv' as const },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setModalDocMode(opt.value)}
                        className={`${styles.zoomBtn} ${modalDocMode === opt.value ? styles.zoomBtnActive : ''}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.zoomGroup} role="group" aria-label="Preview zoom">
                    {[
                      { label: '75%', value: 0.75 },
                      { label: '100%', value: 1 },
                      { label: '125%', value: 1.2 },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setZoom(opt.value)}
                        className={`${styles.zoomBtn} ${zoom === opt.value ? styles.zoomBtnActive : ''}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {filteredTemplates.length > 1 && previewIndex >= 0 && (
                    <>
                      <button
                        type="button"
                        className={styles.navArrowBtn}
                        onClick={() => {
                          const prev =
                            filteredTemplates[
                              (previewIndex - 1 + filteredTemplates.length) % filteredTemplates.length
                            ];
                          if (prev) setPreviewId(prev.id);
                        }}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        className={styles.navArrowBtn}
                        onClick={() => {
                          const next = filteredTemplates[(previewIndex + 1) % filteredTemplates.length];
                          if (next) setPreviewId(next.id);
                        }}
                      >
                        Next
                      </button>
                    </>
                  )}

                  <a
                    className={styles.modalUseCta}
                    href={`/generate?template=${encodeURIComponent(activePreviewTemplate.id)}${modalDocMode === 'cv' ? '&docType=cv' : ''}`}
                    onClick={() => savePendingTemplateSelection(activePreviewTemplate.id, modalDocMode)}
                  >
                    {modalDocMode === 'cv' ? 'Build CV With Template' : 'Use This Template'}
                  </a>
                  <a
                    className={styles.modalSecondaryCta}
                    href={`/generate?template=${encodeURIComponent(activePreviewTemplate.id)}&docType=${modalDocMode === 'cv' ? 'resume' : 'cv'}`}
                    onClick={() =>
                      savePendingTemplateSelection(
                        activePreviewTemplate.id,
                        modalDocMode === 'cv' ? 'resume' : 'cv',
                      )
                    }
                  >
                    {modalDocMode === 'cv' ? 'Or Build Resume' : 'Or Build CV'}
                  </a>

                  <button
                    type="button"
                    className={styles.modalCloseBtn}
                    onClick={() => setPreviewId(null)}
                    aria-label="Close template preview"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.modalCanvasScroll}>
                  <ResumeDocumentPreview
                    draft={modalPreviewDraft}
                    template={activePreviewTemplate}
                    size="full"
                    isDemo
                    zoom={zoom}
                  />
                </div>

                <aside className={styles.modalSidebar}>
                  <div className={styles.inspectorCard}>
                    <h3 className={styles.inspectorHeading}>ATS &amp; Parser Classification</h3>
                    <div style={{ marginBottom: '8px' }}>
                      <span className={verifiedAts ? styles.atsBadgeVerified : styles.atsBadgePartial}>
                        {verifiedAts
                          ? 'ATS-Verified (Single-Column)'
                          : 'Two-Column (Direct / Modern ATS)'}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#41506b', lineHeight: 1.5 }}>
                      {spec.atsNotes}
                    </p>
                  </div>

                  <div className={styles.inspectorCard}>
                    <h3 className={styles.inspectorHeading}>Template Architecture</h3>
                    <div className={styles.inspectorSpecRow}>
                      <span className={styles.inspectorSpecKey}>Paper Standard</span>
                      <span className={styles.inspectorSpecVal}>ISO A4 (210 &times; 297 mm)</span>
                    </div>
                    <div className={styles.inspectorSpecRow}>
                      <span className={styles.inspectorSpecKey}>Column Grid</span>
                      <span className={styles.inspectorSpecVal}>
                        {spec.columns === 1 ? 'Single-Column' : 'Asymmetric 2-Column'}
                      </span>
                    </div>
                    <div className={styles.inspectorSpecRow}>
                      <span className={styles.inspectorSpecKey}>Typography</span>
                      <span className={styles.inspectorSpecVal}>
                        {spec.blueprint.headingFont === 'serif'
                          ? 'Editorial Serif'
                          : spec.blueprint.headingFont === 'mono'
                            ? 'Technical Mono + Sans'
                            : 'Geometric Sans'}
                      </span>
                    </div>
                    <div className={styles.inspectorSpecRow}>
                      <span className={styles.inspectorSpecKey}>Portrait Slot</span>
                      <span className={styles.inspectorSpecVal}>
                        {spec.photoSupport === 'none' ? 'No Photo (ATS Clean)' : 'Optional Portrait'}
                      </span>
                    </div>
                    <div className={styles.inspectorSpecRow}>
                      <span className={styles.inspectorSpecKey}>Export Formats</span>
                      <span className={styles.inspectorSpecVal}>Selectable PDF &amp; DOCX</span>
                    </div>
                  </div>

                  <div className={styles.inspectorCard}>
                    <h3 className={styles.inspectorHeading}>Recommended Roles &amp; Sectors</h3>
                    <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#334155', lineHeight: 1.45 }}>
                      {spec.intendedUse}
                    </p>
                    <div className={styles.tagRow} style={{ marginBottom: 0 }}>
                      {spec.bestFor.map((role) => (
                        <span key={role} className={styles.metaTag}>
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>

                  <a
                    className={styles.useBtn}
                    href={`/generate?template=${encodeURIComponent(activePreviewTemplate.id)}${modalDocMode === 'cv' ? '&docType=cv' : ''}`}
                    onClick={() => savePendingTemplateSelection(activePreviewTemplate.id, modalDocMode)}
                  >
                    Build {modalDocMode === 'cv' ? 'CV' : 'Resume'} With {activePreviewTemplate.name}
                  </a>
                </aside>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}

const GalleryCard = memo(function GalleryCard({
  template,
  onOpenPreview,
}: {
  template: ResumeTemplate;
  onOpenPreview: (templateId: string) => void;
}) {
  const spec = useMemo(() => resolveTemplateSpec(template), [template]);
  const verifiedAts = spec.atsCompatibility === 'verified';

  return (
    <div className={styles.card} data-gallery-card={template.id}>
      <button
        type="button"
        className={styles.previewStageBtn}
        onClick={() => onOpenPreview(template.id)}
        aria-label={`Preview ${template.name} full size`}
      >
        <div className={styles.stageTopMeta}>
          <span className={styles.codePill}>#{spec.code}</span>
          <span className={verifiedAts ? styles.atsBadgeVerified : styles.atsBadgePartial}>
            {verifiedAts ? 'ATS-Verified' : '2-Col Visual'}
          </span>
        </div>

        <ResumeDocumentPreview
          draft={SAMPLE_PREVIEW_DRAFT}
          template={template}
          size="mini"
          isDemo
        />

        <span className={styles.previewHoverPill} aria-hidden="true">
          Inspect A4 Layout
        </span>
      </button>

      <div className={styles.cardBody}>
        <div className={styles.cardGroupEyebrow}>
          Group {spec.group} &middot; {spec.columns === 1 ? '1-Column A4' : '2-Column A4'}
        </div>
        <h2 className={styles.cardTitle}>{template.name}</h2>
        <p className={styles.cardDesc}>{template.description}</p>

        <div className={styles.bestForBox}>
          <span className={styles.bestForLabel}>Best for: </span>
          {spec.intendedUse}
        </div>

        <div className={styles.tagRow}>
          {(spec.libraryCategories ?? []).slice(0, 3).map((cat) => (
            <span key={cat} className={styles.metaTag}>
              {cat}
            </span>
          ))}
          {spec.photoSupport !== 'none' && (
            <span className={styles.metaTag}>Optional Photo</span>
          )}
        </div>

        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.previewBtn}
            onClick={() => onOpenPreview(template.id)}
          >
            Preview
          </button>
          <a
            className={styles.useBtn}
            href={`/generate?template=${encodeURIComponent(template.id)}`}
            onClick={() => savePendingTemplateSelection(template.id, 'resume')}
          >
            Use Template
          </a>
        </div>
        <div className={styles.cardSubAction}>
          <span>Supports Resume &amp; CV</span>
          <a
            className={styles.cardCvLink}
            href={`/generate?template=${encodeURIComponent(template.id)}&docType=cv`}
            onClick={() => savePendingTemplateSelection(template.id, 'cv')}
          >
            Build as CV &rarr;
          </a>
        </div>
      </div>
    </div>
  );
});

