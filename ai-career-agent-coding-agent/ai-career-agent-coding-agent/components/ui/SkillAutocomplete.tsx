'use client';

import React, { useState } from 'react';
import { GlobalMultiSelect, type SelectOption } from './GlobalMultiSelect';

export interface SkillAutocompleteProps {
  value: string[];
  onChange: (skills: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const SKILL_CATEGORIES = [
  'All',
  'Technical Skills',
  'Software and Technology',
  'Design and Creative',
  'Data and Analytics',
  'Business and Management',
  'Marketing and Sales',
  'Communication',
  'Finance and Accounting',
] as const;

export function SkillAutocomplete({
  value,
  onChange,
  placeholder = 'Search skills (e.g. React, Python, UI/UX Design, Figma)...',
  disabled = false,
  className = '',
  id,
}: SkillAutocompleteProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const fetchSkills = async (q: string): Promise<SelectOption[]> => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (selectedCategory && selectedCategory !== 'All') params.set('category', selectedCategory);

    const res = await fetch(`/api/taxonomy/skills?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.skills || []).map((s: { name: string; category?: string }) => ({
      label: s.name,
      category: s.category,
    }));
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Category filter pills for rapid discovery */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        {SKILL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`shrink-0 rounded-lg px-2.5 py-1 font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-[#10b981] text-zinc-950 font-semibold'
                : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <GlobalMultiSelect
        id={id}
        value={value}
        onChange={onChange}
        fetchSuggestions={fetchSkills}
        placeholder={placeholder}
        disabled={disabled}
        badgeTone="lime"
        allowCustom={true}
        aria-label="Professional skills"
      />
    </div>
  );
}
