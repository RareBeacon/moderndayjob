'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AssessmentRoute, InterviewSessionState } from '@/lib/talent-pool/constants';
import styles from './talent-pool.module.css';

interface QuestionItem {
  id: string;
  sequence_no: number;
  competency_key: string;
  competency_label: string;
  difficulty: string;
  question_text: string;
  is_followup: boolean;
  asked_at: string | null;
  answered_at: string | null;
}

interface AnswerItem {
  id: string;
  question_id: string;
  input_modality: 'VOICE' | 'WRITTEN';
  answer_transcript: string;
  duration_seconds: number | null;
  submitted_at: string;
}

interface SessionData {
  id: string;
  application_id: string;
  mode: AssessmentRoute;
  state: InterviewSessionState;
  camera_permission: 'UNCHECKED' | 'GRANTED' | 'DENIED' | 'NOT_APPLICABLE';
  microphone_permission: 'UNCHECKED' | 'GRANTED' | 'DENIED' | 'NOT_APPLICABLE';
  recording_active: boolean;
  current_question_index: number;
  total_questions: number;
  failure_reason?: string | null;
}

interface Props {
  initialDetail: {
    session: SessionData;
    questions: QuestionItem[];
    answers: AnswerItem[];
  };
}

export function InterviewRoomClient({ initialDetail }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData>(initialDetail.session);
  const [questions, setQuestions] = useState<QuestionItem[]>(initialDetail.questions);
  const [answers, setAnswers] = useState<AnswerItem[]>(initialDetail.answers);

  const [answerText, setAnswerText] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [mediaActive, setMediaActive] = useState(false);
  const [segmentCount, setSegmentCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const segIndexRef = useRef<number>(0);
  const questionStartRef = useRef<number>(Date.now());

  const answeredSet = new Set(answers.map((a) => a.question_id));
  const activeQuestion =
    questions.find((q) => !answeredSet.has(q.id)) ?? questions[questions.length - 1] ?? null;
  const allAnswered = questions.length > 0 && questions.every((q) => answeredSet.has(q.id));

  function stopAllMedia() {
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;
    setListening(false);

    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch {}
    recorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setMediaActive(false);
  }

  useEffect(() => {
    return () => {
      stopAllMedia();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Speak active question aloud when voice output is enabled and session is IN_PROGRESS.
  useEffect(() => {
    if (
      session.state === 'IN_PROGRESS' &&
      activeQuestion &&
      !answeredSet.has(activeQuestion.id) &&
      voiceEnabled &&
      session.mode !== 'ACCESSIBLE_WRITTEN' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(activeQuestion.question_text);
        utter.rate = 0.98;
        window.speechSynthesis.speak(utter);
      } catch {}
    }
    questionStartRef.current = Date.now();
  }, [activeQuestion?.id, session.state, voiceEnabled, session.mode]);

  // Keep-alive heartbeat & network-drop detection during IN_PROGRESS.
  useEffect(() => {
    if (session.state !== 'IN_PROGRESS') return;

    const hb = window.setInterval(() => {
      void fetch(`/api/talent-pool/interviews/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'HEARTBEAT' }),
      }).catch(() => {});
    }, 45_000);

    const onOffline = () => {
      stopAllMedia();
      setBanner({
        kind: 'err',
        text: 'Network connection interrupted. Recording paused so your session is safe; reconnect to resume.',
      });
    };

    const onOnline = () => {
      setBanner({ kind: 'info', text: 'Connection restored. Your progress is saved and ready to continue.' });
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(hb);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [session.id, session.state]);

  function applyDetail(detail: { session: SessionData; questions: QuestionItem[]; answers: AnswerItem[] }) {
    setSession(detail.session);
    setQuestions(detail.questions ?? []);
    setAnswers(detail.answers ?? []);
  }

  async function handleRunPrecheck(switchToWritten = false) {
    setBusy(true);
    setBanner(null);

    if (switchToWritten || session.mode === 'ACCESSIBLE_WRITTEN') {
      try {
        const res = await fetch(`/api/talent-pool/interviews/${session.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            camera_permission: 'NOT_APPLICABLE',
            microphone_permission: 'NOT_APPLICABLE',
            switch_to_accessible_written: true,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          applyDetail(json);
          setBanner({ kind: 'ok', text: 'Accessible Written route ready. No camera or microphone is used.' });
        } else {
          setBanner({ kind: 'err', text: json.message ?? 'Unable to update route.' });
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      const needVideo = session.mode === 'VIDEO_VOICE';
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: needVideo ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } } : false,
      });
      streamRef.current = stream;
      if (videoRef.current && needVideo) {
        videoRef.current.srcObject = stream;
      }

      const res = await fetch(`/api/talent-pool/interviews/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_permission: needVideo ? 'GRANTED' : 'NOT_APPLICABLE',
          microphone_permission: 'GRANTED',
        }),
      });
      const json = await res.json();
      if (res.ok) {
        applyDetail(json);
        setBanner({
          kind: 'ok',
          text: 'Device permissions verified. Recording has NOT started yet; click Start Interview when ready.',
        });
      } else {
        setBanner({ kind: 'err', text: json.message ?? 'Precheck validation failed.' });
      }
    } catch {
      await fetch(`/api/talent-pool/interviews/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camera_permission: session.mode === 'VIDEO_VOICE' ? 'DENIED' : 'NOT_APPLICABLE',
          microphone_permission: 'DENIED',
        }),
      }).catch(() => {});
      setBanner({
        kind: 'err',
        text: 'Camera or microphone permission was denied. Allow browser access and retry, or switch to the Accessible Written Assessment below.',
      });
    } finally {
      setBusy(false);
    }
  }

  function startChunkedRecording(activeStream: MediaStream) {
    if (typeof MediaRecorder === 'undefined') return;
    const candidates = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4', 'audio/webm', 'audio/mp4'];
    const mimeType = candidates.find((c) => MediaRecorder.isTypeSupported(c)) || '';
    const recorder = mimeType ? new MediaRecorder(activeStream, { mimeType }) : new MediaRecorder(activeStream);

    recorder.ondataavailable = (ev: BlobEvent) => {
      if (!ev.data || ev.data.size === 0) return;
      const idx = segIndexRef.current++;
      const fd = new FormData();
      fd.append('segment', ev.data, `segment-${idx}.webm`);
      fd.append('segment_index', String(idx));
      if (activeQuestion?.id) fd.append('question_id', activeQuestion.id);
      fd.append('duration_ms', '15000');

      void fetch(`/api/talent-pool/interviews/${session.id}/recordings`, {
        method: 'POST',
        body: fd,
      })
        .then((r) => {
          if (r.ok) setSegmentCount((c) => c + 1);
        })
        .catch(() => {});
    };

    recorder.start(15_000);
    recorderRef.current = recorder;
    setMediaActive(true);
  }

  async function handleStartSession() {
    setBusy(true);
    setBanner(null);
    try {
      if (session.mode !== 'ACCESSIBLE_WRITTEN' && !streamRef.current) {
        const needVideo = session.mode === 'VIDEO_VOICE';
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: needVideo ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } } : false,
        });
        streamRef.current = stream;
        if (videoRef.current && needVideo) {
          videoRef.current.srcObject = stream;
        }
      }

      const res = await fetch(`/api/talent-pool/interviews/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'START' }),
      });
      const json = await res.json();
      if (res.ok) {
        applyDetail(json);
        if (session.mode !== 'ACCESSIBLE_WRITTEN' && streamRef.current) {
          startChunkedRecording(streamRef.current);
        }
      } else {
        setBanner({ kind: 'err', text: json.message ?? 'Could not start interview session.' });
      }
    } catch {
      setBanner({
        kind: 'err',
        text: 'Unable to activate media devices. Retry permission check or switch to the Accessible Written route.',
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleSpeechToText() {
    if (listening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setBanner({
        kind: 'info',
        text: 'Live browser speech recognition is not supported in this browser; type or edit your answer directly in the response box below.',
      });
      return;
    }

    const rec = new SpeechRec() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (ev) => {
      let appended = '';
      for (let i = 0; i < ev.results.length; i += 1) {
        const resItem = ev.results[i];
        if (resItem.isFinal && resItem[0]?.transcript) {
          appended += ` ${resItem[0].transcript}`;
        }
      }
      if (appended.trim()) {
        setAnswerText((prev) => `${prev} ${appended}`.trim());
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  }

  async function handleSubmitAnswer() {
    if (!activeQuestion) return;
    if (answerText.trim().length < 5) {
      setBanner({ kind: 'err', text: 'Please speak or enter a substantive response before advancing.' });
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    }

    setBusy(true);
    setBanner(null);
    const elapsedSec = Math.max(1, Math.round((Date.now() - questionStartRef.current) / 1000));

    try {
      const res = await fetch(`/api/talent-pool/interviews/${session.id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: activeQuestion.id,
          input_modality: session.mode === 'ACCESSIBLE_WRITTEN' ? 'WRITTEN' : 'VOICE',
          answer_transcript: answerText.trim(),
          duration_seconds: elapsedSec,
          stt_provider: session.mode === 'ACCESSIBLE_WRITTEN' ? 'written' : 'speech-to-text',
          stt_confidence: 0.9,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setAnswerText('');
        applyDetail(json);
      } else {
        setBanner({ kind: 'err', text: json.message ?? 'Could not save answer. Your text is preserved; retry.' });
      }
    } catch {
      setBanner({ kind: 'err', text: 'Network error while saving answer. Your response stays in the box; click Submit Answer again.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalizeSubmission() {
    setBusy(true);
    setBanner(null);
    stopAllMedia();
    try {
      const res = await fetch(`/api/talent-pool/interviews/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'COMPLETE_AND_SUBMIT' }),
      });
      const json = await res.json();
      if (res.ok) {
        applyDetail(json);
        setBanner({
          kind: 'ok',
          text: 'Assessment completed and submitted to the Jobiest review team.',
        });
      } else {
        setBanner({ kind: 'err', text: json.message ?? 'Could not finalize submission.' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryOrCancel(action: 'RETRY' | 'CANCEL') {
    setBusy(true);
    stopAllMedia();
    try {
      const res = await fetch(`/api/talent-pool/interviews/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok) {
        setCancelConfirmOpen(false);
        applyDetail(json);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <Link href="/talent-pool" className={styles.secondaryBtn}>
          Back to Talent Pool
        </Link>
        <span className={styles.statusPill}>
          Session state: <strong>{session.state}</strong> · Route: {session.mode.replace(/_/g, ' ')}
        </span>
      </div>

      {session.state === 'IN_PROGRESS' && session.recording_active && mediaActive && (
        <div className={styles.recordingBanner} role="status" aria-live="polite">
          <span>
            <span className={styles.recordingDot} aria-hidden="true" />
            RECORDING ACTIVE: Audio{session.mode === 'VIDEO_VOICE' ? ' & Video' : ''} is being securely recorded for
            authorized Jobiest human review ({segmentCount} encrypted segment{segmentCount === 1 ? '' : 's'} saved).
          </span>
          <button type="button" className={styles.secondaryBtn} onClick={() => setCancelConfirmOpen(true)}>
            Stop &amp; cancel session
          </button>
        </div>
      )}

      {banner && (
        <div
          role="alert"
          className={
            banner.kind === 'ok'
              ? styles.alertSuccess
              : banner.kind === 'info'
                ? styles.alertInfo
                : styles.alertError
          }
        >
          {banner.text}
        </div>
      )}

      {(session.state === 'CREATED' || session.state === 'PRECHECK') && (
        <section className={styles.panel}>
          <span className={styles.eyebrow}>Step 1 · Device &amp; Accessibility Precheck</span>
          <h1 className={styles.sectionTitle} style={{ fontSize: 26, marginTop: 10 }}>
            Verify permissions before your assessment starts
          </h1>
          <p className={styles.sectionSub} style={{ marginBottom: 18 }}>
            Jobiest never records without your knowledge. Nothing is recorded during this precheck; recording starts
            only after you click <strong>Start Interview</strong> on the next screen.
          </p>

          {session.mode === 'VIDEO_VOICE' && (
            <div style={{ marginBottom: 16 }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: '100%',
                  maxWidth: 420,
                  borderRadius: 12,
                  background: '#070d1c',
                  border: '1px solid var(--color-line)',
                }}
              />
            </div>
          )}

          <div className={styles.ctaRow}>
            {session.mode !== 'ACCESSIBLE_WRITTEN' ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className={styles.primaryBtn}
                  onClick={() => void handleRunPrecheck(false)}
                >
                  {busy ? 'Checking permissions...' : 'Check Camera & Microphone Permissions'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={styles.secondaryBtn}
                  onClick={() => void handleRunPrecheck(true)}
                >
                  Use Accessible Written Route Instead (No Audio/Video)
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy}
                className={styles.primaryBtn}
                onClick={() => void handleRunPrecheck(true)}
              >
                {busy ? 'Preparing...' : 'Confirm Accessible Written Route'}
              </button>
            )}
          </div>
        </section>
      )}

      {session.state === 'READY' && (
        <section className={styles.panel}>
          <span className={styles.eyebrow}>Step 2 · Ready to Begin</span>
          <h1 className={styles.sectionTitle} style={{ fontSize: 26, marginTop: 10 }}>
            Your personalized competency interview is ready
          </h1>
          <p className={styles.sectionSub} style={{ marginBottom: 18 }}>
            {session.mode === 'ACCESSIBLE_WRITTEN'
              ? 'You will answer 5 role-calibrated questions in writing (plus up to 2 clarifying follow-ups if needed). Your progress saves after every question.'
              : 'When you click Start Interview below, active recording will turn on with a clear banner on screen, and your AI interviewer will read each question aloud with captions.'}
          </p>
          <div className={styles.ctaRow}>
            <button type="button" disabled={busy} className={styles.primaryBtn} onClick={() => void handleStartSession()}>
              {busy ? 'Initializing questions...' : 'Start Interview'}
            </button>
          </div>
        </section>
      )}

      {session.state === 'IN_PROGRESS' && (
        <div className={styles.twoCol}>
          <section className={styles.panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className={styles.eyebrow}>
                Progress: {answers.length} of {questions.length} answered
              </span>
              {session.mode !== 'ACCESSIBLE_WRITTEN' && (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setVoiceEnabled((v) => !v)}
                >
                  AI Voice: {voiceEnabled ? 'On' : 'Muted'}
                </button>
              )}
            </div>

            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: '#e2e6ed',
                overflow: 'hidden',
                marginBottom: 18,
              }}
            >
              <div
                style={{
                  width: `${questions.length > 0 ? Math.round((answers.length / questions.length) * 100) : 0}%`,
                  height: '100%',
                  background: 'var(--color-primary-navy)',
                }}
              />
            </div>

            {!allAnswered && activeQuestion ? (
              <>
                <div className={styles.statusCard} style={{ marginBottom: 16 }}>
                  <div className={styles.statusHeader}>
                    <span className={styles.statusLabel}>
                      Question {activeQuestion.sequence_no} · {activeQuestion.competency_label}
                    </span>
                    <span className={styles.statusPill}>{activeQuestion.difficulty}</span>
                  </div>
                  <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-primary-navy)', lineHeight: 1.5 }}>
                    {activeQuestion.question_text}
                  </p>
                </div>

                {session.mode !== 'ACCESSIBLE_WRITTEN' && (
                  <div style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" className={styles.secondaryBtn} onClick={toggleSpeechToText}>
                      {listening ? 'Stop Live Dictation' : 'Speak Answer (Start Speech-to-Text)'}
                    </button>
                    <span className={styles.hint}>
                      {listening ? 'Listening to your microphone... review or edit your transcript below.' : 'Speak with dictation or type/refine your transcript below.'}
                    </span>
                  </div>
                )}

                <div className={styles.field}>
                  <label htmlFor="tp-answer-box">
                    {session.mode === 'ACCESSIBLE_WRITTEN' ? 'Your written response' : 'Your transcribed response (editable before submitting)'}
                  </label>
                  <textarea
                    id="tp-answer-box"
                    rows={6}
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Share the specific context, actions you personally took, technical trade-offs, and measurable results..."
                  />
                </div>

                <div className={styles.ctaRow}>
                  <button
                    type="button"
                    disabled={busy}
                    className={styles.primaryBtn}
                    onClick={() => void handleSubmitAnswer()}
                  >
                    {busy ? 'Saving answer...' : 'Save Answer & Next Question'}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.statusCard}>
                <h2 className={styles.sectionTitle}>All interview questions answered</h2>
                <p className={styles.sectionSub} style={{ marginTop: 8, marginBottom: 16 }}>
                  You have answered all {questions.length} competency prompts. Submit your completed assessment now to
                  stop recording, generate your structured evaluation report, and send your application to human review.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className={styles.primaryBtn}
                  onClick={() => void handleFinalizeSubmission()}
                >
                  {busy ? 'Generating report & submitting...' : 'Submit Assessment for Human Review'}
                </button>
              </div>
            )}
          </section>

          <aside className={styles.panel}>
            {session.mode === 'VIDEO_VOICE' && (
              <div style={{ marginBottom: 16 }}>
                <span className={styles.statusLabel}>Camera preview</span>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    background: '#070d1c',
                    marginTop: 6,
                    border: '1px solid var(--color-line)',
                  }}
                />
              </div>
            )}

            <h3 style={{ fontSize: 16, marginBottom: 10 }}>Question tracker</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {questions.map((q) => {
                const done = answeredSet.has(q.id);
                const isCurrent = activeQuestion?.id === q.id && !allAnswered;
                return (
                  <li
                    key={q.id}
                    className={styles.checkItem}
                    style={{
                      borderColor: isCurrent ? 'var(--color-primary-navy)' : undefined,
                      background: done ? 'var(--color-success-bg)' : undefined,
                    }}
                  >
                    <span>
                      Q{q.sequence_no}: {q.competency_label}
                    </span>
                    <strong>{done ? 'Saved' : isCurrent ? 'Current' : 'Upcoming'}</strong>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}

      {(session.state === 'RETRY_PENDING' || session.state === 'FAILED') && (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Session paused safely</h2>
          <p className={styles.sectionSub} style={{ marginTop: 8, marginBottom: 16 }}>
            {session.failure_reason || 'Your session experienced a temporary interruption.'} All previously saved
            answers ({answers.length} of {questions.length}) are preserved, and incomplete interviews are never treated
            as completed assessments.
          </p>
          <div className={styles.ctaRow}>
            <button
              type="button"
              disabled={busy}
              className={styles.primaryBtn}
              onClick={() => void handleRetryOrCancel('RETRY')}
            >
              Resume Session
            </button>
            <button
              type="button"
              disabled={busy}
              className={styles.secondaryBtn}
              onClick={() => void handleRetryOrCancel('CANCEL')}
            >
              Cancel Session
            </button>
          </div>
        </section>
      )}

      {session.state === 'SUBMITTED_FOR_REVIEW' && (
        <section className={styles.panel}>
          <span className={`${styles.statusPill} ${styles.tone_success}`}>Submitted for human review</span>
          <h1 className={styles.sectionTitle} style={{ fontSize: 26, marginTop: 12 }}>
            Thank you. Your assessment is now in the review queue.
          </h1>
          <p className={styles.sectionSub} style={{ marginTop: 8, marginBottom: 18 }}>
            Recording has stopped. A Jobiest administrator will review your application snapshot, answers, and
            competency report before making an approval decision.
          </p>
          <button type="button" className={styles.primaryBtn} onClick={() => router.push('/talent-pool')}>
            Return to Talent Pool Dashboard
          </button>
        </section>
      )}

      {session.state === 'CANCELLED' && (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Interview session cancelled</h2>
          <p className={styles.sectionSub} style={{ marginTop: 8, marginBottom: 16 }}>
            This session was cancelled before completion and has not been submitted for review. You can launch a fresh
            session anytime from your Talent Pool hub.
          </p>
          <Link href="/talent-pool" className={styles.primaryBtn}>
            Return to Talent Pool
          </Link>
        </section>
      )}

      {cancelConfirmOpen && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalDialog}>
            <h3 className={styles.sectionTitle} style={{ fontSize: 19 }}>
              Cancel active interview session?
            </h3>
            <p className={styles.sectionSub} style={{ marginTop: 8, marginBottom: 16 }}>
              Recording will stop immediately and this incomplete session will be marked Cancelled (never submitted as a
              completed assessment). You can start a new session later from your Talent Pool hub.
            </p>
            <div className={styles.ctaRow} style={{ justifyContent: 'flex-end' }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setCancelConfirmOpen(false)}>
                Continue interview
              </button>
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={busy}
                onClick={() => void handleRetryOrCancel('CANCEL')}
              >
                Confirm cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
