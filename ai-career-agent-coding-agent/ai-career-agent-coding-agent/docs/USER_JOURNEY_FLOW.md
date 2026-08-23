# AI Career Agent — User Journey Flow

## Journey 1 — New User

```text
Landing Page
   ↓
Create Account
   ↓
Choose Professional Identity
   ↓
Upload CV
   ↓
AI Extracts Profile
   ↓
Review & Correct
   ↓
Set Target Roles
   ↓
Set Job Preferences
   ↓
Connect Gmail
   ↓
Choose Application Mode
   ↓
Set Daily Target
   ↓
Activate Agent
   ↓
Dashboard
```

## Journey 2 — AI Engineer

```text
Role: AI Engineer
Secondary roles:
- AI Developer
- AI Automation Engineer
- AI Agent Engineer
- LLM Engineer

Preferences:
- Remote
- Full-time
- Target regions
- Salary threshold

Agent:
- Discover jobs
- Score jobs
- Select top opportunities
- Generate personalized CV
- Generate cover letter
- Prepare answers
- Submit according to mode
```

## Journey 3 — Content Creator

Exactly the same flow, but the user profile contains:
- Content creation skills.
- Social platforms.
- Portfolio.
- Content niches.
- Writing/video skills.
- Target titles.

No code path should be hard-coded to AI engineering.

## Journey 4 — Daily Agent Run

```text
Daily Trigger
   ↓
Find active users
   ↓
Check user quota/preferences
   ↓
Discover jobs
   ↓
Normalize
   ↓
Deduplicate
   ↓
Remove previously applied jobs
   ↓
Deterministic filtering
   ↓
AI scoring
   ↓
Shortlist
   ↓
Generate application package
   ↓
Truthfulness check
   ↓
Approval/automation gate
   ↓
Submit or wait
   ↓
Verify
   ↓
Record
   ↓
Notify
```

## Journey 5 — Approval Mode

```text
Job shortlisted
   ↓
CV generated
   ↓
Cover letter generated
   ↓
Application prepared
   ↓
User receives notification
   ↓
User reviews
   ├── Reject
   └── Approve
          ↓
       Submit
          ↓
       Verify
          ↓
       Record
```

## Journey 6 — Interview

```text
Gmail event
   ↓
Email normalization
   ↓
AI classification
   ↓
Application matching
   ↓
Interview confidence threshold
   ↓
Create interview event
   ↓
Notify user
   ↓
Dashboard updates
```

## Journey 7 — Pause

User selects:
`Pause Agent`

The system:
- Stops new discovery runs.
- Stops new applications.
- Allows existing in-flight operations to finish safely.
- Preserves all history.

## Journey 8 — Failure

```text
Operation fails
   ↓
Record error
   ↓
Retry if safe
   ↓
If retry exhausted:
mark failed
   ↓
Continue other jobs
   ↓
Notify user if material
```
