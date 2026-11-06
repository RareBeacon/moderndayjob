'use client';

import React, { useState } from 'react';
import { ExperienceBulletEditor } from './ExperienceBulletEditor';
import {
  formatExperienceDateRange,
  calculateEmploymentDuration,
  validateExperienceDates,
  formatMonthName,
} from '@/lib/experience/duration';

export interface StructuredExperience {
  id?: string;
  company: string;
  title: string;
  location?: string;
  company_website?: string;
  employment_type?: string;
  workplace_type?: string;
  start_month?: number | null;
  start_year?: number | null;
  end_month?: number | null;
  end_year?: number | null;
  is_current?: boolean;
  bullets?: string[];
  description?: string;
}

export interface ExperienceBuilderProps {
  experiences: StructuredExperience[];
  onChange: (updated: StructuredExperience[]) => void;
  disabled?: boolean;
  className?: string;
}

const EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Freelance',
  'Internship',
  'Apprenticeship',
  'Self-employed',
  'Volunteer',
  'Temporary',
];

const WORKPLACE_TYPES = ['Remote', 'Hybrid', 'On-site'];

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 45 }, (_, i) => CURRENT_YEAR - i);

const EMPTY_EXP: StructuredExperience = {
  company: '',
  title: '',
  location: '',
  employment_type: 'Full-time',
  workplace_type: 'Remote',
  start_month: 1,
  start_year: CURRENT_YEAR - 1,
  end_month: null,
  end_year: null,
  is_current: true,
  bullets: [],
};

