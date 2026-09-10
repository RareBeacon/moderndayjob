'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FreeToolAuthGate } from './FreeToolAuthGate';
import { getFreeToolConfig, type FreeToolConfig, type FreeToolId, type FreeToolQuestion } from '@/lib/free-tools/config';

type Stage = 'intro' | 'questions' | 'review' | 'generating' | 'output';
type PendingAction = 'copy' | 'download' | 'save';

type Answers = Record<string, string | string[]>;

interface GenerationResult {
  toolId: FreeToolId;
  title: string;
  outputType: string;
  result: { summary?: string; sections: { heading: string; body?: string; items?: string[] }[]; data?: unknown };
  resultText: string;
  provider: string;
  nextSteps: { label: string; href: string }[];
  authenticated?: boolean;
}

function anonymousId() {
  if (typeof window === 'undefined') return '';
  const key = 'jobiest.freeTools.anonymousId';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, id);
  return id;
}

function textValue(value: unknown) {
  if (Array.isArray(value)) return value.join(', ').trim();
  if (value == null) return '';
  return String(value).trim();
}

function completion(index: number, total: number, stage: Stage) {
  if (stage === 'intro') return 0;
  if (stage === 'review') return 82;
  if (stage === 'generating') return 92;
  if (stage === 'output') return 100;
  return Math.round(((index + 1) / Math.max(1, total)) * 75);
}

function storageKey(toolId: string) {
  return `jobiest.freeTools.${toolId}.session`;
}

