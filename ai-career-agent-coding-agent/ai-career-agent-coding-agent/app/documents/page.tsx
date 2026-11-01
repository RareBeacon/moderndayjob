'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/site/AppShell';
import { downloadExportedDocument } from '@/lib/documents/client-download';
import type { DocumentMode } from '@/lib/resume-studio/draft';
import { CURATED_TEMPLATES } from '@/lib/resume-studio/templates';

type UploadedDoc = { id: string; kind: string; original_name: string; byte_size: number; created_at: string };
type GeneratedDoc = {
  id: string;
  kind: string;
  title: string;
  version: number;
  created_at: string;
  source_facts?: {
    templateId?: string;
    templateName?: string;
    documentMode?: DocumentMode;
    truthfulnessPassed?: boolean;
  };
};

function defaultDocMode(doc: GeneratedDoc): DocumentMode {
  if (doc.source_facts?.documentMode === 'cv') return 'cv';
  if (doc.source_facts?.documentMode === 'resume') return 'resume';
  return /\bcv\b/i.test(doc.title) ? 'cv' : 'resume';
}

export default function Documents() {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [generated, setGenerated] = useState<GeneratedDoc[]>([]);
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, string>>({});
  const [modeOverrides, setModeOverrides] = useState<Record<string, DocumentMode>>({});
  const [exportBusyKey, setExportBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [u, g] = await Promise.all([
      fetch('/api/documents').catch(() => null),
      fetch('/api/documents/generated').catch(() => null),
    ]);
    if (u?.ok) {
      const payload = await u.json().catch(() => ({ documents: [] }));
      setDocs(payload.documents ?? []);
    }
    if (g?.ok) {
      const payload = await g.json().catch(() => ({ documents: [] }));
      setGenerated(payload.documents ?? []);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus('Uploading securely...');
    try {
      const f = new FormData();
      f.append('file', file);
      const r = await fetch('/api/documents', { method: 'POST', body: f });
      const x = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) {
        setStatus(x.error === 'PDF_REQUIRED' ? 'Please choose a PDF file.' : 'Upload could not be completed.');
        return;
      }
      setStatus('Your CV is stored privately.');
      e.target.value = '';
      void load();
    } catch {
      setBusy(false);
      setStatus('Network interrupted during upload. Please try again.');
    }
  }

  async function download(id: string) {
    try {
      const r = await fetch(`/api/documents/${id}/download`);
      const x = await r.json().catch(() => ({}));
      if (r.ok && x.url) window.location.assign(x.url);
      else setStatus('Download link is unavailable. Please try again.');
    } catch {
      setStatus('Download link is unavailable. Please try again.');
    }
  }

  async function exportDoc(doc: GeneratedDoc, format: 'pdf' | 'docx') {
    const busyKey = `${doc.id}:${format}`;
    setExportBusyKey(busyKey);
    setStatus('');
    const override = templateOverrides[doc.id] || undefined;
    const mode = doc.kind === 'CV' ? (modeOverrides[doc.id] ?? defaultDocMode(doc)) : undefined;
    const result = await downloadExportedDocument({
      documentId: doc.id,
      format,
      templateId: override,
      documentMode: mode,
      returnPath: '/documents',
    });
    setExportBusyKey(null);
    if (!result.ok) {
      setStatus(result.message);
    } else {
      setStatus(`Downloaded ${result.filename}`);
    }
  }

  return (
    <AppShell active="documents" title="Documents">
      <section className="workspace-hero">
        <p className="eyebrow">PRIVATE DOCUMENTS</p>
        <h1>Your career documents.</h1>
        <p>
          Upload your master CV as a private PDF, or build and export tailored Resumes and full Curriculum Vitae (CVs)
          across all 30 ISO A4 templates in PDF and Word DOCX.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '12px 0 18px' }}>
          <Link className="btn" href="/generate">
            Build Resume
          </Link>
          <Link className="btn secondary" href="/generate?docType=cv">
            Build Full CV
          </Link>
          <Link className="btn secondary" href="/templates">
            Browse 30 A4 Templates
          </Link>
        </div>
        <label className={`upload-card ${busy ? 'is-busy' : ''}`}>
          <input type="file" accept="application/pdf,.pdf" onChange={upload} disabled={busy} />
          <strong>{busy ? 'Uploading...' : 'Upload your master CV'}</strong>
          <span>PDF only &middot; maximum 5 MB</span>
        </label>
        {status && <p className="form-status">{status}</p>}
      </section>

      <section className="document-list">
        <h2>Generated documents</h2>
        {generated.length === 0 ? (
          <article className="card">
            <p className="muted" style={{ marginBottom: 12 }}>
              Generated Resumes, CVs, cover letters and application answers appear here once you create them.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="btn" href="/generate">
                Open Resume &amp; CV Studio
              </Link>
              <Link className="btn secondary" href="/templates">
                Explore 30 Templates
              </Link>
            </div>
          </article>
        ) : (
          generated.map((d) => {
            const activeMode = modeOverrides[d.id] ?? defaultDocMode(d);
            const docBadgeLabel =
              d.kind === 'CV'
                ? activeMode === 'cv'
                  ? 'CURRICULUM VITAE (CV)'
                  : 'RESUME'
                : d.kind.replace('_', ' ');

            return (
              <article className="card document-row" key={d.id}>
                <div>
                  <p className="eyebrow">
                    {docBadgeLabel} &middot; v{d.version}
                    {d.source_facts?.templateName ? ` · ${d.source_facts.templateName}` : ''}
                  </p>
                  <h2>{d.title}</h2>
                  <p className="muted">Generated {new Date(d.created_at).toLocaleDateString()}</p>
                </div>
                <div className="doc-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {d.kind === 'CV' && (
                    <>
                      <select
                        aria-label={`Document format for ${d.title}`}
                        value={activeMode}
                        onChange={(e) =>
                          setModeOverrides((prev) => ({
                            ...prev,
                            [d.id]: e.target.value === 'cv' ? 'cv' : 'resume',
                          }))
                        }
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 600 }}
                      >
                        <option value="resume">Export as Resume</option>
                        <option value="cv">Export as CV</option>
                      </select>

                      <select
                        aria-label={`Template for ${d.title}`}
                        value={templateOverrides[d.id] ?? ''}
                        onChange={(e) => setTemplateOverrides((prev) => ({ ...prev, [d.id]: e.target.value }))}
                        style={{ maxWidth: 220, padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                      >
                        <option value="">
                          {d.source_facts?.templateName ? `Saved (${d.source_facts.templateName})` : 'Saved template'}
                        </option>
                        {CURATED_TEMPLATES.map((t) => (
                          <option key={t.id} value={t.id}>
                            #{t.code} - {t.name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <button
                    className="text-button"
                    disabled={exportBusyKey === `${d.id}:pdf`}
                    onClick={() => {
                      void exportDoc(d, 'pdf');
                    }}
                  >
                    {exportBusyKey === `${d.id}:pdf` ? 'Preparing PDF...' : d.kind === 'CV' ? `${activeMode.toUpperCase()} PDF` : 'PDF'}
                  </button>
                  <button
                    className="text-button"
                    disabled={exportBusyKey === `${d.id}:docx`}
                    onClick={() => {
                      void exportDoc(d, 'docx');
                    }}
                  >
                    {exportBusyKey === `${d.id}:docx` ? 'Preparing DOCX...' : d.kind === 'CV' ? `${activeMode.toUpperCase()} DOCX` : 'DOCX'}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="document-list">
        <h2>Uploaded files</h2>
        {docs.length === 0 ? (
          <article className="card">
            <p className="muted">Your uploaded CV will appear here. Jobiest will never invent its content.</p>
          </article>
        ) : (
          docs.map((d) => (
            <article className="card document-row" key={d.id}>
              <div>
                <p className="eyebrow">{d.kind.replace('_', ' ')}</p>
                <h2>{d.original_name}</h2>
                <p className="muted">
                  {Math.ceil(d.byte_size / 1024)} KB &middot; Added {new Date(d.created_at).toLocaleDateString()}
                </p>
              </div>
              <button className="text-button" onClick={() => void download(d.id)}>
                Download
              </button>
            </article>
          ))
        )}
      </section>
    </AppShell>
  );
}
