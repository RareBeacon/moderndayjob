'use client';

import React from 'react';
import type { StudioDraft } from '@/lib/resume-studio/draft';
import type { ResumeTemplate } from '@/lib/resume-studio/templates';
import { BespokeResumeDocument } from './BespokeResumeDocument';
import styles from './ResumeDocumentPreview.module.css';

export interface ResumeDocumentPreviewProps {
  draft: StudioDraft;
  template: ResumeTemplate;
  size?: 'mini' | 'full';
  demo?: boolean;
  isDemo?: boolean;
  zoom?: number;
}

export function ResumeDocumentPreview({
  draft,
  template,
  size = 'full',
  demo,
  isDemo,
  zoom = 1,
}: ResumeDocumentPreviewProps) {
  const resolvedDemo = Boolean(demo ?? isDemo);
  return (
    <div
      className={size === 'mini' ? styles.miniFrame : styles.fullFrame}
      data-preview-size={size}
    >
      <BespokeResumeDocument
        draft={draft}
        template={template}
        size={size}
        isDemo={resolvedDemo}
        zoom={zoom}
      />
    </div>
  );
}