export function FreeToolExperience({ toolId, signedIn }: { toolId: FreeToolId; signedIn: boolean }) {
  const tool = useMemo(() => getFreeToolConfig(toolId), [toolId]);
  const [stage, setStage] = useState<Stage>('intro');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState('');
  const [gateAction, setGateAction] = useState<PendingAction | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState('');
  const [progressStep, setProgressStep] = useState(0);
  const [anonId, setAnonId] = useState('');
  const startedAt = useRef<number>(Date.now());

  const question = tool.questions[questionIndex];
  const percent = completion(questionIndex, tool.questions.length, stage);
  const canContinue = stage !== 'questions' || isQuestionValid(question, answers[question.id]);

  useEffect(() => {
    const id = anonymousId();
    setAnonId(id);
    const saved = window.localStorage.getItem(storageKey(toolId));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { stage?: Stage; questionIndex?: number; answers?: Answers; result?: GenerationResult; pendingAction?: PendingAction };
        setAnswers(parsed.answers ?? {});
        setQuestionIndex(Math.min(parsed.questionIndex ?? 0, tool.questions.length - 1));
        setResult(parsed.result ?? null);
        setPendingAction(parsed.pendingAction ?? null);
        if (parsed.result) setStage('output');
        else if (parsed.stage && parsed.stage !== 'generating') setStage(parsed.stage);
      } catch {}
    }
    trackEvent('free_tool_viewed', { anonymousId: id, step: 'intro' });
  }, [toolId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey(toolId), JSON.stringify({ stage, questionIndex, answers, result, pendingAction }));
  }, [toolId, stage, questionIndex, answers, result, pendingAction]);

  useEffect(() => {
    if (stage !== 'generating') return;
    setProgressStep(0);
    const timer = setInterval(() => setProgressStep((value) => Math.min(tool.progressMessages.length - 1, value + 1)), 650);
    return () => clearInterval(timer);
  }, [stage, tool.progressMessages.length]);

  useEffect(() => {
    if (!signedIn || !result) return;
    const params = new URLSearchParams(window.location.search);
    const unlock = params.get('unlock') as PendingAction | null;
    const action = pendingAction ?? (unlock === 'copy' || unlock === 'download' || unlock === 'save' ? unlock : null);
    if (action) {
      setPendingAction(null);
      void performUnlockedAction(action, true);
    }
  }, [signedIn, result]);

  function track(eventName: string, metadata: Record<string, unknown> = {}) {
    trackEvent(eventName, { anonymousId: anonId, step: stage === 'questions' ? question?.id : stage, completionRate: percent, metadata });
  }

  function updateAnswer(id: string, value: string | string[]) {
    setAnswers((current) => ({ ...current, [id]: value }));
    track('free_tool_question_answered', { questionId: id });
  }

  function start() {
    startedAt.current = Date.now();
    setStage('questions');
    setQuestionIndex(0);
    track('free_tool_started');
  }

  function next() {
    setError('');
    if (!canContinue) {
      setError(contextMessage(question));
      return;
    }
    if (questionIndex >= tool.questions.length - 1) {
      setStage('review');
      return;
    }
    setQuestionIndex((i) => i + 1);
  }

  function back() {
    setError('');
    if (stage === 'review') {
      setStage('questions');
      setQuestionIndex(tool.questions.length - 1);
      return;
    }
    if (stage === 'questions' && questionIndex > 0) setQuestionIndex((i) => i - 1);
    else setStage('intro');
  }

  async function generate() {
    setStage('generating');
    setError('');
    setNotice('');
    track('free_tool_generation_started');
    try {
      const response = await fetch('/api/free-tools/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId, anonymousId: anonId, answers, startedAt: startedAt.current }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.message ?? 'Something went wrong while I was working on that. Your answers are safe. Let us try again.');
      setResult(json as GenerationResult);
      setStage('output');
      track('free_tool_generation_completed', { success: true, timeToCompletionMs: Date.now() - startedAt.current });
    } catch (err) {
      setStage('review');
      setError(err instanceof Error ? err.message : 'Something went wrong while I was working on that. Your answers are safe. Let us try again.');
      track('free_tool_generation_completed', { success: false });
    }
  }

  function requireUnlock(action: PendingAction) {
    track(action === 'copy' ? 'free_tool_copy_clicked' : action === 'download' ? 'free_tool_download_clicked' : 'free_tool_save_clicked');
    if (!result) return;
    if (!signedIn) {
      setPendingAction(action);
      setGateAction(action);
      track('free_tool_auth_gate_shown', { action });
      return;
    }
    void performUnlockedAction(action);
  }

  async function performUnlockedAction(action: PendingAction, afterAuth = false) {
    if (!result) return;
    setNotice('');
    const payload = { action, toolId, anonymousId: anonId, title: result.title, answers, result: result.result, resultText: result.resultText };
    const response = await fetch('/api/free-tools/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (action === 'download' && response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${result.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'jobiest-result'}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice(afterAuth ? 'You are all set. Your download has started.' : 'Download started.');
      track('free_tool_result_unlocked', { action });
      return;
    }
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(json?.message ?? 'Could not unlock that action yet. Try again.');
      return;
    }
    if (action === 'copy') {
      await navigator.clipboard.writeText(result.resultText).catch(() => undefined);
      setNotice(afterAuth ? 'You are all set. Copied.' : 'Copied.');
    } else {
      setNotice(afterAuth ? 'You are all set. Your result is saved.' : 'Saved to your Jobiest account.');
    }
    track('free_tool_result_unlocked', { action });
  }

  function startOver() {
    setStage('intro');
    setQuestionIndex(0);
    setAnswers({});
    setResult(null);
    setError('');
    setNotice('');
    setPendingAction(null);
    window.localStorage.removeItem(storageKey(toolId));
  }

  return (
    <div className="ft2" data-tool={toolId}>
      <div className="ft2-topline">
        <span>{stage === 'intro' ? 'Discover' : stage === 'output' ? 'Unlock' : 'AI-guided workflow'}</span>
        <b>{percent}%</b>
      </div>
      <div className="ft2-progress"><span style={{ width: `${percent}%` }} /></div>

      {stage === 'intro' && <Intro tool={tool} onStart={start} signedIn={signedIn} />}
      {stage === 'questions' && question && (
        <QuestionStep
          tool={tool}
          question={question}
          index={questionIndex}
          total={tool.questions.length}
          value={answers[question.id]}
          onChange={(value) => updateAnswer(question.id, value)}
          onBack={back}
          onNext={next}
          error={error}
        />
      )}
      {stage === 'review' && <ReviewStep tool={tool} answers={answers} onBack={back} onGenerate={generate} onEdit={(index) => { setStage('questions'); setQuestionIndex(index); }} error={error} />}
      {stage === 'generating' && <GeneratingStep tool={tool} progressStep={progressStep} />}
      {stage === 'output' && result && (
        <OutputStep
          tool={tool}
          result={result}
          signedIn={signedIn}
          notice={notice}
          onCopy={() => requireUnlock('copy')}
          onDownload={() => requireUnlock('download')}
          onSave={() => requireUnlock('save')}
          onRegenerate={generate}
          onEdit={() => setStage('questions')}
          onStartOver={startOver}
          onBlockedCopy={() => requireUnlock('copy')}
        />
      )}

      {gateAction && <FreeToolAuthGate tool={tool} action={gateAction} onClose={() => setGateAction(null)} track={track} />}
    </div>
  );
}

function Intro({ tool, onStart, signedIn }: { tool: FreeToolConfig; onStart: () => void; signedIn: boolean }) {
  return (
    <div className="ft2-card ft2-intro">
      <span className="mk-kicker">Discover</span>
      <h2>{tool.introTitle}</h2>
      <p>{tool.intro}</p>
      <div className="ft2-lifecycle"><span>Discover</span><span>Start</span><span>Ask</span><span>Understand</span><span>Generate</span><span>Review</span><span>Unlock</span></div>
      <div className="ft2-actions left"><button className="btn" onClick={onStart}>Let&apos;s Start</button>{!signedIn && <span className="muted">You can preview first. Copy, download and save unlock after a free account.</span>}</div>
    </div>
  );
}

