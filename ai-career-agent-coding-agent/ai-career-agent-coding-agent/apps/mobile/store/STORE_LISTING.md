# Jobiest - Google Play Store Listing (paste-ready)

App: Jobiest - AI Career Agent · com.jobiest.app · v1.0.0
Everything below is ready to paste into Play Console. Assets in this folder.

## Store listing

**App name:** Jobiest - AI Career Agent

**Short description (80 char max):**
Your AI career agent. Find real jobs, prepare truthful applications, track all.

**Full description:**

Jobiest is your AI career agent. Build your professional profile once, and
Jobiest does the heavy lifting: discovering relevant roles, scoring how well
they fit you, and preparing honest, personalized applications from facts you
have verified.

DISCOVER JOBS THAT FIT
- Live job discovery from real company boards
- Fit scoring that explains why a role matches you
- Fresh listings, deduplicated across sources

APPLICATIONS YOU CAN TRUST
- Cover letters and CVs generated only from your verified profile facts
- Salary, work-authorization and other sensitive questions are never
  auto-answered - you decide
- Every application needs your approval before anything is sent
- Full timeline: what was sent, when, and to whom

EVERYTHING IN ONE PLACE
- One dashboard for every application and document
- Application email kept separate from your personal inbox
- Free tools: ATS resume scanner, cover letter writer, interview questions,
  salary insights and more

YOUR DATA, YOUR CONTROL
- Delete your account and data anytime
- Documents stored privately; nothing shared with employers without your
  action
- No fake credentials, ever: Jobiest prepares truthful applications only

Start free. Upgrade when you want more automation.

**Category:** Business (secondary: Productivity)
**Tags:** jobs, job search, resume, career, cover letter
**Contact email:** (operator's support email)

## Graphics

| Asset | File | Spec |
| --- | --- | --- |
| App icon | `../assets/icon-512.png` | 512x512 PNG |
| Feature graphic | `store/feature-graphic.png` | 1024x500 PNG |
| Phone screenshots (4) | `store/screenshot-{home,jobs,tools,pricing}.png` | 1080x1920 PNG |

Optional next batch: 7" and 10" tablet screenshots (same pages, wider
viewport) - generate on request.

## Data safety form (answers)

- Does your app collect or share any of the required user data?
  **Yes**
- Is all of the user data collected by your app encrypted in transit?
  **Yes** (HTTPS only)
- Can users request that their data be deleted?
  **Yes** (in-app account deletion exists)
- Data types collected:
  - Personal info: Name, Email address (account)
  - Photos and videos: **No** (CV PDFs are documents; classify as "Documents
    and docs" if offered - else omit)
  - Documents and docs: CV / resume uploads (app functionality)
  - App interactions: app usage data (analytics-lite, audit events)
  - No location, no financial info (payments happen on Flutterwave's hosted
    checkout outside the app), no health data, no web history
- Is data collected independent of user consent? No - collection is tied to
  account usage and disclosed in the privacy policy
- Data shared with third parties: No (processors only: hosting, database,
  payment provider - as disclosed in https://jobiest.com/privacy)

## Content rating questionnaire (answers)

- Does the app contain violence, sexual content, profanity, drugs, gambling,
  or user-to-user communication? **No to all**
- Does the app share user location with other users? **No**
- Does the app enable digital purchases? **Yes** (subscription upgrades via
  secure third-party checkout)
- Result: rated **Everyone** (contains in-app purchases flag)

## Privacy policy

https://jobiest.com/privacy (already live)

## Release plan reference

See PRODUCTION_PLAN.md in this folder. First upload goes to **internal
testing**, then the mandatory 14-day closed test with 12+ testers, then the
production access application.
