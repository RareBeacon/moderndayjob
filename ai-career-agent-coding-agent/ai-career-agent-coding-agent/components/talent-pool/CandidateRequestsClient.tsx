'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './talent-pool.module.css';

interface OutreachRequestRow {
  id: string;
  organization_id: string;
  recruiter_user_id: string;
  request_type: 'CONTACT_REQUEST' | 'INTERVIEW_INVITATION';
  role_title: string;
  message: string;
  compensation_range: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
  created_at: string;
  employer_organizations?: {
    id: string;
    company_name: string;
    website_url: string;
    industry: string;
    company_location: string;
  } | null;
}

interface ConversationRow {
  id: string;
  organization_id: string;
  candidate_user_id: string;
  status: 'OPEN' | 'CLOSED' | 'BLOCKED';
  last_message_at: string | null;
  employer_organizations?: {
    id: string;
    company_name: string;
    industry: string;
  } | null;
}

interface MessageRow {
  id: string;
  sender_user_id: string;
  sender_role: 'RECRUITER' | 'CANDIDATE';
  body: string;
  created_at: string;
}

export function CandidateRequestsClient() {
  const [requests, setRequests] = useState<OutreachRequestRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [composerBody, setComposerBody] = useState('');
  const [responseNote, setResponseNote] = useState<Record<string, string>>({});
  const [reportText, setReportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    const [reqRes, convRes] = await Promise.all([
      fetch('/api/talent-pool/contact-requests'),
      fetch('/api/talent-pool/conversations'),
    ]);
    const reqJson = await reqRes.json().catch(() => null);
    const convJson = await convRes.json().catch(() => null);
    if (reqRes.ok) setRequests(reqJson?.requests ?? []);
    if (convRes.ok) {
      const allConvs = [
        ...(convJson?.candidateConversations ?? []),
        ...(convJson?.employerConversations ?? []),
        ...(convJson?.conversations ?? []),
      ] as ConversationRow[];
      const seen = new Set<string>();
      const deduped = allConvs.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      setConversations(deduped);
    }
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    const res = await fetch(`/api/talent-pool/conversations/${convId}/messages`);
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setMessages(json?.messages ?? []);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (activeConvId) {
      void loadMessages(activeConvId);
    }
  }, [activeConvId, loadMessages]);

  async function respondToRequest(requestId: string, action: 'ACCEPT' | 'DECLINE') {
    setBusy(true);
    setError(null);
    setBanner(null);
    const res = await fetch(`/api/talent-pool/contact-requests/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        note: responseNote[requestId]?.trim() || undefined,
      }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(json?.message || json?.error || 'Could not update request.');
      return;
    }
    setBanner(
      action === 'ACCEPT'
        ? 'Opportunity accepted. Direct conversation unlocked below.'
        : 'Opportunity declined politely.',
    );
    await loadInbox();
    if (json?.conversationId) {
      setActiveConvId(json.conversationId);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!activeConvId || !composerBody.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/talent-pool/conversations/${activeConvId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: composerBody.trim() }),
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(json?.message || json?.error || 'Message could not be sent.');
      return;
    }
    setComposerBody('');
    await loadMessages(activeConvId);
  }

  async function reportInteraction(organizationId?: string, conversationId?: string) {
    if (reportText.trim().length < 10) {
      setError('Describe the inappropriate interaction in at least 10 characters.');
      return;
    }
    const res = await fetch('/api/talent-pool/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_id: organizationId || null,
        conversation_id: conversationId || null,
        reason_category: 'SPAM',
        details: reportText.trim(),
      }),
    });
    if (res.ok) {
      setReportText('');
      setBanner('Report submitted to Jobiest Trust & Safety.');
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.statusHeader}>
          <div>
            <div className={styles.eyebrow}>Opportunity Inbox &amp; Messaging</div>
            <h1 className={styles.heroTitle}>Employer Invitations &amp; Active Conversations</h1>
            <p className={styles.heroLead}>
              Review incoming interview invitations and contact requests from verified employers. Employers
              can message you directly only after you accept an invitation.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Link href="/talent-pool" className={styles.btnSecondary}>
              Talent Pool Overview
            </Link>
            <Link href="/employer" className={styles.btnSecondary}>
              Employer Portal
            </Link>
          </div>
        </div>
      </section>

      {banner && <div className={styles.alertSuccess}>{banner}</div>}
      {error && <div className={styles.alertError}>{error}</div>}

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Incoming Employer Requests ({requests.length})</h2>
        {requests.length === 0 ? (
          <p className={styles.cardBody}>
            No employer contact requests or interview invitations yet. Once your Talent Pool profile is
            approved and visible, verified hiring teams can invite you here.
          </p>
        ) : (
          <div className={styles.grid2}>
            {requests.map((req) => (
              <article key={req.id} className={styles.card}>
                <div className={styles.statusHeader}>
                  <span className={styles.tag}>{req.request_type}</span>
                  <span
                    className={`${styles.statusPill} ${
                      req.status === 'ACCEPTED'
                        ? styles.toneSuccess
                        : req.status === 'PENDING'
                          ? styles.toneWarning
                          : styles.toneNeutral
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
                <h3 className={styles.cardTitle} style={{ marginTop: 10 }}>
                  {req.role_title} · {req.employer_organizations?.company_name || 'Verified Employer'}
                </h3>
                {req.compensation_range && (
                  <p className={styles.cardBody}>
                    <strong>Compensation:</strong> {req.compensation_range}
                  </p>
                )}
                <p className={styles.cardBody} style={{ marginTop: 8 }}>{req.message}</p>
                {req.status === 'PENDING' && (
                  <div style={{ marginTop: 12 }}>
                    <input
                      className={styles.input}
                      placeholder="Optional note back to hiring team"
                      value={responseNote[req.id] ?? ''}
                      onChange={(e) =>
                        setResponseNote((prev) => ({ ...prev, [req.id]: e.target.value }))
                      }
                    />
                    <div className={styles.heroActions} style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void respondToRequest(req.id, 'ACCEPT')}
                        className={styles.btnPrimary}
                      >
                        Accept &amp; Open Chat
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void respondToRequest(req.id, 'DECLINE')}
                        className={styles.btnSecondary}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Active Conversations ({conversations.length})</h2>
          {conversations.length === 0 ? (
            <p className={styles.cardBody}>Accept an employer request to start a direct conversation.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setActiveConvId(conv.id)}
                  className={activeConvId === conv.id ? styles.btnPrimary : styles.btnSecondary}
                  style={{ justifyContent: 'space-between', width: '100%' }}
                >
                  <span>
                    {conv.employer_organizations?.company_name || 'Hiring Conversation'} ({conv.status})
                  </span>
                  <span>Open</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Messages</h2>
          {!activeConvId ? (
            <p className={styles.cardBody}>Select a conversation to view and send messages.</p>
          ) : (
            <>
              <div className={styles.transcriptFeed} style={{ marginBottom: 12 }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`${styles.bubble} ${
                      m.sender_role === 'CANDIDATE' ? styles.bubbleCandidate : styles.bubbleAi
                    }`}
                  >
                    <div className={styles.bubbleRole}>{m.sender_role}</div>
                    <div>{m.body}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={sendMessage} className={styles.heroActions}>
                <input
                  className={styles.input}
                  style={{ flex: 1 }}
                  placeholder="Write a message..."
                  value={composerBody}
                  onChange={(e) => setComposerBody(e.target.value)}
                />
                <button type="submit" disabled={busy || !composerBody.trim()} className={styles.btnPrimary}>
                  Send
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Report Inappropriate Interaction</h2>
        <div className={styles.heroActions}>
          <input
            className={styles.input}
            style={{ flex: 1 }}
            placeholder="Describe spam, solicitation, or policy violation (min 10 chars)"
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void reportInteraction(undefined, activeConvId ?? undefined)}
            className={styles.btnDanger}
          >
            Submit Report
          </button>
        </div>
      </section>
    </div>
  );
}
