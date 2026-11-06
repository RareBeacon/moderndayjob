'use client';

import React from 'react';
import { GlobalMultiSelect, type SelectOption } from './GlobalMultiSelect';

export interface LocationAutocompleteProps {
  value: string[];
  onChange: (locations: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxItems?: number;
  id?: string;
}

export function LocationAutocomplete({
  value,
  onChange,
  placeholder = 'Search locations (e.g. Lagos, London, New York, Remote)...',
  disabled = false,
  className = '',
  maxItems = 15,
  id,
}: LocationAutocompleteProps) {
  const fetchLocations = async (q: string): Promise<SelectOption[]> => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);

    const res = await fetch(`/api/taxonomy/locations?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.locations || []).map((l: { displayName: string; city?: string; country?: string }) => ({
      label: l.displayName,
      description: l.country ? `Country: ${l.country}` : undefined,
    }));
  };

  return (
    <GlobalMultiSelect
      id={id}
      value={value}
      onChange={onChange}
      fetchSuggestions={fetchLocations}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      maxItems={maxItems}
      badgeTone="neutral"
      allowCustom={true}
      aria-label="Work and preferred locations"
    />
  );
}
