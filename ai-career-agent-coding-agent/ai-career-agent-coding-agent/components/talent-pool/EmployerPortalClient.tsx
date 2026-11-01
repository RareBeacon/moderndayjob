'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AVAILABILITY_OPTIONS,
  CAREER_CATEGORIES,
  EMPLOYMENT_PREFERENCES,
  REMOTE_PREFERENCES,
  SENIORITY_LEVELS,
  SUPPORTED_CURRENCIES,
} from '@/lib/talent-pool/constants';
import type { EmployerContext } from '@/lib/talent-pool/recruiter-service';
import styles from './talent-pool.module.css';

interface CandidateCardItem {
  candidate_user_id: string;
  display_name: string;
  headline: string | null;
  target_roles: string[];
  career_category: string | null;
  seniority_level: string | null;
  years_of_experience: number | null;
  location: string | null;
  country: string | null;
  time_zone: string | null;
  skills: string[];
  technical_competencies: string[];
  relevant_qualifications: string[];
  availability: string | null;
  employment_types: string[];
  remote_types: string[];
  salary_currency: string;
  salary_min: number | null;
  salary_max: number | null;
  overall_score: number | null;
  recruiter_summary: string | null;
  competency_scores: Array<{ key: string; label: string; score: number }>;
  allow_cv_access: boolean;
  allow_contact_requests: boolean;
  saved: boolean;
}

interface ShortlistRow {
  id: string;
  name: string;
  description: string | null;
}

interface VacancyRow {
  id: string;
  title: string;
  career_category: string | null;
  seniority_level: string | null;
  location: string | null;
  status: string;
}

