/**
 * Support knowledge base (Workstream B, B3).
 *
 * Every entry states only what the live application actually does, verified
 * against jobiest.com during the Phase Zero audit and Stage 4 verification.
 * IDs follow the KB-xxx schema. Entries are code-defined (versioned,
 * testable) and synced to the support_kb_entries table for querying.
 */

export interface KbEntry {
  id: string;
  question: string;
  answerMd: string;
  topics: string[];
}

export const KB_ENTRIES: KbEntry[] = [
  { id: 'KB-001', question: 'What is Jobiest?', answerMd: 'Jobiest is an AI career agent. You create a professional profile once, Jobiest helps you prepare truthful, personalized applications for the roles you bring, applies with your agent only on your approval, and tracks everything in one dashboard.', topics: ['product', 'overview'] },
  { id: 'KB-002', question: 'Is Jobiest free to use? What does it cost?', answerMd: 'Jobiest has a permanent free plan that includes 3 AI generations to try. Paid plans add more daily volume: Basic at 5,000 Naira a month, Premium at 10,000 Naira, and Max at 20,000 Naira. No card is required to start.', topics: ['pricing', 'billing', 'plans', 'cost'] },
  { id: 'KB-003', question: 'What free tools does Jobiest offer?', answerMd: 'Jobiest offers free career tools that need no account credits: an ATS resume scanner, a job description analyzer, a cover letter writer, a resume summary generator, a LinkedIn headline builder, an interview question generator, a skills matcher, a follow-up email writer, a career path explorer, and salary insights. All are listed on the Tools page.', topics: ['tools', 'free'] },
  { id: 'KB-004', question: 'Does the ATS resume scanner cost anything?', answerMd: 'No. The Free ATS Resume Scanner runs deterministic checks, is free, and has no usage limit. It scores parseability: contact details, sections, dates, action verbs, and optional keyword match against a job description.', topics: ['tools', 'ats', 'scanner', 'resume'] },
  { id: 'KB-005', question: 'How does the Resume Studio work?', answerMd: 'Resume Studio is a guided flow: you provide your profile and career details, choose from the template library, review the generated resume with a strength score, and download it as PDF or DOCX. Switching templates keeps your content intact.', topics: ['resume', 'studio', 'generate', 'documents'] },
  { id: 'KB-006', question: 'Can I export my resume as PDF and Word?', answerMd: 'Yes. Generated documents can be downloaded as PDF or DOCX from the documents area and from the final step of Resume Studio.', topics: ['resume', 'export', 'pdf', 'docx', 'documents'] },
  { id: 'KB-007', question: 'Does Jobiest apply to jobs automatically?', answerMd: 'The Jobiest agent can submit applications only with your explicit approval for each one. Jobiest never sends an application without your approval, and you can always see exactly what was sent and when.', topics: ['agent', 'applications', 'approval', 'automation'] },
  { id: 'KB-008', question: 'Will Jobiest invent experience or skills on my CV?', answerMd: 'No. Jobiest only uses verified facts from your profile. A truthfulness checker rejects claims your profile cannot support. Jobiest will never fabricate a credential on your behalf.', topics: ['truthfulness', 'policy', 'resume', 'cv'] },
  { id: 'KB-009', question: 'How do I sign up or log in?', answerMd: 'You can create an account with your email or sign in with Google on the login and signup pages. If you have trouble logging in, select Account and Login when contacting support.', topics: ['account', 'login', 'signup', 'auth'] },
  { id: 'KB-010', question: 'How do I reset my password?', answerMd: 'Use the reset link on the login page and follow the emailed instructions. If the email does not arrive, check spam first, then contact support with the email address on your account so we can help.', topics: ['account', 'login', 'password'] },
  { id: 'KB-011', question: 'Where can I see my applications?', answerMd: 'All applications and their statuses are tracked in the Applications area of your dashboard after you sign in.', topics: ['applications', 'dashboard', 'tracking'] },
  { id: 'KB-012', question: 'How do I update my profile or job preferences?', answerMd: 'Your profile and job preferences are editable from the dashboard after signing in. Changes there flow into future documents and applications.', topics: ['profile', 'preferences', 'dashboard'] },
  { id: 'KB-013', question: 'What payment methods does Jobiest accept?', answerMd: 'Payments are processed through the billing area. If you have any billing or payment question, including refunds or a charge you do not recognize, support will escalate it to a human who handles payments.', topics: ['billing', 'payment', 'pricing'] },
  { id: 'KB-014', question: 'How do I delete my account or my data?', answerMd: 'Account and data deletion requests are handled by a human for safety. Ask support and select the Account and Login or Other category; your request will be escalated and processed according to our data policy.', topics: ['privacy', 'data', 'account', 'deletion'] },
  { id: 'KB-015', question: 'Is my data private?', answerMd: 'Jobiest does not read your inbox, never sends anything without approval, and shows you exactly what was sent and when. The privacy policy on the site details how data is handled.', topics: ['privacy', 'security', 'policy'] },
  { id: 'KB-016', question: 'Does Jobiest have a mobile app?', answerMd: 'Jobiest runs in your browser and is built to work on phones, tablets, and desktops. There is currently no separate app store download.', topics: ['mobile', 'app', 'product'] },
  { id: 'KB-017', question: 'What is a resume match score?', answerMd: 'The match score summarizes how well your resume aligns with a specific job description, based on keyword overlap and requirements coverage. It is guidance for improvement, not a guarantee of interviews.', topics: ['score', 'resume', 'match', 'ats'] },
  { id: 'KB-018', question: 'Can Jobiest help with cover letters and LinkedIn?', answerMd: 'Yes. There is a free cover letter writer, a resume summary generator, and a free LinkedIn headline builder, plus a Resume Studio for full documents.', topics: ['cover letter', 'linkedin', 'summary', 'tools'] },
  { id: 'KB-019', question: 'The AI made an error in my document. What do I do?', answerMd: 'Edit the draft before downloading; generated documents are editable. If something looks wrong, you can regenerate or fix it manually. Report persistent problems to support with details of what happened.', topics: ['documents', 'ai', 'errors'] },
  { id: 'KB-020', question: 'How do I contact a human?', answerMd: 'Ask for a human in this chat and you will be offered a support ticket, or use the Contact Support page. Tickets go to the Jobiest support inbox with your reply address preserved.', topics: ['support', 'contact', 'human', 'ticket'] },
];

const STOP_WORDS = new Set(['a', 'an', 'the', 'is', 'are', 'do', 'does', 'i', 'my', 'me', 'can', 'how', 'what', 'where', 'to', 'of', 'in', 'on', 'for', 'with', 'and', 'or', 'it', 'you', 'your', 'we']);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Simple, deterministic retrieval over the KB by token overlap.
 * Returns entries whose topic or question/answer tokens overlap the query,
 * best matches first. No fabricated relevance: score = overlap count.
 */
export function retrieveKb(query: string, limit = 4): KbEntry[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return [];
  const scored = KB_ENTRIES.map((entry) => {
    const entryTokens = new Set([...tokenize(`${entry.question} ${entry.answerMd}`), ...entry.topics.map((t) => t.toLowerCase())]);
    let score = 0;
    for (const token of queryTokens) if (entryTokens.has(token)) score += 1;
    return { entry, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit)
    .map((s) => s.entry);
}
