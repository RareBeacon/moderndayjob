'use client';

import React, { useState } from 'react';
import { GlobalMultiSelect, type SelectOption } from './GlobalMultiSelect';

export interface StrengthAutocompleteProps {
  value: string[];
  onChange: (strengths: string[]) => void;
  reflection?: string;
  onReflectionChange?: (text: string) => void;
  showReflection?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const CATEGORY_TABS = [
  { id: 'all', label: 'All' },
  { id: 'thinking_problem_solving', label: 'Thinking & Problem-Solving' },
  { id: 'leadership_ownership', label: 'Leadership & Ownership' },
  { id: 'communication_collaboration', label: 'Communication & Collaboration' },
  { id: 'execution_work_ethic', label: 'Execution & Work Ethic' },
  { id: 'creativity_innovation', label: 'Creativity & Innovation' },
  { id: 'learning_growth', label: 'Learning & Growth' },
  { id: 'interpersonal_customer_facing', label: 'Interpersonal' },
] as const;

export function StrengthAutocomplete({
  value,
  onChange,
  reflection = '',
  onReflectionChange,
  showReflection = false,
  placeholder = 'Search personal strengths (e.g. Critical Thinking, Ownership, Adaptability)...',
  disabled = false,
  className = '',
  id,
}: StrengthAutocompleteProps) {
  const [selectedCat, setSelectedCat] = useState<string>('all');

  const fetchStrengths = async (q: string): Promise<SelectOption[]> => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (selectedCat !== 'all') params.set('category', selectedCat);

    const res = await fetch(`/api/taxonomy/strengths?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.strengths || []).map((s: { name: string; category?: string; description?: string }) => ({
      label: s.name,
      category: s.category?.replace(/_/g, ' '),
      description: s.description,
    }));
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Category tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedCat(tab.id)}
            className={`shrink-0 rounded-lg px-2.5 py-1 font-medium transition-colors ${
              selectedCat === tab.id
                ? 'bg-purple-500 text-white font-semibold'
                : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <GlobalMultiSelect
        id={id}
        value={value}
        onChange={onChange}
        fetchSuggestions={fetchStrengths}
        placeholder={placeholder}
        disabled={disabled}
        badgeTone="purple"
        allowCustom={true}
        aria-label="Personal strengths"
      />

      {/* Guidance note */}
      <p className="text-xs text-zinc-400 italic">
        Tip: Select 5–10 strengths that genuinely describe how you work, think, and collaborate.
      </p>

      {/* Optional reflection textarea */}
      {showReflection && onReflectionChange && (
        <div className="pt-2">
          <label className="block text-xs font-medium text-zinc-300 mb-1">
            Optional: How do your key strengths show up in your work?
          </label>
          <textarea
            value={reflection}
            onChange={(e) => onReflectionChange(e.target.value)}
            disabled={disabled}
            placeholder="In my day-to-day work, I break down complex problems systematically and take full ownership of product delivery..."
            rows={3}
            maxLength={2000}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900/90 p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
      )}
    </div>
  );
}
