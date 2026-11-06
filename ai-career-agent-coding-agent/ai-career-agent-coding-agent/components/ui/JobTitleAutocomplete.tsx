'use client';

import React from 'react';
import { GlobalMultiSelect, type SelectOption } from './GlobalMultiSelect';

export interface JobTitleAutocompleteProps {
  value: string[];
  onChange: (roles: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxItems?: number;
  id?: string;
}

export function JobTitleAutocomplete({
  value,
  onChange,
  placeholder = 'Search job titles (e.g. Software Engineer, Product Designer)...',
  disabled = false,
  className = '',
  maxItems = 20,
  id,
}: JobTitleAutocompleteProps) {
  const fetchRoles = async (q: string): Promise<SelectOption[]> => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);

    const res = await fetch(`/api/taxonomy/roles?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.roles || []).map((r: { title: string; category?: string; seniority?: string }) => ({
      label: r.title,
      category: r.category,
      description: r.seniority ? `Level: ${r.seniority}` : undefined,
    }));
  };

  return (
    <GlobalMultiSelect
      id={id}
      value={value}
      onChange={onChange}
      fetchSuggestions={fetchRoles}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      maxItems={maxItems}
      badgeTone="blue"
      allowCustom={true}
      aria-label="Job titles and roles"
    />
  );
}
