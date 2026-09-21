# SEO Content Strategy (Workstream A, Stage 4)

## 1. Topic selection method

Topics were selected from the Stage 2 keyword database (566 observed rows across NG, GB, US, CA). Selection criteria, in order: (1) the keyword was actually observed in autocomplete for a target market, (2) Jobiest genuinely serves the intent through a real feature or free tool, (3) no cannibalization with the 25 published articles, (4) cluster fit. Volumes and difficulty are Unknown throughout; prioritization used business value and intent, never invented metrics.

## 2. Cannibalization prevention (A6.3)

Every new target keyword was checked against all 25 existing articles' target keywords. The check is enforced permanently by a unit test (`tests/seo-master-upgrade.test.ts`): no slug collision and no target keyword collision with the existing corpus, and no duplicates within the new set.

## 3. The 20 articles and clusters

| # | Slug | Target keyword | Cluster | Related tool |
|---|---|---|---|---|
| 1 | cv-format-nigeria | cv format nigeria | Resume and CV fundamentals | ATS scanner |
| 2 | how-to-write-a-cv | how to write a cv | Resume and CV fundamentals | ATS scanner |
| 3 | cv-vs-resume-difference | cv vs resume | Resume and CV fundamentals | ATS scanner |
| 4 | graduate-cv-no-experience | graduate cv no experience | Resume and CV fundamentals | ATS scanner |
| 5 | entry-level-resume-guide | entry-level resume | Resume and CV fundamentals | JD analyzer |
| 6 | professional-cv-examples | professional cv examples | Resume and CV fundamentals | ATS scanner |
| 7 | resume-improvement-tips | resume improvement tips | Resume and CV fundamentals | JD analyzer |
| 8 | cv-review-checklist | cv review | Resume and CV fundamentals | ATS scanner |
| 9 | remote-jobs-for-nigerians | remote jobs nigeria | Job discovery and applications | JD analyzer |
| 10 | online-jobs-nigeria-avoid-scams | online jobs nigeria | Job discovery and applications | JD analyzer |
| 11 | how-to-get-a-job-in-nigeria | how to get a job in nigeria | Job discovery and applications | JD analyzer |
| 12 | job-search-tools-guide | job search tools | Job discovery and applications | Skills matcher |
| 13 | job-application-checklist | job application checklist | Job discovery and applications | Follow-up writer |
| 14 | interview-preparation-tips | interview preparation tips | Career development | Interview generator |
| 15 | career-planning-guide | career planning guide | Career development | Career path explorer |
| 16 | career-change-advice | career change advice | Career development | Skills matcher |
| 17 | free-career-assessment | career assessment free | Career development | Career path explorer |
| 18 | professional-skills-development | professional skills development | Career development | Skills matcher |
| 19 | job-search-automation-guide | job search automation | Career development | JD analyzer |
| 20 | salary-negotiation-preparation | salary negotiation tips | Career development | Salary insights |

## 4. Editorial standards applied

- Every brief completed before writing (problem, quick answer, reader situation, workflow, example, checklist, mistakes, tool and product CTA, FAQ, internal links).
- Titles: 50 characters or fewer so the rendered title with the " - Jobiest" suffix stays within 60.
- Meta descriptions: 80 to 160 characters.
- Each article: 3 to 5 internal links to real public paths (verified against the live sitemap), one free tool CTA, one signup CTA, three or more FAQs (rendered as FAQPage structured data).
- No fabricated statistics, volumes, or personal experience claims anywhere.
- Nigeria-aware guidance where market-specific (NYSC, Naira pricing, CV conventions) without excluding other markets.

## 5. Internal link map

The 20 new articles link into the existing hub structure: free tool pages act as conversion hubs, existing guides act as cluster pillars, and the new articles cross-link within their clusters (see each brief's internalLinks in `lib/seo/master-upgrade-content.ts`). Existing articles will gain links to the new cluster members in a follow-up content update pass if desired; the new set is fully linked at publish time.

## 6. Update cycle

Each cluster gets a quarterly review: verify tool paths still exist, refresh examples, and extend FAQs from real questions seen in support conversations (Workstream B provides the data).
