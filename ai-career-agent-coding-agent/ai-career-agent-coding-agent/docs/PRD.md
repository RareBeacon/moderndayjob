# AI Career Agent — Product Requirements Document

## 1. Product Summary

AI Career Agent is a multi-user autonomous job-search and application platform. Each user creates an account and configures a professional identity such as AI Engineer, Content Creator, Designer, Marketer, or another role.

The platform continuously discovers relevant opportunities, evaluates fit against the user's real professional profile, generates truthful and highly personalized application materials, assists with or submits applications where technically and legally permitted, tracks application outcomes, monitors the user's connected email for recruiter/interview signals, and presents everything in one dashboard.

The product must never hard-code a single profession. The profession is user data.

## 2. Core Promise

"Create your professional profile once. Let your career agent continuously find relevant opportunities, prepare personalized applications, and keep you informed."

## 3. Primary Users

### User A — AI Engineer
Example roles:
- AI Engineer
- AI Developer
- AI Automation Engineer
- AI Agent Engineer
- LLM Engineer
- Generative AI Engineer
- Python Developer

### User B — Content Creator
Example roles:
- Content Creator
- Content Strategist
- Social Media Manager
- Copywriter
- Content Marketing Specialist
- UGC Creator

The same product, data model, UI, and agent framework must support both.

## 4. Product Goals

1. Let a user create a career-agent account in minutes.
2. Build a structured professional profile from an existing CV and manual input.
3. Allow multiple target roles and search preferences.
4. Discover relevant jobs from supported/permitted sources.
5. Deduplicate and score opportunities.
6. Generate personalized CVs, cover letters, and application answers using only verified user facts.
7. Support approval, assisted, and automatic application modes.
8. Track every application and the exact documents used.
9. Connect Gmail through OAuth without storing a Gmail password.
10. Detect likely recruiter/interview messages.
11. Provide daily application targets, configurable per user.
12. Support multiple users securely with strict tenant isolation.
13. Start with a low/no-cost MVP using Vercel, Supabase, OpenRouter free models, and Hugging Face as fallback.
14. Be architected so a dedicated background/browser worker can be added later without rewriting the core product.

## 5. Non-Goals

- Bypassing CAPTCHAs, bot protections, access controls, or website security.
- Fabricating qualifications, experience, employment, education, certifications, or achievements.
- Mass-spamming employers.
- Guaranteeing interviews or employment.
- Giving the AI unrestricted access to a user's accounts.
- Hard-coding the system for AI/engineering jobs only.

## 6. MVP

### Account and onboarding
- Sign up/sign in.
- Create professional identity.
- Select primary and secondary target roles.
- Upload master CV.
- Extract profile data.
- Review/edit extracted data.
- Configure location, remote preference, salary, employment type, seniority, industries, exclusions, and daily target.
- Connect Gmail via Google OAuth.
- Choose application mode.

### Job intelligence
- Source adapters.
- Normalized job object.
- Duplicate detection.
- Relevance scoring.
- Explainable match score.
- Application eligibility checks.

### Application generation
- Personalized CV.
- Cover letter.
- Application-question answers.
- Document versioning.
- Truthfulness verification.

### Application tracking
- Statuses: discovered, shortlisted, draft, awaiting approval, submitted, confirmation pending, interview, rejected, withdrawn, failed.
- Submission timestamp.
- Source and URL.
- Document versions.
- Audit log.

### Email
- Gmail connection.
- Interview/recruiter/rejection classification.
- Link email to application when confidence is high.
- User notification.

## 7. V1 Acceptance Criteria

A new user must be able to:
1. Register.
2. Choose any profession.
3. Upload a CV.
4. Correct extracted profile information.
5. Set job preferences.
6. Connect Gmail.
7. Start the agent.
8. See discovered jobs.
9. See why jobs were scored.
10. Approve an application.
11. See generated CV/cover letter.
12. Submit through a supported workflow or receive an assisted handoff.
13. See application history.
14. Receive an interview notification.
15. Pause or disable the agent.

## 8. Success Metrics

- Profile completion rate.
- Job discovery success rate.
- Relevant-job rate.
- Application generation success rate.
- Submission confirmation rate.
- Duplicate application prevention rate.
- Interview detection precision.
- Application response rate.
- Interview rate.
- Average applications per active user/day.
- AI request consumption per application.
- Agent failure/retry rate.
- Human override rate.

## 9. Trust Principles

Every application must be traceable to:
- A specific job.
- A specific user.
- A specific CV version.
- A specific cover letter version.
- A specific application-answer set.
- A specific agent run.

The system should be able to answer: "Exactly what did we send, where, when, and based on which source information?"

## 10. Product Modes

### Draft
Generate materials only.

### Assist
Prepare and fill where possible, but stop before final submission.

### Approval
Prepare complete application and wait for user approval.

### Auto
Submit eligible applications automatically within user-defined rules.

Auto mode must still stop on unsupported platforms, suspicious pages, CAPTCHA/security challenges, missing required information, or any truthfulness violation.