function QuestionStep({ tool, question, index, total, value, onChange, onBack, onNext, error }: { tool: FreeToolConfig; question: FreeToolQuestion; index: number; total: number; value: string | string[] | undefined; onChange: (value: string | string[]) => void; onBack: () => void; onNext: () => void; error: string }) {
  const text = textValue(value);
  const followUps = (question.followUps ?? []).filter((f) => f.when === 'always' || (f.when === 'missing' && !text) || (f.when === 'short' && text.length > 0 && text.length < Math.max(40, question.minLength ?? 0)));
  return (
    <div className="ft2-card ft2-question">
      <span className="mk-kicker">Step {index + 1} of {total} | {tool.name}</span>
      <h2>{question.label}</h2>
      <div className="ft2-ai"><b>AI</b><p>{question.assistant}</p></div>
      {renderInput(question, value, onChange)}
      {question.suggestions?.length ? <SuggestionRow question={question} value={value} onChange={onChange} /> : null}
      {question.why && <p className="muted" style={{ fontSize: 13 }}>{question.why}</p>}
      {followUps.map((f) => <div className="ft2-followup" key={f.message}><strong>One more question</strong><p>{f.message}</p>{f.suggestions?.length ? <div>{f.suggestions.map((s) => <button key={s} onClick={() => onChange(`${text}${text ? ' ' : ''}${s}`)}>{s}</button>)}</div> : null}</div>)}
      {error && <p className="ft2-error">{error}</p>}
      <div className="ft2-actions"><button className="btn secondary" onClick={onBack}>Back</button><button className="btn" onClick={onNext}>Continue</button></div>
    </div>
  );
}

function renderInput(question: FreeToolQuestion, value: string | string[] | undefined, onChange: (value: string | string[]) => void) {
  if (question.type === 'textarea') return <textarea className="ft2-input" rows={7} value={textValue(value)} onChange={(e) => onChange(e.target.value)} placeholder={question.placeholder} />;
  if (question.type === 'number') return <input className="ft2-input" type="number" min={1} value={textValue(value)} onChange={(e) => onChange(e.target.value)} placeholder={question.placeholder} />;
  if (question.type === 'select') return <select className="ft2-input" value={textValue(value)} onChange={(e) => onChange(e.target.value)}><option value="">Choose one</option>{(question.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  if (question.type === 'chips') {
    const selected = Array.isArray(value) ? value : listFromText(textValue(value));
    return <ChipInput selected={selected} suggestions={question.suggestions ?? []} onChange={onChange} />;
  }
  return <input className="ft2-input" value={textValue(value)} onChange={(e) => onChange(e.target.value)} placeholder={question.placeholder} />;
}

function SuggestionRow({ question, value, onChange }: { question: FreeToolQuestion; value: string | string[] | undefined; onChange: (value: string | string[]) => void }) {
  const isChips = question.type === 'chips';
  return <div className="ft2-suggestions">{question.suggestions?.map((s) => <button key={s} onClick={() => isChips ? onChange(toggleInList(Array.isArray(value) ? value : listFromText(textValue(value)), s)) : onChange(s)}>{s}</button>)}</div>;
}

function ChipInput({ selected, suggestions, onChange }: { selected: string[]; suggestions: string[]; onChange: (value: string[]) => void }) {
  const [typed, setTyped] = useState('');
  function add(value: string) {
    const v = value.trim();
    if (!v) return;
    onChange([...selected.filter((s) => s.toLowerCase() !== v.toLowerCase()), v]);
    setTyped('');
  }
  return (
    <div className="ft2-chip-input">
      <div className="ft2-selected">{selected.length ? selected.map((s) => <button key={s} onClick={() => onChange(selected.filter((x) => x !== s))}>{s}<span>×</span></button>) : <span className="muted">No selections yet.</span>}</div>
      <div className="ft2-add"><input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(typed); } }} placeholder="Add your own" /><button className="btn secondary" onClick={() => add(typed)}>Add</button></div>
      <div className="ft2-suggestions">{suggestions.filter((s) => !selected.some((x) => x.toLowerCase() === s.toLowerCase())).slice(0, 10).map((s) => <button key={s} onClick={() => add(s)}>{s}</button>)}</div>
    </div>
  );
}

