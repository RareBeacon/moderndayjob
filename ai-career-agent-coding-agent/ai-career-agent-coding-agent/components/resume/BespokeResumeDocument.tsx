'use client';

import React, { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ResumeSectionKey } from '@/lib/resume-studio/catalog30';
import type { StudioDraft } from '@/lib/resume-studio/draft';
import {
  normalizeResumeFromDraft,
  type NormalizedResumeDocument,
} from '@/lib/resume-studio/document-model';
import { SAMPLE_PREVIEW_DRAFT } from '@/lib/resume-studio/sample';
import {
  resolveTemplateSpec,
  type CuratedTemplateSpec,
  type ResumeTemplate,
} from '@/lib/resume-studio/templates';
import styles from './BespokeResumeDocument.module.css';

let cachedSampleNormalizedDoc: NormalizedResumeDocument | null = null;
function getSampleNormalizedDoc(): NormalizedResumeDocument {
  if (!cachedSampleNormalizedDoc) {
    cachedSampleNormalizedDoc = normalizeResumeFromDraft(SAMPLE_PREVIEW_DRAFT);
  }
  return cachedSampleNormalizedDoc;
}

const CANONICAL_A4_WIDTH_PX = 794;
const CANONICAL_A4_HEIGHT_PX = 1123;

const DEFAULT_TITLES: Record<ResumeSectionKey, string> = {
  summary: 'Professional Summary',
  skills: 'Skills',
  experience: 'Work Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  publications: 'Publications',
  awards: 'Honours & Awards',
  languages: 'Languages',
  volunteer: 'Volunteer Experience',
  memberships: 'Professional Memberships',
  additional: 'Additional Information',
  references: 'References',
};

function hasSectionContent(doc: NormalizedResumeDocument, key: ResumeSectionKey): boolean {
  switch (key) {
    case 'summary':
      return Boolean(doc.summary);
    case 'skills':
      return doc.skills.length > 0;
    case 'experience':
      return doc.experiences.length > 0;
    case 'projects':
      return doc.projects.length > 0;
    case 'education':
      return doc.education.length > 0;
    case 'certifications':
      return doc.certifications.length > 0;
    case 'publications':
      return doc.publications.length > 0;
    case 'awards':
      return doc.awards.length > 0;
    case 'languages':
      return doc.languages.length > 0;
    case 'volunteer':
      return doc.volunteer.length > 0;
    case 'memberships':
      return doc.memberships.length > 0;
    case 'additional':
      return Boolean(doc.additional);
    case 'references':
      return Boolean(doc.references);
    default:
      return false;
  }
}

function extractHighlights(doc: NormalizedResumeDocument): string[] {
  const out: string[] = [];
  for (const exp of doc.experiences) {
    for (const bullet of exp.bullets) {
      if (/\d+%|\d+\+|\d+\.\d+%|\b\d+\s*(hours|days|users|requests|engineers|accounts|ms)\b/i.test(bullet)) {
        out.push(bullet.length > 88 ? `${bullet.slice(0, 85).replace(/\s+\S*$/, '')}...` : bullet);
        if (out.length >= 3) return out;
      }
    }
  }
  return out;
}

