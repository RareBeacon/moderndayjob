'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface RecordingMeta {
  id: string;
  segment_index: number;
  mime_type: string;
  byte_size: number;
  has_video: boolean;
}

export function AdminReviewDecisionClient({
  applicationId,
  currentStatus,
  recordings,
}: {
  applicationId: string;
  currentStatus: string;
  recordings: RecordingMeta[];
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT' | 'REQUEST_REASSESSMENT'>('APPROVE');
  const [reason, setReason] = useState('');
  const [candidateFeedback, setCandidateFeedback] = useState('');
  const [reassessmentInstructions, setReassessmentInstructions] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingRec, setLoadingRec] = useState<string | null>(null);

  async function handleLoadRecording(recordingId: string) {
    setLoadingRec(recordingId);
    try {
      const res = await fetch(`/api/admin/talent-pool/recordings/${recordingId}`);
      const json = (await res.json().catch(() => ({}))) as { signedUrl?: string; message?: string };
      if (res.ok && json.signedUrl) {
        setSignedUrls((prev) => ({ ...prev, [recordingId]: json.signedUrl! }));
      } else {
        setMessage({ ok: false, text: json.message ?? 'Could not mint signed playback URL.' });
      }
    } finally {
      setLoadingRec(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (decision !== 'APPROVE' && reason.trim().length < 10) {
      setMessage({
        ok: false,
        text: 'A clear reason (at least 10 characters) is required when rejecting or requesting reassessment.',
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/talent-pool/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          reason: reason.trim() || undefined,
          candidate_feedback: candidateFeedback.trim() || undefined,
          reassessment_instructions: reassessmentInstructions.trim() || undefined,
          internal_notes: internalNotes.trim() || undefined,
          assign_to_self: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { newStatus?: string; message?: string };
      if (res.ok) {
        setMessage({ ok: true, text: `Decision recorded: ${currentStatus} -> ${json.newStatus}.` });
        router.refresh();
      } else {
        setMessage({ ok: false, text: json.message ?? 'Could not record administrator decision.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 24, marginTop: 24 }}>
      <section className="card">
        <h2 style={{ fontSize: 19, marginBottom: 8 }}>Authorized Interview Recordings (Audited Signed Access)</h2>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
          Every recording access is recorded in <code>audit_logs</code> and expires after 90 seconds. Recordings are
          never shared with employers.
        </p>

        {recordings.length === 0 ? (
          <p className="muted">No audio/video segments attached (Accessible Written route or no segments uploaded).</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {recordings.map((rec) => (
              <div key={rec.id} style={{ border: '1px solid var(--line)', padding: 12, borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span className="ad-mono">
                    Segment #{rec.segment_index} · {rec.mime_type} · {Math.round(rec.byte_size / 1024)} KB
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={loadingRec === rec.id}
                    onClick={() => void handleLoadRecording(rec.id)}
                  >
                    {loadingRec === rec.id ? 'Minting signed URL...' : 'Authorize 90s playback'}
                  </button>
                </div>
                {signedUrls[rec.id] && (
                  <div style={{ marginTop: 10 }}>
                    {rec.has_video ? (
                      <video controls src={signedUrls[rec.id]} style={{ width: '100%', maxWidth: 480, borderRadius: 8 }} />
                    ) : (
                      <audio controls src={signedUrls[rec.id]} style={{ width: '100%' }} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <form onSubmit={(e) => void handleSubmit(e)} className="card">
        <h2 style={{ fontSize: 19, marginBottom: 8 }}>Administrator Review Decision</h2>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>
          Current status: <strong>{currentStatus}</strong>. Reviewer ID, timestamp, previous status, and new status are
          permanently audited.
        </p>

        {message && (
          <div
            role="status"
            style={{
              padding: '10px 14px',
              marginBottom: 14,
              borderRadius: 8,
              background: message.ok ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: message.ok ? 'var(--success)' : 'var(--danger)',
              fontSize: 14,
            }}
          >
            {message.text}
          </div>
        )}

        <div style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 13.5 }}>
            Action
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as 'APPROVE' | 'REJECT' | 'REQUEST_REASSESSMENT')}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
            >
              <option value="APPROVE">APPROVE (make candidate eligible for verified employer discovery)</option>
              <option value="REQUEST_REASSESSMENT">REQUEST_REASSESSMENT (invite candidate to re-interview)</option>
              <option value="REJECT">REJECT (decline application with documented reason)</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 13.5 }}>
            Decision reason {decision !== 'APPROVE' ? '(Required, min 10 chars)' : '(Optional)'}
            <textarea
              rows={3}
              required={decision !== 'APPROVE'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Documented rationale for this decision..."
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit' }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 13.5 }}>
            Candidate-facing feedback (visible to candidate)
            <textarea
              rows={2}
              value={candidateFeedback}
              onChange={(e) => setCandidateFeedback(e.target.value)}
              placeholder="Constructive feedback shared on the candidate's Talent Pool history..."
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit' }}
            />
          </label>

          {decision === 'REQUEST_REASSESSMENT' && (
            <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 13.5 }}>
              Reassessment instructions (visible to candidate)
              <textarea
                rows={2}
                value={reassessmentInstructions}
                onChange={(e) => setReassessmentInstructions(e.target.value)}
                placeholder="Explain what the candidate should clarify or ensure on their next session..."
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit' }}
              />
            </label>
          )}

          <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 13.5 }}>
            Confidential internal administrator notes (NEVER shown to candidate or employers)
            <textarea
              rows={2}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Internal calibration or moderation notes..."
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', font: 'inherit' }}
            />
          </label>

          <div>
            <button type="submit" disabled={submitting} className="btn">
              {submitting ? 'Recording audited decision...' : `Confirm ${decision}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