function ReviewStep({ tool, answers, onBack, onGenerate, onEdit, error }: { tool: FreeToolConfig; answers: Answers; onBack: () => void; onGenerate: () => void; onEdit: (index: number) => void; error: string }) {
  return (
    <div className="ft2-card ft2-review">
      <span className="mk-kicker">Pre-generation review</span>
      <h2>Here&apos;s what I&apos;ve got.</h2>
      <p className="muted">Review the context before generation so the output does not depend on bad assumptions.</p>
      <div className="ft2-review-list">
        {tool.questions.map((q, index) => <button key={q.id} onClick={() => onEdit(index)}><span>{q.label}</span><b>{answerPreview(answers[q.id]) || (q.required ? 'Missing' : 'Not provided')}</b></button>)}
      </div>
      {error && <p className="ft2-error">{error}</p>}
      <div className="ft2-actions"><button className="btn secondary" onClick={onBack}>Edit information</button><button className="btn" onClick={onGenerate}>Looks good, generate</button></div>
    </div>
  );
}

function GeneratingStep({ tool, progressStep }: { tool: FreeToolConfig; progressStep: number }) {
  return (
    <div className="ft2-card ft2-generating">
      <span className="mk-kicker">Generating</span>
      <h2>{tool.progressMessages[progressStep] ?? 'Working on your result'}</h2>
      <div className="ft2-worklist">{tool.progressMessages.map((msg, index) => <p key={msg} className={index <= progressStep ? 'done' : ''}>{index < progressStep ? '✓' : index === progressStep ? '•' : '○'} {msg}</p>)}</div>
    </div>
  );
}

function OutputStep({ tool, result, signedIn, notice, onCopy, onDownload, onSave, onRegenerate, onEdit, onStartOver, onBlockedCopy }: { tool: FreeToolConfig; result: GenerationResult; signedIn: boolean; notice: string; onCopy: () => void; onDownload: () => void; onSave: () => void; onRegenerate: () => void; onEdit: () => void; onStartOver: () => void; onBlockedCopy: () => void }) {
  return (
    <div className="ft2-card ft2-output">
      <span className="mk-kicker">Review</span>
      <h2>{result.title}</h2>
      {!signedIn && <p className="ft2-lock-note">Preview is available now. Create a free account to copy, download or save this result.</p>}
      <div className="ft2-result" onCopy={(e) => { if (!signedIn) { e.preventDefault(); onBlockedCopy(); } }}>
        {result.result.sections.map((section) => <section key={section.heading}><h3>{section.heading}</h3>{section.body && <p style={{ whiteSpace: 'pre-wrap' }}>{section.body}</p>}{section.items?.length ? <ul>{section.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}</section>)}
      </div>
      <div className="ft2-actions left"><button className="btn" onClick={onCopy}>Copy</button><button className="btn secondary" onClick={onDownload}>Download</button><button className="btn secondary" onClick={onSave}>Save</button><button className="btn secondary" onClick={onRegenerate}>Regenerate</button><button className="btn secondary" onClick={onEdit}>Edit</button><button className="btn secondary" onClick={onStartOver}>Start over</button></div>
      {notice && <p className="ft2-notice">{notice}</p>}
      {signedIn && <div className="ft2-next"><strong>Your result is unlocked.</strong><p>Want to go one step further?</p><div>{tool.nextSteps.map((step) => <Link key={step.href} className="inline-link" href={step.href}>{step.label}</Link>)}</div></div>}
    </div>
  );
}

function isQuestionValid(question: FreeToolQuestion, value: string | string[] | undefined) {
  if (!question.required) return true;
  if (question.type === 'chips') return Array.isArray(value) && value.length > 0;
  const text = textValue(value);
  return text.length >= (question.minLength ?? 1);
}

function contextMessage(question: FreeToolQuestion) {
  if (question.type === 'chips') return 'Pick or add at least one true item before we continue.';
  if (question.minLength && question.minLength > 1) return `I need a bit more context here. Please add at least ${question.minLength} characters.`;
  return 'Please answer this before we continue.';
}

function answerPreview(value: unknown) {
  const text = textValue(value);
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function listFromText(value: string) {
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function toggleInList(values: string[], item: string) {
  return values.some((v) => v.toLowerCase() === item.toLowerCase()) ? values.filter((v) => v.toLowerCase() !== item.toLowerCase()) : [...values, item];
}

function trackEvent(eventName: string, input: { anonymousId?: string; step?: string; completionRate?: number; metadata?: Record<string, unknown> }) {
  const params = new URLSearchParams(window.location.search);
  const sourceArticle = params.get('utm_content') || params.get('source_article');
  const source = params.get('utm_source') || (sourceArticle ? 'jobiest_blog' : undefined);
  fetch('/api/free-tools/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventName,
      toolId: location.pathname.replace(/^\/free-/, '').replace(/\/$/, ''),
      anonymousId: input.anonymousId,
      step: input.step,
      completionRate: input.completionRate,
      metadata: { ...(input.metadata ?? {}), source, sourceArticle, referrer: document.referrer || undefined },
    }),
    keepalive: true,
  }).catch(() => undefined);
}
