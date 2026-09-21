'use client';

/**
 * Jobiest support chat widget (Workstream B).
 *
 * Accessibility: the panel is a dialog (role=dialog, aria-label), the message
 * log is announced with aria-live=polite, every interactive target is at least
 * 44px, Escape closes, focus returns to the launcher. The launcher is
 * draggable with a 5px threshold so drags never register as clicks, and its
 * position persists in localStorage. Mounted on every route from the root
 * layout. The agent never claims actions; escalations open the ticket form.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './ChatWidget.module.css';
import { SUPPORT_CATEGORIES } from '@/lib/support/tickets';

const POSITION_KEY = 'jobiest-support-widget-pos';
const DRAG_THRESHOLD_PX = 5;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING: Message = {
  role: 'assistant',
  content: "Hey there, I'm Tobi from Jobiest Support. Ask me anything about your account, resumes, the free tools, or applications and I'll help you right away.",
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketEmail, setTicketEmail] = useState('');
  const [ticketCategory, setTicketCategory] = useState<string>('Account & Login');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketResult, setTicketResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; baseLeft: number; baseTop: number; dragged: boolean } | null>(null);
  const titleId = useId();

  // Restore persisted position (stored as offsets from the right/bottom edges).
  useEffect(() => {
    const launcher = launcherRef.current;
    if (!launcher) return;
    try {
      const raw = window.localStorage.getItem(POSITION_KEY);
      if (raw) {
        const pos = JSON.parse(raw) as { right?: number; bottom?: number };
        if (typeof pos.right === 'number' && typeof pos.bottom === 'number') {
          launcher.style.right = `${Math.max(0, Math.min(pos.right, window.innerWidth - 60))}px`;
          launcher.style.bottom = `${Math.max(0, Math.min(pos.bottom, window.innerHeight - 60))}px`;
        }
      }
    } catch {
      /* ignore malformed stored position */
    }
  }, []);

  const persistPosition = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    try {
      window.localStorage.setItem(POSITION_KEY, JSON.stringify({ right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.bottom }));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseLeft: rect.left,
      baseTop: rect.top,
      dragged: false,
    };
    el.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = dragState.current;
      if (!state) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (!state.dragged && Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
      state.dragged = true;
      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(state.baseLeft + dx, window.innerWidth - rect.width - 8));
      const top = Math.max(8, Math.min(state.baseTop + dy, window.innerHeight - rect.height - 8));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    },
    [],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = dragState.current;
      dragState.current = null;
      const el = event.currentTarget;
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      if (state?.dragged) {
        persistPosition(el);
        return; // a drag never toggles the panel
      }
      setOpen((value) => !value);
    },
    [persistPosition],
  );

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, showTicketForm]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, busy]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: conversationIdRef.current,
          history: messages.slice(-8),
          route: typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
      });
      const data = (await res.json()) as { conversationId?: string; answer?: string; escalate?: boolean; message?: string };
      if (!res.ok || !data.answer) throw new Error(data.message ?? 'Chat failed');
      conversationIdRef.current = data.conversationId ?? conversationIdRef.current;
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer! }]);
      if (data.escalate) {
        setEscalated(true);
        setShowTicketForm(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages]);

  const submitTicket = useCallback(async () => {
    if (ticketBusy) return;
    setTicketBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ticketEmail,
          category: ticketCategory,
          subject: ticketSubject,
          message: ticketMessage,
          conversationId: conversationIdRef.current,
        }),
      });
      const data = (await res.json()) as { ticketId?: string; emailStatus?: string; message?: string };
      if (!res.ok || !data.ticketId) throw new Error(data.message ?? 'Ticket failed');
      setTicketResult(data.message ?? `Ticket ${data.ticketId} created.`);
      setShowTicketForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the ticket. Please try again.');
    } finally {
      setTicketBusy(false);
    }
  }, [ticketBusy, ticketEmail, ticketCategory, ticketSubject, ticketMessage]);

  if (!open) {
    return (
      <button
        ref={launcherRef}
        className={styles.launcher}
        aria-label="Open Jobiest support chat"
        aria-expanded={false}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.4A.6.6 0 0 1 3.8 19v-3.3A2.5 2.5 0 0 1 2 13.5v-8Z" fill="currentColor" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <button
        ref={launcherRef}
        className={styles.launcher}
        aria-label="Close Jobiest support chat"
        aria-expanded
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(false);
          }
        }}
        style={{ display: 'none' }}
      />
      <div
        className={styles.panel}
        role="dialog"
        aria-modal={false}
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <div className={styles.header}>
          <div className={styles.headerTitle} id={titleId}>
            <strong>Tobi · Jobiest Support</strong>
            <span className={styles.presence}><i className={styles.presenceDot} aria-hidden="true" />Online now</span>
          </div>
          <button
            className={styles.closeBtn}
            aria-label="Close support chat"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>

        <div className={styles.messages} ref={logRef} aria-live="polite" aria-label="Support conversation">
          {messages.map((message, index) => (
            <div key={index} className={message.role === 'user' ? styles.msgUser : styles.msgBot}>
              {message.content}
            </div>
          ))}
          {busy && <span className={styles.typing}>Tobi is typing…</span>}
          {escalated && !showTicketForm && !ticketResult && (
            <div className={styles.escalateNote}>
              Let me get a colleague on this one. Create a quick ticket below and we will reply by email.
            </div>
          )}
          {ticketResult && <div className={styles.ticketResult}>{ticketResult}</div>}
        </div>

        {!showTicketForm && !ticketResult && (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <div className={styles.row}>
              <input
                ref={inputRef}
                className={styles.input}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type your question"
                aria-label="Type your question"
                maxLength={3000}
                disabled={busy}
              />
              <button className={styles.sendBtn} type="submit" disabled={busy || !input.trim()}>
                Send
              </button>
            </div>
            <button
              className={styles.humanBtn}
              type="button"
              onClick={() => {
                setEscalated(true);
                setShowTicketForm(true);
              }}
            >
              Talk to a human
            </button>
          </form>
        )}

        {showTicketForm && !ticketResult && (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void submitTicket();
            }}
          >
            <label className={styles.label} htmlFor="sw-email">Your email</label>
            <input
              id="sw-email"
              className={styles.input}
              type="email"
              required
              value={ticketEmail}
              onChange={(event) => setTicketEmail(event.target.value)}
            />
            <label className={styles.label} htmlFor="sw-category">Category</label>
            <select
              id="sw-category"
              className={styles.select}
              value={ticketCategory}
              onChange={(event) => setTicketCategory(event.target.value)}
            >
              {SUPPORT_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <label className={styles.label} htmlFor="sw-subject">Subject</label>
            <input
              id="sw-subject"
              className={styles.input}
              required
              maxLength={200}
              value={ticketSubject}
              onChange={(event) => setTicketSubject(event.target.value)}
            />
            <label className={styles.label} htmlFor="sw-message">What happened?</label>
            <textarea
              id="sw-message"
              className={styles.textarea}
              required
              maxLength={5000}
              value={ticketMessage}
              onChange={(event) => setTicketMessage(event.target.value)}
            />
            <div className={styles.row}>
              <button className={styles.sendBtn} type="submit" disabled={ticketBusy}>
                {ticketBusy ? 'Creating…' : 'Create ticket'}
              </button>
              <button
                className={styles.humanBtn}
                type="button"
                onClick={() => setShowTicketForm(false)}
              >
                Back to chat
              </button>
            </div>
          </form>
        )}

        {error && <p className={`${styles.errorText} ${styles.form}`}>{error}</p>}
      </div>
    </>
  );
}