export function ExperienceBuilder({
  experiences = [],
  onChange,
  disabled = false,
  className = '',
}: ExperienceBuilderProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(experiences.length === 0);
  const [currentForm, setCurrentForm] = useState<StructuredExperience>(EMPTY_EXP);
  const [formError, setFormError] = useState('');

  const startAdding = () => {
    setCurrentForm({ ...EMPTY_EXP, id: `exp_${Date.now()}` });
    setEditingIndex(null);
    setIsAddingNew(true);
    setFormError('');
  };

  const startEditing = (index: number) => {
    setCurrentForm({ ...experiences[index] });
    setEditingIndex(index);
    setIsAddingNew(false);
    setFormError('');
  };

  const cancelEdit = () => {
    setIsAddingNew(false);
    setEditingIndex(null);
    setFormError('');
  };

  const saveExperience = () => {
    if (!currentForm.company.trim()) {
      setFormError('Please enter the company or organization name.');
      return;
    }
    if (!currentForm.title.trim()) {
      setFormError('Please enter your role or job title.');
      return;
    }

    // Date validation
    const dateValidation = validateExperienceDates({
      startMonth: currentForm.start_month,
      startYear: currentForm.start_year,
      endMonth: currentForm.end_month,
      endYear: currentForm.end_year,
      isCurrent: currentForm.is_current,
    });

    if (!dateValidation.valid) {
      setFormError(dateValidation.error || 'Please provide valid employment dates.');
      return;
    }

    const payload: StructuredExperience = {
      ...currentForm,
      company: currentForm.company.trim(),
      title: currentForm.title.trim(),
      location: currentForm.location?.trim() || undefined,
      description: currentForm.bullets && currentForm.bullets.length > 0 ? currentForm.bullets.join('\n') : currentForm.description,
    };

    if (editingIndex !== null) {
      const copy = [...experiences];
      copy[editingIndex] = payload;
      onChange(copy);
    } else {
      onChange([...experiences, payload]);
    }

    setIsAddingNew(false);
    setEditingIndex(null);
    setFormError('');
  };

  const deleteExperience = (index: number) => {
    onChange(experiences.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setIsAddingNew(false);
      setEditingIndex(null);
    }
  };

  const calculatedDuration = calculateEmploymentDuration({
    startMonth: currentForm.start_month,
    startYear: currentForm.start_year,
    endMonth: currentForm.end_month,
    endYear: currentForm.end_year,
    isCurrent: currentForm.is_current,
  });

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Existing Experiences Card List */}
      {experiences.length > 0 && (
        <div className="space-y-3">
          {experiences.map((exp, idx) => {
            const dateRange = formatExperienceDateRange({
              startMonth: exp.start_month,
              startYear: exp.start_year,
              endMonth: exp.end_month,
              endYear: exp.end_year,
              isCurrent: exp.is_current,
            });

            const duration = calculateEmploymentDuration({
              startMonth: exp.start_month,
              startYear: exp.start_year,
              endMonth: exp.end_month,
              endYear: exp.end_year,
              isCurrent: exp.is_current,
            });

            const bullets = exp.bullets && exp.bullets.length > 0
              ? exp.bullets
              : exp.description ? exp.description.split('\n').filter(Boolean) : [];

            return (
              <div
                key={exp.id || idx}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-5 shadow-lg transition-all hover:border-zinc-700"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold text-zinc-100">{exp.title}</h4>
                    <p className="text-sm font-medium text-[#10b981]">{exp.company}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      {dateRange && <span>{dateRange}</span>}
                      {duration && <span className="text-zinc-500 font-medium">({duration.label})</span>}
                      {exp.employment_type && (
                        <>
                          <span className="text-zinc-600">·</span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5">{exp.employment_type}</span>
                        </>
                      )}
                      {exp.location && (
                        <>
                          <span className="text-zinc-600">·</span>
                          <span>{exp.location}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {!disabled && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditing(idx)}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteExperience(idx)}
                        className="rounded-lg border border-red-900/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/40"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {bullets.length > 0 && (
                  <ul className="mt-3.5 space-y-1.5 border-t border-zinc-800/80 pt-3 text-xs text-zinc-300">
                    {bullets.map((b, bIdx) => (
                      <li key={bIdx} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add New Button (when not currently editing/adding) */}
      {!isAddingNew && editingIndex === null && !disabled && (
        <button
          type="button"
          onClick={startAdding}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700/80 bg-zinc-900/40 py-4 text-xs sm:text-sm font-semibold text-zinc-300 transition-colors hover:border-[#10b981] hover:bg-zinc-900 hover:text-[#10b981]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Experience
        </button>
      )}

      {/* Editing / Adding Form */}
      {(isAddingNew || editingIndex !== null) && !disabled && (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4 sm:p-6 shadow-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h4 className="text-sm font-semibold text-zinc-100">
              {editingIndex !== null ? 'Edit Professional Experience' : 'Add Professional Experience'}
            </h4>
            <span className="text-xs text-zinc-500">
              {currentForm.is_current ? 'Ongoing position' : 'Past role'}
            </span>
          </div>

          {formError && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
              {formError}
            </div>
          )}

          {/* Core Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                Job Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={currentForm.title}
                onChange={(e) => setCurrentForm({ ...currentForm, title: e.target.value })}
                placeholder="e.g. Senior Frontend Developer"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:border-[#10b981] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                Company / Organization <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={currentForm.company}
                onChange={(e) => setCurrentForm({ ...currentForm, company: e.target.value })}
                placeholder="e.g. Acme Tech Solutions"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:border-[#10b981] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                Location
              </label>
              <input
                type="text"
                value={currentForm.location || ''}
                onChange={(e) => setCurrentForm({ ...currentForm, location: e.target.value })}
                placeholder="e.g. Lagos, Nigeria"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:border-[#10b981] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                  Type
                </label>
                <select
                  value={currentForm.employment_type || 'Full-time'}
                  onChange={(e) => setCurrentForm({ ...currentForm, employment_type: e.target.value })}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-xs sm:text-sm text-zinc-100 focus:border-[#10b981] focus:outline-none"
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                  Workplace
                </label>
                <select
                  value={currentForm.workplace_type || 'Remote'}
                  onChange={(e) => setCurrentForm({ ...currentForm, workplace_type: e.target.value })}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-2.5 text-xs sm:text-sm text-zinc-100 focus:border-[#10b981] focus:outline-none"
                >
                  {WORKPLACE_TYPES.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Dates & Duration Section */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Employment Duration
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={currentForm.is_current || false}
                  onChange={(e) =>
                    setCurrentForm({
                      ...currentForm,
                      is_current: e.target.checked,
                      end_month: e.target.checked ? null : 12,
                      end_year: e.target.checked ? null : CURRENT_YEAR,
                    })
                  }
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-[#10b981] focus:ring-[#10b981]"
                />
                <span>I currently work here</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Start Date */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Start Date</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={currentForm.start_month || 1}
                    onChange={(e) => setCurrentForm({ ...currentForm, start_month: Number(e.target.value) })}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-100 focus:border-[#10b981] focus:outline-none"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <select
                    value={currentForm.start_year || CURRENT_YEAR - 1}
                    onChange={(e) => setCurrentForm({ ...currentForm, start_year: Number(e.target.value) })}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-100 focus:border-[#10b981] focus:outline-none"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* End Date */}
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  End Date {currentForm.is_current && <span className="text-[#10b981] font-medium">(Present)</span>}
                </label>
                {currentForm.is_current ? (
                  <div className="flex items-center h-[38px] rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 text-xs text-[#10b981] font-medium">
                    Present (Ongoing role)
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={currentForm.end_month || 12}
                      onChange={(e) => setCurrentForm({ ...currentForm, end_month: Number(e.target.value) })}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-100 focus:border-[#10b981] focus:outline-none"
                    >
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <select
                      value={currentForm.end_year || CURRENT_YEAR}
                      onChange={(e) => setCurrentForm({ ...currentForm, end_year: Number(e.target.value) })}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-100 focus:border-[#10b981] focus:outline-none"
                    >
                      {YEARS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Calculated duration display */}
            {calculatedDuration && (
              <p className="text-xs text-[#10b981] font-medium pt-1">
                Calculated duration: {calculatedDuration.label}
              </p>
            )}
          </div>

          {/* Dynamic Bullet Editor */}
          <ExperienceBulletEditor
            bullets={currentForm.bullets || []}
            onChange={(bullets) => setCurrentForm({ ...currentForm, bullets })}
          />

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            {experiences.length > 0 && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-xs sm:text-sm font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={saveExperience}
              className="rounded-xl bg-[#10b981] px-5 py-2 text-xs sm:text-sm font-semibold text-zinc-950 transition-colors hover:bg-[#059669]"
            >
              {editingIndex !== null ? 'Update Experience' : 'Save Experience'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
