import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUserOrRedirect } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { AdminShell, AdminForbidden } from '@/components/site/AdminShell';
import { getAdminTalentApplicationDetail } from '@/lib/talent-pool/admin-service';
import { AdminReviewDecisionClient } from './AdminReviewDecisionClient';

export const dynamic = 'force-dynamic';

export default async function AdminTalentApplicationReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const user = await requireUserOrRedirect(`/admin/talent-pool/${id}`);
  const { data: admin } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!admin) return <AdminForbidden />;

  let detail;
  try {
    detail = await getAdminTalentApplicationDetail(user.id, id);
  } catch {
    notFound();
  }

  const app = detail.application as Record<string, unknown>;
  const profile = (detail.profile ?? {}) as Record<string, unknown>;
  const snapRow = (detail.snapshot ?? {}) as { snapshot_data?: Record<string, unknown>; completeness_score?: number };
  const snap = snapRow.snapshot_data ?? {};
  const latestReport = ((detail.reports as Array<Record<string, unknown>>)[0] ?? null);
  const dimensions = detail.dimensions as Array<{
    id: string;
    dimension_label: string;
    score: number;
    confidence: number;
    rationale: string;
    evidence_quotes: string[];
  }>;
  const questions = detail.questions as Array<{
    id: string;
    sequence_no: number;
    competency_label: string;
    difficulty: string;
    question_text: string;
  }>;
  const answers = detail.answers as Array<{
    id: string;
    question_id: string;
    input_modality: string;
    answer_transcript: string;
    duration_seconds: number | null;
  }>;
  const transcripts = detail.transcripts as Array<{
    id: string;
    turn_index: number;
    speaker: string;
    content: string;
  }>;
  const reviews = detail.reviews as Array<{
    id: string;
    reviewer_id: string;
    decision: string;
    reason: string | null;
    previous_status: string;
    new_status: string;
    internal_notes: string | null;
    created_at: string;
  }>;

  const answerByQuestion = new Map(answers.map((a) => [a.question_id, a]));

  return (
    <AdminShell active="talent-pool">
      <p style={{ marginBottom: 12 }}>
        <Link href="/admin/talent-pool" className="inline-link">Back to Talent Pool queue</Link>
      </p>
      <h1 className="ad-h1">{String(profile.full_name ?? 'Candidate Application')}</h1>
      <p className="ad-lede">
        Application <code>{String(app.id)}</code> · Status: <strong>{String(app.status)}</strong> · Route:{' '}
        <strong>{String(app.assessment_route)}</strong> · Email: {String(profile.email ?? '-')}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 22 }}>
        <section className="card">
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Candidate Profile &amp; Original Snapshot</h2>
          <p style={{ fontSize: 13.5, marginBottom: 6 }}>
            <strong>Headline:</strong> {String(snap.headline ?? '-')}
          </p>
          <p style={{ fontSize: 13.5, marginBottom: 6 }}>
            <strong>Category &amp; Level:</strong> {String(snap.career_category ?? '-')} · {String(snap.seniority_level ?? '-')} ({String(snap.years_of_experience ?? 0)} yrs)
          </p>
          <p style={{ fontSize: 13.5, marginBottom: 6 }}>
            <strong>Location:</strong> {String(snap.location ?? '-')}, {String(snap.country ?? '-')} ({String(snap.time_zone ?? 'UTC')})
          </p>
          <p style={{ fontSize: 13.5, marginBottom: 6 }}>
            <strong>Skills:</strong> {Array.isArray(snap.skills) ? snap.skills.join(', ') : '-'}
          </p>
          <p style={{ fontSize: 13.5, marginBottom: 6 }}>
            <strong>Competencies:</strong> {Array.isArray(snap.technical_competencies) ? snap.technical_competencies.join(', ') : '-'}
          </p>
          <p style={{ fontSize: 13.5 }}>
            <strong>Snapshot completeness:</strong> {snapRow.completeness_score ?? 0}%
          </p>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Assessment Report &amp; Flags</h2>
          {latestReport ? (
            <>
              <p style={{ fontSize: 15, marginBottom: 8 }}>
                <strong>Overall Score:</strong> {String(latestReport.overall_score)}/100 ·{' '}
                <strong>Calibrated Level:</strong> {String(latestReport.calibrated_level)} ·{' '}
                <strong>AI Confidence:</strong> {Math.round(Number(latestReport.ai_confidence ?? 0) * 100)}%
              </p>
              <p style={{ fontSize: 13.5, marginBottom: 10 }}>{String(latestReport.executive_summary)}</p>
              <p style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Evidence limitations:</strong>{' '}
                {Array.isArray(latestReport.evidence_limitations) ? latestReport.evidence_limitations.join(' | ') : 'None'}
              </p>
              <p style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Technical flags:</strong>{' '}
                {Array.isArray(latestReport.technical_flags) && latestReport.technical_flags.length > 0
                  ? latestReport.technical_flags.join(' | ')
                  : 'None'}
              </p>
              <p style={{ fontSize: 13 }}>
                <strong>Integrity / consistency flags:</strong>{' '}
                {Array.isArray(latestReport.integrity_flags) && latestReport.integrity_flags.length > 0
                  ? latestReport.integrity_flags.join(' | ')
                  : 'None'}
              </p>
            </>
          ) : (
            <p className="muted">Assessment report has not been generated yet.</p>
          )}
        </section>
      </div>

      {dimensions.length > 0 && (
        <section className="card" style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Scoring Explanations by Competency Dimension</h2>
          <div className="ad-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Dimension</th>
                  <th>Score</th>
                  <th>Confidence</th>
                  <th>Scoring Explanation &amp; Evidence</th>
                </tr>
              </thead>
              <tbody>
                {dimensions.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.dimension_label}</strong></td>
                    <td className="ad-mono">{d.score}/100</td>
                    <td className="ad-mono">{Math.round(Number(d.confidence) * 100)}%</td>
                    <td>
                      <div>{d.rationale}</div>
                      {Array.isArray(d.evidence_quotes) && d.evidence_quotes[0] && (
                        <small className="muted">Excerpt: &ldquo;{d.evidence_quotes[0]}&rdquo;</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card" style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>AI-Generated Questions &amp; Individual Candidate Answers</h2>
        {questions.length === 0 ? (
          <p className="muted">No interview questions generated yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {questions.map((q) => {
              const ans = answerByQuestion.get(q.id);
              return (
                <div key={q.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
                    Q{q.sequence_no} · {q.competency_label} ({q.difficulty})
                  </div>
                  <p style={{ fontWeight: 600, marginBottom: 8 }}>{q.question_text}</p>
                  {ans ? (
                    <p style={{ fontSize: 14, background: 'var(--bg)', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}>
                      <strong>Candidate ({ans.input_modality}):</strong> {ans.answer_transcript}
                    </p>
                  ) : (
                    <p className="muted">Unanswered</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card" style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Full Interview Transcript</h2>
        {transcripts.length === 0 ? (
          <p className="muted">No transcript turns recorded yet.</p>
        ) : (
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {transcripts.map((t) => (
              <div key={t.id} style={{ fontSize: 13.5 }}>
                <span className="ad-mono">[{t.turn_index}] {t.speaker}:</span> {t.content}
              </div>
            ))}
          </div>
        )}
      </section>

      <AdminReviewDecisionClient
        applicationId={String(app.id)}
        currentStatus={String(app.status)}
        recordings={detail.recordings as never}
      />

      {reviews.length > 0 && (
        <section className="card" style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Audit History of Administrator Decisions</h2>
          <div className="ad-scroll">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Reviewer</th>
                  <th>Decision</th>
                  <th>Transition</th>
                  <th>Reason</th>
                  <th>Internal Notes (Confidential)</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((rev) => (
                  <tr key={rev.id}>
                    <td className="ad-mono">{rev.created_at.slice(0, 19).replace('T', ' ')}</td>
                    <td className="ad-mono">{rev.reviewer_id.slice(0, 8)}</td>
                    <td><span className="ad-chip">{rev.decision}</span></td>
                    <td className="ad-mono">{rev.previous_status} -&gt; {rev.new_status}</td>
                    <td>{rev.reason ?? '-'}</td>
                    <td>{rev.internal_notes ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AdminShell>
  );
}