function PortraitSlot({
  spec,
  photoDataUrl,
  round = false,
  isDemo = false,
}: {
  spec: CuratedTemplateSpec;
  photoDataUrl: string;
  round?: boolean;
  isDemo?: boolean;
}) {
  if (spec.photoSupport === 'none') return null;
  const label = isDemo ? 'Fictional sample portrait' : 'Candidate portrait';
  return (
    <div
      className={`${styles.photoFrame} ${round ? styles.photoRound : ''}`}
      data-photo-slot={spec.photoSupport}
      aria-label={label}
    >
      {photoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoDataUrl} alt={label} className={styles.photoImg} />
      ) : (
        <svg
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
          className={styles.photoPlaceholderSvg}
        >
          <circle cx="24" cy="18" r="8" stroke="currentColor" strokeWidth="2.4" />
          <path
            d="M10 40c2.2-7.2 7.5-11 14-11s11.8 3.8 14 11"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

export interface BespokeResumeDocumentProps {
  draft: StudioDraft;
  template: ResumeTemplate;
  size?: 'mini' | 'full';
  isDemo?: boolean;
  zoom?: number;
}

function BespokeResumeDocumentInner({
  draft,
  template,
  size = 'full',
  isDemo = false,
  zoom = 1,
}: BespokeResumeDocumentProps) {
  const spec = useMemo(() => resolveTemplateSpec(template), [template]);
  const bp = spec.blueprint;
  const pal = bp.palette;
  const doc = useMemo(
    () => (draft === SAMPLE_PREVIEW_DRAFT ? getSampleNormalizedDoc() : normalizeResumeFromDraft(draft)),
    [draft],
  );

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(size === 'mini' ? 268 : CANONICAL_A4_WIDTH_PX);
  const [sheetHeight, setSheetHeight] = useState<number>(CANONICAL_A4_HEIGHT_PX);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      const w = el.clientWidth;
      if (w > 20) {
        setContainerWidth((prev) => (Math.abs(prev - w) >= 1 ? w : prev));
      }
      if (size === 'full' && sheetRef.current) {
        const nextH = Math.max(CANONICAL_A4_HEIGHT_PX, sheetRef.current.scrollHeight);
        setSheetHeight((prev) => (Math.abs(prev - nextH) >= 2 ? nextH : prev));
      }
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (size === 'full' && sheetRef.current) {
      ro.observe(sheetRef.current);
    }
    return () => ro.disconnect();
  }, [size]);

  useEffect(() => {
    if (size !== 'full' || !sheetRef.current) return;
    const nextH = Math.max(CANONICAL_A4_HEIGHT_PX, sheetRef.current.scrollHeight);
    setSheetHeight((prev) => (Math.abs(prev - nextH) >= 2 ? nextH : prev));
  }, [size, doc, template.id]);

  const effectiveScale =
    size === 'mini'
      ? containerWidth / CANONICAL_A4_WIDTH_PX
      : Math.min(zoom, Math.max(0.32, (containerWidth - 8) / CANONICAL_A4_WIDTH_PX));

  const scaledWidth = Math.round(CANONICAL_A4_WIDTH_PX * effectiveScale);
  const scaledHeight =
    size === 'mini'
      ? Math.round(CANONICAL_A4_HEIGHT_PX * effectiveScale)
      : Math.round(sheetHeight * effectiveScale);

  const isEmptyUserDraft =
    !isDemo &&
    !doc.fullName &&
    !doc.professionalTitle &&
    !doc.summary &&
    doc.experiences.length === 0 &&
    doc.skills.length === 0 &&
    doc.education.length === 0 &&
    doc.projects.length === 0;

  const headFontClass =
    bp.headingFont === 'serif'
      ? styles.fontHeadSerif
      : bp.headingFont === 'mono'
        ? styles.fontHeadMono
        : styles.fontHeadSans;

  const bodyFontClass = bp.bodyFont === 'serif' ? styles.fontBodySerif : styles.fontBodySans;

  const bannerStripColor =
    bp.masthead === 'executive-banner'
      ? '#d7f94b'
      : bp.masthead === 'commercial-amber-band'
        ? '#f59e0b'
        : '#10b981';

  const cssVars = {
    '--tpl-paper': pal.paper,
    '--tpl-ink': pal.ink,
    '--tpl-muted': pal.muted,
    '--tpl-accent': pal.accent,
    '--tpl-accent-soft': pal.accentSoft,
    '--tpl-header-bg': pal.headerBg,
    '--tpl-header-ink': pal.headerInk,
    '--tpl-rail-bg': pal.railBg,
    '--tpl-rail-ink': pal.railInk,
    '--tpl-rule': pal.rule,
    '--tpl-card': pal.cardBg,
    '--tpl-banner-strip': bannerStripColor,
    '--tpl-pad': `${Math.round(bp.pageMarginPt * 1.18)}px`,
    '--tpl-sec-gap': `${Math.round(bp.sectionGapPt * 1.25)}px`,
    '--tpl-rail-w': `${Math.round((bp.railRatio ?? 0.33) * 100)}%`,
  } as CSSProperties;

  let sectionCounter = 0;

  const renderHeading = (key: ResumeSectionKey, isDarkRail = false) => {
    sectionCounter += 1;
    const title = bp.sectionTitles[key] || DEFAULT_TITLES[key];

    if (isDarkRail) {
      return <h2 className={`${styles.headingDarkRail} ${headFontClass}`}>{title}</h2>;
    }

    switch (bp.sectionHeadingStyle) {
      case 'double-rule':
        return <h2 className={`${styles.headingDoubleRule} ${headFontClass}`}>{title}</h2>;
      case 'short-accent-lead':
        return (
          <h2 className={`${styles.headingShortLead} ${headFontClass}`}>
            <span className={styles.headingShortLeadBar} />
            <span>{title}</span>
          </h2>
        );
      case 'tinted-band':
        return <h2 className={`${styles.headingTintedBand} ${headFontClass}`}>{title}</h2>;
      case 'numbered-index':
        return (
          <h2 className={`${styles.headingNumbered} ${headFontClass}`}>
            <span className={styles.headingNumberBadge}>{String(sectionCounter).padStart(2, '0')}</span>
            <span className={styles.headingNumberText}>{title}</span>
          </h2>
        );
      case 'pill-tag':
        return (
          <div className={styles.headingPillRow}>
            <h2 className={`${styles.headingPill} ${headFontClass}`}>{title}</h2>
            <span className={styles.headingPillLine} />
          </div>
        );
      case 'mono-bracket':
        return <h2 className={`${styles.headingMonoBracket} ${styles.fontHeadMono}`}>[ {title} ]</h2>;
      case 'centered-ornament':
        return <h2 className={`${styles.headingCenteredOrnament} ${headFontClass}`}>{title}</h2>;
      case 'swiss-heavy-top':
        return <h2 className={`${styles.headingSwissHeavy} ${headFontClass}`}>{title}</h2>;
      case 'full-bottom-rule':
      default:
        return <h2 className={`${styles.headingBottomRule} ${headFontClass}`}>{title}</h2>;
    }
  };

  const renderSectionBody = (key: ResumeSectionKey, isSecondaryRail: boolean, isDarkRail: boolean) => {
    if (key === 'summary') {
      if (!isSecondaryRail && bp.callout === 'summary-card') {
        return <div className={styles.summaryCallout} style={{ fontSize: '12.4px' }}>{doc.summary}</div>;
      }
      return <p style={{ margin: 0, fontSize: isSecondaryRail ? '11.6px' : '12.4px' }}>{doc.summary}</p>;
    }

    if (key === 'skills') {
      if (isSecondaryRail) {
        return (
          <div data-section="skills">
            {doc.skillGroups.map((group) => (
              <div key={group.category} style={{ marginBottom: '8px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: isDarkRail ? '#38bdf8' : pal.accent,
                    marginBottom: '3px',
                  }}
                >
                  {group.category}
                </div>
                <div className={styles.skillPillWrap}>
                  {group.items.map((item) => (
                    <span
                      key={item}
                      className={`${styles.skillPill} ${isDarkRail ? styles.skillPillDark : ''}`}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      }

      if (bp.skillsPresentation === 'three-col-pillars' || bp.skillsPresentation === 'two-col-grid') {
        const groups = doc.skillGroups.length >= 2 ? doc.skillGroups : [{ category: 'Core Skills', items: doc.skills }];
        return (
          <div
            data-section="skills"
            className={bp.skillsPresentation === 'three-col-pillars' ? styles.skillPillars3 : styles.skillPillars2}
          >
            {groups.map((g) => (
              <div key={g.category} className={styles.skillPillarCard}>
                <div className={styles.skillPillarCat}>{g.category}</div>
                <div style={{ fontSize: '11.5px' }}>{g.items.join(', ')}</div>
              </div>
            ))}
          </div>
        );
      }

      if (bp.skillsPresentation === 'grouped-matrix' || bp.skillsPresentation === 'key-value-rows') {
        return (
          <div data-section="skills">
            {doc.skillGroups.map((g) => (
              <div key={g.category} className={styles.skillMatrixRow}>
                <span className={styles.skillMatrixCat}>{g.category}:</span>
                <span>{g.items.join(', ')}</span>
              </div>
            ))}
          </div>
        );
      }

      if (bp.skillsPresentation === 'pill-chips') {
        return (
          <div data-section="skills" className={styles.skillPillWrap}>
            {doc.skills.map((s) => (
              <span key={s} className={styles.skillPill}>
                {s}
              </span>
            ))}
          </div>
        );
      }

      return (
        <div data-section="skills" style={{ fontSize: '12px' }}>
          {doc.skills.join('  |  ')}
        </div>
      );
    }

    if (key === 'experience') {
      return (
        <div>
          {doc.experiences.map((exp) => {
            if (!isSecondaryRail && bp.experienceStyle === 'date-gutter-row') {
              return (
                <div key={exp.id} className={styles.dateGutterGrid}>
                  <div className={styles.dateGutterMeta}>
                    {exp.dateRange && <div className={styles.dateGutterRange}>{exp.dateRange}</div>}
                    {exp.location && <div className={styles.dateGutterLoc}>{exp.location}</div>}
                  </div>
                  <div>
                    <div className={styles.expRole}>
                      {[exp.role, exp.company].filter(Boolean).join(' - ')}
                    </div>
                    {exp.bullets.length > 0 && (
                      <ul className={styles.bulletList}>
                        {exp.bullets.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            }

            if (!isSecondaryRail && bp.experienceStyle === 'timeline-node') {
              return (
                <div key={exp.id} className={styles.timelineRow}>
                  <div className={styles.expHeaderRow}>
                    <span className={styles.expRole}>{exp.role}</span>
                    {exp.dateRange && <span className={styles.expDate}>{exp.dateRange}</span>}
                  </div>
                  {(exp.company || exp.location) && (
                    <div className={styles.expCompany}>
                      {[exp.company, exp.location].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {exp.bullets.length > 0 && (
                    <ul className={styles.bulletList}>
                      {exp.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }

            const firstLine =
              bp.experienceStyle === 'compact-consulting'
                ? [exp.company, exp.location].filter(Boolean).join(' - ') || exp.role
                : exp.role;
            const secondLine =
              bp.experienceStyle === 'compact-consulting'
                ? exp.company
                  ? exp.role
                  : ''
                : [exp.company, exp.location].filter(Boolean).join(', ');

            return (
              <div key={exp.id} className={styles.expItem}>
                <div
                  className={`${styles.expHeaderRow} ${bp.experienceStyle === 'shaded-role-bar' ? styles.expShadedBar : ''}`}
                >
                  <span className={styles.expRole}>{firstLine}</span>
                  {exp.dateRange && <span className={styles.expDate}>{exp.dateRange}</span>}
                </div>
                {secondLine && <div className={styles.expCompany}>{secondLine}</div>}
                {exp.bullets.length > 0 && (
                  <ul className={styles.bulletList}>
                    {exp.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (key === 'projects') {
      if (!isSecondaryRail && bp.projectStyle === 'two-col-cards' && doc.projects.length >= 2) {
        return (
          <div className={styles.projectCardsGrid}>
            {doc.projects.map((p) => (
              <div key={p.id} className={styles.projectCard}>
                <div style={{ fontWeight: 700, fontSize: '12.5px' }}>{p.name}</div>
                {p.description && <div style={{ fontSize: '11.4px', marginTop: '3px' }}>{p.description}</div>}
                {p.achievements.map((a, i) => (
                  <div key={i} style={{ fontSize: '11.2px', marginTop: '3px' }}>
                    • {a}
                  </div>
                ))}
                {p.technologies.length > 0 && (
                  <div className={styles.projectStack}>Stack: {p.technologies.join(', ')}</div>
                )}
              </div>
            ))}
          </div>
        );
      }

      return (
        <div>
          {doc.projects.map((p) => (
            <div key={p.id} className={styles.projectItem}>
              <div className={styles.expHeaderRow}>
                <span style={{ fontWeight: 700, fontSize: '12.5px' }}>{p.name}</span>
                {p.url && <span style={{ fontSize: '10.8px', color: pal.accent }}>{p.url}</span>}
              </div>
              {p.technologies.length > 0 && (
                <div className={styles.projectStack}>Technologies: {p.technologies.join(', ')}</div>
              )}
              {p.description && <div style={{ fontSize: '12px' }}>{p.description}</div>}
              {p.achievements.length > 0 && (
                <ul className={styles.bulletList}>
                  {p.achievements.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (key === 'education') {
      return (
        <div>
          {doc.education.map((edu) => (
            <div key={edu.id} style={{ marginBottom: '7px' }}>
              <div className={styles.expHeaderRow}>
                <span style={{ fontWeight: 700, fontSize: isSecondaryRail ? '11.8px' : '12.5px' }}>
                  {edu.qualificationLine || edu.degree}
                </span>
                {!isSecondaryRail && edu.dateRange && <span className={styles.expDate}>{edu.dateRange}</span>}
              </div>
              {edu.institution && (
                <div style={{ fontSize: '11.6px', fontStyle: 'italic', color: isDarkRail ? '#cbd5e1' : pal.muted }}>
                  {isSecondaryRail && edu.dateRange ? `${edu.institution} | ${edu.dateRange}` : edu.institution}
                </div>
              )}
              {edu.achievements && <div style={{ fontSize: '11.4px', marginTop: '2px' }}>{edu.achievements}</div>}
            </div>
          ))}
        </div>
      );
    }

    if (key === 'certifications') {
      return (
        <ul className={styles.bulletList}>
          {doc.certifications.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong>
              {(c.issuer || c.date) && ` - ${[c.issuer, c.date].filter(Boolean).join(' - ')}`}
            </li>
          ))}
        </ul>
      );
    }

    if (key === 'languages') {
      return (
        <div style={{ fontSize: isSecondaryRail ? '11.5px' : '12px' }}>
          {doc.languages
            .map((l) => (l.proficiency ? `${l.language} (${l.proficiency})` : l.language))
            .join(isSecondaryRail ? ' • ' : '   |   ')}
        </div>
      );
    }

    if (key === 'publications') {
      return (
        <ul className={styles.bulletList}>
          {doc.publications.map((pub) => (
            <li key={pub.id}>{[pub.title, pub.venue, pub.date, pub.url].filter(Boolean).join(' - ')}</li>
          ))}
        </ul>
      );
    }

    if (key === 'awards') {
      return (
        <ul className={styles.bulletList}>
          {doc.awards.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      );
    }

    if (key === 'volunteer') {
      return (
        <div>
          {doc.volunteer.map((v) => (
            <div key={v.id} style={{ marginBottom: '6px', fontSize: '12px' }}>
              <strong>{[v.role, v.organization, v.dates].filter(Boolean).join(' - ')}</strong>
              {v.summary && <div>{v.summary}</div>}
            </div>
          ))}
        </div>
      );
    }

    if (key === 'memberships') {
      return <div style={{ fontSize: '12px' }}>{doc.memberships.join('  |  ')}</div>;
    }

    if (key === 'additional') {
      return <div style={{ fontSize: '12px' }}>{doc.additional}</div>;
    }

    if (key === 'references') {
      return <div style={{ fontSize: '12px' }}>{doc.references}</div>;
    }

    return null;
  };

  const renderSectionsList = (keys: ResumeSectionKey[], isSecondaryRail = false, isDarkRail = false) => {
    const useLeftRail = !isSecondaryRail && spec.columns === 1 && bp.bodyStructure === 'left-section-rail';

    return keys
      .filter((k) => hasSectionContent(doc, k))
      .map((key) => {
        if (useLeftRail) {
          return (
            <section key={key} data-section={key} className={styles.leftSectionRailRow}>
              <div className={`${styles.leftSectionRailTitle} ${headFontClass}`}>
                {bp.sectionTitles[key] || DEFAULT_TITLES[key]}
              </div>
              <div>{renderSectionBody(key, false, false)}</div>
            </section>
          );
        }
        return (
          <section key={key} data-section={key} className={styles.sectionBlock}>
            {renderHeading(key, isDarkRail)}
            {renderSectionBody(key, isSecondaryRail, isDarkRail)}
          </section>
        );
      });
  };

  const renderContactInline = (centered = false, lightColor?: string) => {
    if (!doc.contactItems.length) return null;
    return (
      <div
        className={`${styles.contactLine} ${centered ? styles.contactLineCentered : ''}`}
        style={lightColor ? { color: lightColor } : undefined}
      >
        {doc.contactItems.map((item, i) => (
          <span key={`${item.label}-${i}`} className={i > 0 ? styles.contactSep : undefined}>
            {item.value}
          </span>
        ))}
      </div>
    );
  };

  const renderMasthead = () => {
    const m = bp.masthead;

    if (m === 'architectural-split') {
      return (
        <header className={styles.bannerSplit}>
          <div className={styles.bannerSplitLeft}>
            <h1 className={headFontClass} style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#f8fafc' }}>
              {doc.fullName}
            </h1>
            {doc.professionalTitle && (
              <div style={{ fontSize: '13.5px', color: '#bae6fd', marginTop: '4px', fontWeight: 500 }}>
                {doc.professionalTitle}
              </div>
            )}
            <div style={{ width: '46px', height: '4px', background: '#38bdf8', marginTop: '14px' }} />
          </div>
          <div className={styles.bannerSplitRight}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {doc.contactItems.map((c, idx) => (
                <span key={idx}>{c.value}</span>
              ))}
            </div>
            <PortraitSlot spec={spec} photoDataUrl={doc.photoDataUrl} isDemo={isDemo} />
          </div>
        </header>
      );
    }

    if (m === 'executive-banner' || m === 'security-dossier' || m === 'commercial-amber-band') {
      return (
        <header className={styles.bannerDark}>
          {m === 'security-dossier' && (
            <div
              className={styles.fontHeadMono}
              style={{ fontSize: '10px', color: '#34d399', letterSpacing: '0.1em', marginBottom: '4px' }}
            >
              TECHNICAL & SECURITY DOSSIER
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <div>
              <h1 className={headFontClass} style={{ margin: 0, fontSize: '28px', fontWeight: 700 }}>
                {doc.fullName}
              </h1>
              {doc.professionalTitle && (
                <div style={{ fontSize: '13.5px', color: pal.headerMuted, fontWeight: 600, marginTop: '3px' }}>
                  {doc.professionalTitle}
                </div>
              )}
              {renderContactInline(false, '#e2e8f0')}
            </div>
            <PortraitSlot spec={spec} photoDataUrl={doc.photoDataUrl} isDemo={isDemo} />
          </div>
        </header>
      );
    }

    if (
      m === 'research-tint-split' ||
      m === 'editorial-magazine' ||
      m === 'operations-monogram' ||
      m === 'studio-portrait' ||
      m === 'ux-system-bar' ||
      m === 'educator-sage' ||
      m === 'graduate-launchpad' ||
      m === 'pivot-target-role' ||
      m === 'engagement-brief' ||
      m === 'diplomatic-mobility'
    ) {
      const leftBorder = m === 'educator-sage' || m === 'engagement-brief';
      return (
        <header className={`${styles.bandTinted} ${leftBorder ? styles.bandTintedLeftBorder : ''}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
            {m === 'operations-monogram' && <div className={styles.monogramSquare}>{doc.initials}</div>}
            <div style={{ flex: 1 }}>
              {(m === 'pivot-target-role' || m === 'engagement-brief') && (
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: pal.accent,
                    textTransform: 'uppercase',
                    marginBottom: '3px',
                  }}
                >
                  {m === 'pivot-target-role'
                    ? `Target Alignment: ${doc.professionalTitle || 'Career Transition'}`
                    : 'Project & Advisory Delivery Brief'}
                </div>
              )}
              <h1 className={headFontClass} style={{ margin: 0, fontSize: '27px', fontWeight: 700 }}>
                {doc.fullName}
              </h1>
              {doc.professionalTitle && (
                <div style={{ fontSize: '13px', fontWeight: 600, color: pal.headerMuted, marginTop: '2px' }}>
                  {doc.professionalTitle}
                </div>
              )}
              {renderContactInline(false)}
            </div>
          </div>
          <PortraitSlot spec={spec} photoDataUrl={doc.photoDataUrl} round={m === 'studio-portrait'} isDemo={isDemo} />
        </header>
      );
    }

    if (
      m === 'sovereign-centered' ||
      m === 'institutional-framed' ||
      m === 'literary-broadsheet' ||
      m === 'scholar-clean'
    ) {
      const upper = m === 'sovereign-centered' || m === 'institutional-framed';
      const doubleRule = m === 'sovereign-centered' || m === 'literary-broadsheet';
      const framedTop = m === 'institutional-framed' || m === 'literary-broadsheet';
      return (
        <header
          className={`${styles.centeredMasthead} ${doubleRule ? styles.centeredDoubleRule : ''} ${framedTop ? styles.centeredFramedTop : ''}`}
        >
          <h1
            className={headFontClass}
            style={{
              margin: 0,
              fontSize: '29px',
              fontWeight: 700,
              letterSpacing: upper ? '0.06em' : '0.01em',
              textTransform: upper ? 'uppercase' : 'none',
            }}
          >
            {doc.fullName}
          </h1>
          {doc.professionalTitle && (
            <div
              style={{
                fontSize: '13.5px',
                fontWeight: m === 'literary-broadsheet' ? 400 : 600,
                fontStyle: m === 'literary-broadsheet' ? 'italic' : 'normal',
                color: pal.accent,
                marginTop: '4px',
              }}
            >
              {doc.professionalTitle}
            </div>
          )}
          {renderContactInline(true)}
        </header>
      );
    }

    if (m === 'swiss-oversized') {
      return (
        <header className={styles.swissMasthead}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
            <div>
              <div className={styles.swissEyebrow}>
                <span className={styles.swissSquare} />
                <span>{doc.professionalTitle || 'Visual & Digital Systems'}</span>
              </div>
              <h1 className={headFontClass} style={{ margin: 0, fontSize: '33px', fontWeight: 800, lineHeight: 1.05 }}>
                {doc.fullName}
              </h1>
              {renderContactInline(false)}
            </div>
            <PortraitSlot spec={spec} photoDataUrl={doc.photoDataUrl} isDemo={isDemo} />
          </div>
        </header>
      );
    }

    if (m === 'developer-spec' || m === 'product-card-split') {
      return (
        <header className={styles.specBoxMasthead}>
          <h1 className={headFontClass} style={{ margin: 0, fontSize: '27px', fontWeight: 700 }}>
            {doc.fullName}
          </h1>
          {doc.professionalTitle && (
            <div
              className={m === 'developer-spec' ? styles.fontHeadMono : undefined}
              style={{ fontSize: '12.5px', fontWeight: 700, color: pal.accent, marginTop: '3px' }}
            >
              {m === 'developer-spec' ? `// ${doc.professionalTitle}` : doc.professionalTitle}
            </div>
          )}
          {renderContactInline(false)}
        </header>
      );
    }

    if (m === 'spine-accent') {
      return (
        <header className={styles.spineMasthead}>
          <h1 className={headFontClass} style={{ margin: 0, fontSize: '28px', fontWeight: 700 }}>
            {doc.fullName}
          </h1>
          {doc.professionalTitle && (
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: pal.accent, marginTop: '2px' }}>
              {doc.professionalTitle}
            </div>
          )}
          {renderContactInline(false)}
        </header>
      );
    }

    if (m === 'corporate-split') {
      return (
        <header className={styles.corporateSplitMasthead}>
          <div>
            <h1 className={headFontClass} style={{ margin: 0, fontSize: '28px', fontWeight: 700 }}>
              {doc.fullName}
            </h1>
            {doc.professionalTitle && (
              <div style={{ fontSize: '13.5px', fontStyle: 'italic', color: pal.muted, marginTop: '3px' }}>
                {doc.professionalTitle}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px', color: pal.muted, lineHeight: 1.45 }}>
            {doc.contactItems.slice(0, 5).map((c, idx) => (
              <div key={idx}>{c.value}</div>
            ))}
          </div>
        </header>
      );
    }

    // analytical-top-bar, atelier-minimal, consulting-compact, academic-cv, journal-abstract, specialist-badge
    return (
      <header
        style={{
          borderTop: m === 'journal-abstract' ? `3px double ${pal.accent}` : undefined,
          paddingTop: m === 'journal-abstract' ? '10px' : undefined,
          paddingBottom: '12px',
          marginBottom: '16px',
          borderBottom: `${m === 'atelier-minimal' ? '1px' : '1.5px'} solid ${pal.rule}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
          <h1 className={headFontClass} style={{ margin: 0, fontSize: '27px', fontWeight: 700 }}>
            {doc.fullName}
          </h1>
          {m === 'academic-cv' && (
            <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: pal.accent }}>
              CURRICULUM VITAE
            </span>
          )}
          {m === 'specialist-badge' && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                background: pal.accentSoft,
                color: pal.accent,
                padding: '2px 8px',
                borderRadius: '3px',
              }}
            >
              SENIOR SPECIALIST PROFILE
            </span>
          )}
        </div>
        {doc.professionalTitle && (
          <div style={{ fontSize: '13px', fontWeight: 600, color: pal.accent, marginTop: '3px' }}>
            {doc.professionalTitle}
          </div>
        )}
        {renderContactInline(false)}
      </header>
    );
  };

  const fullBleedHeader =
    bp.masthead === 'executive-banner' ||
    bp.masthead === 'security-dossier' ||
    bp.masthead === 'commercial-amber-band' ||
    bp.masthead === 'architectural-split';

  const highlights = useMemo(
    () => (spec.columns === 1 && bp.callout === 'kpi-highlights' ? extractHighlights(doc) : []),
    [spec.columns, bp.callout, doc],
  );

  return (
    <div
      ref={viewportRef}
      className={size === 'mini' ? styles.viewportMini : styles.viewportFull}
    >
      <div
        className={styles.scaleStage}
        style={
          size === 'mini'
            ? undefined
            : {
                width: `${scaledWidth}px`,
                height: `${scaledHeight}px`,
              }
        }
      >
        <div
          className={styles.scaleCanvas}
          style={{
            transform: `scale(${effectiveScale.toFixed(4)})`,
          }}
        >
          <article
            ref={sheetRef}
            className={`${styles.sheet} ${bodyFontClass}`}
            style={cssVars}
            data-template-id={template.id}
            data-template-code={spec.code}
            data-layout={template.layout}
            data-columns={String(spec.columns)}
            data-demo={isDemo ? 'true' : 'false'}
          >
            {bp.masthead === 'analytical-top-bar' && (
              <div style={{ height: '8px', background: pal.accent, width: '100%' }} />
            )}

            {isEmptyUserDraft ? (
              <div className={styles.emptyPrompt}>
                <PortraitSlot spec={spec} photoDataUrl={doc.photoDataUrl} round isDemo={isDemo} />
                <div className={`${styles.emptyPromptTitle} ${headFontClass}`}>{spec.name}</div>
                <div>Add your profile, experience, education, and skills to preview your A4 resume live.</div>
              </div>
            ) : bp.bodyStructure === 'full-bleed-dark-sidebar' ? (
              /* Template 20: Full-height dark left sidebar + right main canvas */
              <div className={styles.darkSidebarLayout}>
                <aside className={styles.darkSidebarRail}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                    {spec.photoSupport !== 'none' ? (
                      <PortraitSlot spec={spec} photoDataUrl={doc.photoDataUrl} round isDemo={isDemo} />
                    ) : (
                      <div className={styles.monogramSquare} style={{ borderRadius: '999px' }}>
                        {doc.initials}
                      </div>
                    )}
                  </div>
                {doc.contactItems.length > 0 && (
                  <div style={{ marginBottom: '18px' }}>
                    <h2 className={`${styles.headingDarkRail} ${headFontClass}`}>Contact & Channels</h2>
                    {doc.contactItems.map((c, idx) => (
                      <div key={idx} style={{ marginBottom: '6px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                          {c.label}
                        </div>
                        <div style={{ fontSize: '11px', color: '#f8fafc', wordBreak: 'break-word' }}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                )}
                {renderSectionsList(bp.secondarySections, true, true)}
              </aside>
              <div className={styles.darkSidebarMain}>
                <header style={{ marginBottom: '18px' }}>
                  <h1 className={headFontClass} style={{ margin: 0, fontSize: '30px', fontWeight: 800, color: pal.ink }}>
                    {doc.fullName}
                  </h1>
                  {doc.professionalTitle && (
                    <div style={{ fontSize: '14px', fontWeight: 700, color: pal.accent, marginTop: '4px' }}>
                      {doc.professionalTitle}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
                    <span style={{ width: '64px', height: '4px', background: pal.accent }} />
                    <span style={{ flex: 1, height: '1px', background: '#cbd5e1' }} />
                  </div>
                </header>
                {renderSectionsList(bp.primarySections, false, false)}
              </div>
            </div>
          ) : (
            <>
              {fullBleedHeader && renderMasthead()}
              <div className={fullBleedHeader ? styles.paddedBelowBanner : styles.paddedCanvas}>
                {!fullBleedHeader && renderMasthead()}

                {highlights.length >= 2 && (
                  <div className={styles.kpiGrid}>
                    {highlights.map((hl, idx) => (
                      <div key={idx} className={styles.kpiCard}>
                        {hl}
                      </div>
                    ))}
                  </div>
                )}

                {spec.columns === 1 ? (
                  <div>{renderSectionsList(bp.primarySections, false, false)}</div>
                ) : bp.bodyStructure === 'two-col-left-rail' ? (
                  <div className={styles.twoColLeftRail}>
                    <aside className={styles.railPanel}>{renderSectionsList(bp.secondarySections, true, false)}</aside>
                    <div>{renderSectionsList(bp.primarySections, false, false)}</div>
                  </div>
                ) : (
                  <div className={styles.twoColRightRail}>
                    <div>{renderSectionsList(bp.primarySections, false, false)}</div>
                    <aside className={styles.railPanel}>{renderSectionsList(bp.secondarySections, true, false)}</aside>
                  </div>
                )}
              </div>
            </>
          )}
          </article>

          {size === 'full' && sheetHeight > CANONICAL_A4_HEIGHT_PX + 24 && (
            <div className={styles.pageBreakGuide} aria-hidden="true">
              <span className={styles.pageBreakBadge}>A4 Page 2 Continuation</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const BespokeResumeDocument = memo(BespokeResumeDocumentInner);