export function EmployerPortalClient({ initialContext }: { initialContext: EmployerContext | null }) {
  const [context, setContext] = useState<EmployerContext | null>(initialContext);
  const [shortlists, setShortlists] = useState<ShortlistRow[]>([]);
  const [vacancies, setVacancies] = useState<VacancyRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateCardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Registration form matching employerRegistrationSchema
  const [companyName, setCompanyName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [industry, setIndustry] = useState('');
  const [companyLocation, setCompanyLocation] = useState('');
  const [country, setCountry] = useState('');
  const [companyDescription, setCompanyDescription] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [repName, setRepName] = useState('');
  const [repRole, setRepRole] = useState('');
  const [regRef, setRegRef] = useState('');

  // All 11 Search Filter Dimensions matching recruiterSearchFilterSchema
  const [title, setTitle] = useState('');
  const [careerCategory, setCareerCategory] = useState('');
  const [skills, setSkills] = useState('');
  const [minYears, setMinYears] = useState('');
  const [maxYears, setMaxYears] = useState('');
  const [location, setLocation] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('USD');
  const [maxSalaryBudget, setMaxSalaryBudget] = useState('');
  const [availability, setAvailability] = useState('');
  const [employmentPreference, setEmploymentPreference] = useState('');
  const [competency, setCompetency] = useState('');
  const [minCompetencyScore, setMinCompetencyScore] = useState('');
  const [qualification, setQualification] = useState('');

  // Quick create shortlist / vacancy
  const [newShortlistName, setNewShortlistName] = useState('');
  const [newVacancyTitle, setNewVacancyTitle] = useState('');
  const [newVacancyCategory, setNewVacancyCategory] = useState<string>(CAREER_CATEGORIES[0]);
  const [newVacancySeniority, setNewVacancySeniority] = useState<string>('MID');
  const [newVacancyLocation, setNewVacancyLocation] = useState('Remote');

  const loadOrgMeta = useCallback(async () => {
    const res = await fetch('/api/employer/organization');
    const json = await res.json().catch(() => null);
    if (res.ok && json?.context) {
      setContext(json.context);
      setShortlists(json.shortlists ?? []);
      setVacancies(json.vacancies ?? []);
    }
  }, []);

  const searchCandidates = useCallback(
    async (nextPage = 1) => {
      if (!context || context.organization.verification_status !== 'VERIFIED') return;
      setLoading(true);
      setError(null);
      try {
        const sp = new URLSearchParams();
        if (title.trim()) sp.set('title', title.trim());
        if (careerCategory) sp.set('career_category', careerCategory);
        if (skills.trim()) sp.set('skills', skills.trim());
        if (minYears !== '') sp.set('min_years_experience', minYears);
        if (maxYears !== '') sp.set('max_years_experience', maxYears);
        if (location.trim()) sp.set('location', location.trim());
        if (timeZone.trim()) sp.set('time_zone', timeZone.trim());
        if (maxSalaryBudget !== '') {
          sp.set('salary_currency', salaryCurrency);
          sp.set('max_salary_budget', maxSalaryBudget);
        }
        if (availability) sp.set('availability', availability);
        if (employmentPreference) sp.set('employment_preference', employmentPreference);
        if (competency.trim()) sp.set('competency', competency.trim());
        if (minCompetencyScore !== '') sp.set('min_competency_score', minCompetencyScore);
        if (qualification.trim()) sp.set('qualification', qualification.trim());
        sp.set('page', String(nextPage));
        sp.set('page_size', '12');

        const res = await fetch(`/api/employer/candidates?${sp.toString()}`);
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.message || json?.error || 'Could not search candidates.');
        }
        setCandidates(json.items ?? []);
        setTotal(json.total ?? 0);
        setPage(json.page ?? nextPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        setLoading(false);
      }
    },
    [
      availability,
      careerCategory,
      competency,
      context,
      employmentPreference,
      location,
      maxSalaryBudget,
      maxYears,
      minCompetencyScore,
      minYears,
      qualification,
      salaryCurrency,
      skills,
      timeZone,
      title,
    ],
  );

  useEffect(() => {
    void loadOrgMeta();
  }, [loadOrgMeta]);

  useEffect(() => {
    if (context?.organization.verification_status === 'VERIFIED') {
      void searchCandidates(1);
    }
  }, [context?.organization.verification_status, searchCandidates]);

  async function registerOrganization(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/employer/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(),
          website_url: websiteUrl.trim(),
          company_description: companyDescription.trim(),
          industry: industry.trim(),
          company_location: companyLocation.trim(),
          country: country.trim(),
          business_email: businessEmail.trim(),
          authorized_representative_name: repName.trim(),
          authorized_representative_role: repRole.trim(),
          business_registration_ref: regRef.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Employer registration failed.');
      }
      setContext(json.context);
      setBanner('Employer organization submitted for Jobiest verification.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Employer registration failed.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleSaveCandidate(candidateId: string, currentlySaved: boolean) {
    setError(null);
    const res = currentlySaved
      ? await fetch(`/api/employer/saved?candidate_user_id=${encodeURIComponent(candidateId)}`, {
          method: 'DELETE',
        })
      : await fetch('/api/employer/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_user_id: candidateId }),
        });
    if (res.ok) {
      setCandidates((prev) =>
        prev.map((c) => (c.candidate_user_id === candidateId ? { ...c, saved: !currentlySaved } : c)),
      );
    }
  }

  async function createShortlist() {
    if (newShortlistName.trim().length < 2) return;
    const res = await fetch('/api/employer/shortlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newShortlistName.trim() }),
    });
    if (res.ok) {
      setNewShortlistName('');
      await loadOrgMeta();
      setBanner('Shortlist created.');
    }
  }

  async function createVacancy() {
    if (newVacancyTitle.trim().length < 2) return;
    const res = await fetch('/api/employer/vacancies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newVacancyTitle.trim(),
        career_category: newVacancyCategory,
        seniority_level: newVacancySeniority,
        location: newVacancyLocation.trim() || 'Remote',
        employment_preference: 'FULL_TIME',
        salary_currency: 'USD',
        description: `${newVacancyTitle.trim()} hiring pipeline in ${newVacancyCategory}.`,
      }),
    });
    if (res.ok) {
      setNewVacancyTitle('');
      await loadOrgMeta();
      setBanner('Hiring vacancy created.');
    }
  }

  if (!context) {
    return (
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>Jobiest Employer Platform</div>
            <h1 className={styles.heroTitle}>Hire verified candidates from the Jobiest Talent Pool</h1>
            <p className={styles.heroLead}>
              Register your hiring organization to search approved candidates who have completed structured
              competency assessments and human verification. Every employer organization is verified before
              accessing candidate profiles.
            </p>
          </div>
        </section>

        {error && <div className={styles.alertError}>{error}</div>}

        <form onSubmit={registerOrganization} className={styles.card}>
          <h2 className={styles.sectionTitle}>Employer Organization Registration</h2>
          <p className={styles.sectionSub}>
            Provide corporate details so our operations team can verify your hiring organization.
          </p>
          <div className={styles.formGrid} style={{ marginTop: 14 }}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="emp-name">Company name</label>
              <input id="emp-name" className={styles.input} required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="emp-web">Company website URL</label>
              <input id="emp-web" type="url" className={styles.input} required placeholder="https://company.com" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="emp-ind">Industry</label>
              <input id="emp-ind" className={styles.input} required placeholder="Fintech, Enterprise SaaS, Healthcare..." value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="emp-loc">City / Headquarters location</label>
              <input id="emp-loc" className={styles.input} required placeholder="London / Lagos / New York" value={companyLocation} onChange={(e) => setCompanyLocation(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="emp-country">Country</label>
              <input id="emp-country" className={styles.input} required placeholder="United Kingdom / Nigeria / United States" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="emp-bill">Corporate business email</label>
              <input id="emp-bill" type="email" className={styles.input} required value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="emp-rep-name">Authorized representative name</label>
              <input id="emp-rep-name" className={styles.input} required value={repName} onChange={(e) => setRepName(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="emp-rep-role">Representative hiring role / title</label>
              <input id="emp-rep-role" className={styles.input} required placeholder="Head of Engineering / Talent Partner" value={repRole} onChange={(e) => setRepRole(e.target.value)} />
            </div>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="emp-reg-ref">Business registration reference (optional)</label>
              <input id="emp-reg-ref" className={styles.input} value={regRef} onChange={(e) => setRegRef(e.target.value)} />
            </div>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="emp-desc">Company overview and hiring needs (min 20 chars)</label>
              <textarea id="emp-desc" className={styles.textarea} required minLength={20} value={companyDescription} onChange={(e) => setCompanyDescription(e.target.value)} />
            </div>
          </div>
          <div className={styles.heroActions} style={{ marginTop: 18 }}>
            <button type="submit" disabled={loading} className={styles.btnPrimary}>
              {loading ? 'Submitting registration...' : 'Register Hiring Organization'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.statusHeader}>
          <div>
            <div className={styles.eyebrow}>Employer Talent Platform</div>
            <h1 className={styles.heroTitle}>{context.organization.company_name}</h1>
            <p className={styles.heroLead}>
              {context.organization.industry} · {context.organization.company_location} · Role: {context.membership.role}
            </p>
          </div>
          <div className={styles.heroActions}>
            <span
              className={`${styles.statusPill} ${
                context.organization.verification_status === 'VERIFIED'
                  ? styles.toneSuccess
                  : context.organization.verification_status === 'PENDING'
                    ? styles.toneWarning
                    : styles.toneDanger
              }`}
            >
              {context.organization.verification_status}
            </span>
            <Link href="/talent-pool/requests" className={styles.btnSecondary}>
              Conversations
            </Link>
          </div>
        </div>
      </section>

      {banner && <div className={styles.alertSuccess}>{banner}</div>}
      {error && <div className={styles.alertError}>{error}</div>}

      {context.organization.verification_status !== 'VERIFIED' ? (
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>Employer Verification Required Before Candidate Discovery</h2>
          <p className={styles.sectionSub}>
            Your organization status is currently <strong>{context.organization.verification_status}</strong>.
            To protect candidate privacy, Talent Pool search and CV downloads unlock immediately once a
            Jobiest administrator verifies your organization.
          </p>
          {context.organization.rejection_reason && (
            <div className={styles.alertWarn} style={{ marginTop: 12 }}>
              <strong>Verification note:</strong> {context.organization.rejection_reason}
            </div>
          )}
        </section>
      ) : (
        <>
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>Discover Approved Candidates (11 Search Dimensions)</h2>
            <p className={styles.sectionSub}>
              Only human-approved candidates with active discovery consent appear here. Raw interview
              recordings and private transcripts are never shared.
            </p>
            <div className={styles.formGrid} style={{ marginTop: 14 }}>
              <div className={styles.field}>
                <label className={styles.label}>1. Job title / target role</label>
                <input className={styles.input} placeholder="Backend Engineer, Product Manager..." value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>2. Career category</label>
                <select className={styles.select} value={careerCategory} onChange={(e) => setCareerCategory(e.target.value)}>
                  <option value="">All categories</option>
                  {CAREER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>3. Skills (comma-separated)</label>
                <input className={styles.input} placeholder="TypeScript, Python, PostgreSQL" value={skills} onChange={(e) => setSkills(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>4. Experience range (min / max yrs)</label>
                <div className={styles.heroActions}>
                  <input type="number" min={0} max={60} className={styles.input} style={{ width: '48%' }} placeholder="Min" value={minYears} onChange={(e) => setMinYears(e.target.value)} />
                  <input type="number" min={0} max={60} className={styles.input} style={{ width: '48%' }} placeholder="Max" value={maxYears} onChange={(e) => setMaxYears(e.target.value)} />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>5. Location / Country</label>
                <input className={styles.input} placeholder="London, Lagos, United Kingdom..." value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>6. Time zone</label>
                <input className={styles.input} placeholder="UTC, Africa/Lagos, Europe/London" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>7. Max salary budget</label>
                <div className={styles.heroActions}>
                  <select className={styles.select} style={{ width: '36%' }} value={salaryCurrency} onChange={(e) => setSalaryCurrency(e.target.value)}>
                    {SUPPORTED_CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>{cur}</option>
                    ))}
                  </select>
                  <input type="number" min={0} className={styles.input} style={{ width: '60%' }} placeholder="120000" value={maxSalaryBudget} onChange={(e) => setMaxSalaryBudget(e.target.value)} />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>8. Availability</label>
                <select className={styles.select} value={availability} onChange={(e) => setAvailability(e.target.value)}>
                  <option value="">Any availability</option>
                  {AVAILABILITY_OPTIONS.map((a) => (
                    <option key={a.code} value={a.code}>{a.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>9. Employment / work mode preference</label>
                <select className={styles.select} value={employmentPreference} onChange={(e) => setEmploymentPreference(e.target.value)}>
                  <option value="">Any preference</option>
                  {REMOTE_PREFERENCES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  {EMPLOYMENT_PREFERENCES.map((ep) => (
                    <option key={ep} value={ep}>{ep}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>10. Assessed competency &amp; min score</label>
                <div className={styles.heroActions}>
                  <input className={styles.input} style={{ width: '58%' }} placeholder="System design, SQL..." value={competency} onChange={(e) => setCompetency(e.target.value)} />
                  <input type="number" min={0} max={100} className={styles.input} style={{ width: '38%' }} placeholder="Score >= 70" value={minCompetencyScore} onChange={(e) => setMinCompetencyScore(e.target.value)} />
                </div>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>11. Qualification / certification</label>
                <input className={styles.input} placeholder="BSc Computer Science, AWS Solutions Architect, ACCA..." value={qualification} onChange={(e) => setQualification(e.target.value)} />
              </div>
            </div>
            <div className={styles.heroActions} style={{ marginTop: 16 }}>
              <button type="button" onClick={() => void searchCandidates(1)} disabled={loading} className={styles.btnPrimary}>
                {loading ? 'Searching...' : `Search Approved Talent (${total})`}
              </button>
            </div>
          </section>

          <section className={styles.grid3}>
            {candidates.length === 0 ? (
              <div className={styles.card} style={{ gridColumn: '1 / -1' }}>
                <p className={styles.cardBody}>
                  No approved candidates matched the active filters yet. Broaden one or more filter dimensions.
                </p>
              </div>
            ) : (
              candidates.map((cand) => (
                <article key={cand.candidate_user_id} className={styles.card}>
                  <div className={styles.statusHeader}>
                    <span className={`${styles.statusPill} ${styles.toneSuccess}`}>Verified Talent</span>
                    {cand.overall_score != null && (
                      <span className={styles.tag}>Score: {Math.round(cand.overall_score)}/100</span>
                    )}
                  </div>
                  <h3 className={styles.cardTitle} style={{ marginTop: 10 }}>
                    {cand.display_name} · {cand.headline || 'Verified Specialist'}
                  </h3>
                  <p className={styles.cardBody}>
                    {cand.career_category || 'General'} · {cand.seniority_level || 'MID'} ·{' '}
                    {cand.years_of_experience ?? 0} yrs · {cand.location || 'Remote'}
                  </p>
                  {cand.recruiter_summary && (
                    <p className={styles.cardBody} style={{ marginTop: 8 }}>
                      {cand.recruiter_summary.slice(0, 145)}
                      {cand.recruiter_summary.length > 145 ? '...' : ''}
                    </p>
                  )}
                  <div className={styles.tagRow}>
                    {cand.skills.slice(0, 6).map((s) => (
                      <span key={s} className={styles.tag}>{s}</span>
                    ))}
                  </div>
                  <div className={styles.heroActions} style={{ marginTop: 14 }}>
                    <Link href={`/employer/candidates/${cand.candidate_user_id}`} className={styles.btnPrimary}>
                      View Profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => void toggleSaveCandidate(cand.candidate_user_id, cand.saved)}
                      className={styles.btnSecondary}
                    >
                      {cand.saved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>

          {total > 12 && (
            <div className={styles.heroActions}>
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => void searchCandidates(page - 1)}
                className={styles.btnSecondary}
              >
                Previous Page
              </button>
              <span className={styles.cardBody} style={{ alignSelf: 'center' }}>
                Page {page} of {Math.max(1, Math.ceil(total / 12))}
              </span>
              <button
                type="button"
                disabled={page * 12 >= total || loading}
                onClick={() => void searchCandidates(page + 1)}
                className={styles.btnSecondary}
              >
                Next Page
              </button>
            </div>
          )}

          <div className={styles.grid2}>
            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>Shortlists ({shortlists.length})</h2>
              <div className={styles.heroActions} style={{ marginBottom: 12 }}>
                <input
                  className={styles.input}
                  placeholder="New shortlist name (e.g. Senior Backend Q4)"
                  value={newShortlistName}
                  onChange={(e) => setNewShortlistName(e.target.value)}
                />
                <button type="button" onClick={() => void createShortlist()} className={styles.btnSecondary}>
                  Create
                </button>
              </div>
              <div className={styles.tagRow}>
                {shortlists.map((s) => (
                  <span key={s.id} className={styles.tag}>{s.name}</span>
                ))}
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>Hiring Vacancies ({vacancies.length})</h2>
              <div className={styles.formGrid} style={{ marginBottom: 10 }}>
                <input
                  className={styles.input}
                  placeholder="Vacancy title (e.g. Staff Platform Engineer)"
                  value={newVacancyTitle}
                  onChange={(e) => setNewVacancyTitle(e.target.value)}
                />
                <input
                  className={styles.input}
                  placeholder="Location"
                  value={newVacancyLocation}
                  onChange={(e) => setNewVacancyLocation(e.target.value)}
                />
                <select className={styles.select} value={newVacancyCategory} onChange={(e) => setNewVacancyCategory(e.target.value)}>
                  {CAREER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select className={styles.select} value={newVacancySeniority} onChange={(e) => setNewVacancySeniority(e.target.value)}>
                  {SENIORITY_LEVELS.map((s) => (
                    <option key={s.code} value={s.code}>{s.label}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => void createVacancy()} className={styles.btnSecondary}>
                Create Vacancy
              </button>
              <div className={styles.tagRow} style={{ marginTop: 10 }}>
                {vacancies.map((v) => (
                  <span key={v.id} className={styles.tag}>{v.title} ({v.status})</span>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
