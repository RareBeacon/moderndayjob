'use client';

import React, { useState, useEffect, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';

export interface SelectOption {
  id?: string;
  label: string;
  category?: string;
  description?: string;
  extra?: Record<string, unknown>;
}

export interface GlobalMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  fetchSuggestions?: (query: string) => Promise<SelectOption[]>;
  staticOptions?: SelectOption[];
  placeholder?: string;
  maxItems?: number;
  allowCustom?: boolean;
  disabled?: boolean;
  className?: string;
  badgeTone?: 'lime' | 'blue' | 'purple' | 'neutral';
  renderOptionDetails?: (option: SelectOption) => React.ReactNode;
  'aria-label'?: string;
  id?: string;
}

export function GlobalMultiSelect({
  value = [],
  onChange,
  fetchSuggestions,
  staticOptions,
  placeholder = 'Type to search...',
  maxItems = 50,
  allowCustom = true,
  disabled = false,
  className = '',
  badgeTone = 'lime',
  renderOptionDetails,
  'aria-label': ariaLabel = 'Search and select items',
  id,
}: GlobalMultiSelectProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<SelectOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const search = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed && !staticOptions) {
        setSuggestions([]);
        setIsOpen(false);
        return;
      }

      setLoading(true);
      try {
        let results: SelectOption[] = [];
        if (fetchSuggestions) {
          results = await fetchSuggestions(trimmed);
        } else if (staticOptions) {
          const lower = trimmed.toLowerCase();
          results = staticOptions.filter((opt) =>
            !lower ? true : opt.label.toLowerCase().includes(lower),
          );
        }

        // Filter out already selected options
        const lowerSelected = new Set(value.map((v) => v.toLowerCase()));
        const filtered = results.filter((opt) => !lowerSelected.has(opt.label.toLowerCase()));

        setSuggestions(filtered);
        setIsOpen(filtered.length > 0 || (allowCustom && trimmed.length > 0));
        setHighlightedIndex(filtered.length > 0 ? 0 : -1);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [fetchSuggestions, staticOptions, value, allowCustom],
  );

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setInputValue(nextVal);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      search(nextVal);
    }, 150);
  };

  const addItem = (itemLabel: string) => {
    const trimmed = itemLabel.trim();
    if (!trimmed) return;
    if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
    if (value.length >= maxItems) return;

    onChange([...value, trimmed]);
    setInputValue('');
    setSuggestions([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const removeItem = (itemToRemove: string) => {
    onChange(value.filter((v) => v !== itemToRemove));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen && (suggestions.length > 0 || inputValue.trim())) {
        setIsOpen(true);
        return;
      }
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        addItem(suggestions[highlightedIndex].label);
      } else if (allowCustom && inputValue.trim()) {
        addItem(inputValue.trim());
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last tag on backspace if input is empty
      removeItem(value[value.length - 1]);
    }
  };

  const badgeClass =
    badgeTone === 'lime'
      ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
      : badgeTone === 'blue'
        ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
        : badgeTone === 'purple'
          ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
          : 'bg-zinc-800 text-zinc-200 border-zinc-700';

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Container holding selected chips and typing input */}
      <div
        className={`min-h-[46px] w-full rounded-xl border border-zinc-700/80 bg-zinc-900/90 px-3 py-2 text-sm text-zinc-100 transition-all focus-within:border-[#10b981] focus-within:ring-1 focus-within:ring-[#10b981] ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {value.map((item) => (
            <span
              key={item}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${badgeClass}`}
            >
              <span>{item}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeItem(item);
                  }}
                  className="rounded-full hover:opacity-75 focus:outline-none"
                  aria-label={`Remove ${item}`}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </span>
          ))}

          {/* Typing input */}
          {value.length < maxItems && (
            <input
              id={id}
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (inputValue.trim() || staticOptions) search(inputValue);
              }}
              disabled={disabled}
              placeholder={value.length === 0 ? placeholder : 'Add more...'}
              aria-label={ariaLabel}
              autoComplete="off"
              className="flex-1 min-w-[120px] bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
            />
          )}
        </div>
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl backdrop-blur-md">
          {loading && (
            <div className="p-3 text-xs text-zinc-400 flex items-center gap-2">
              <svg className="animate-spin h-3.5 w-3.5 text-[#10b981]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Finding matching suggestions...</span>
            </div>
          )}

          {!loading && suggestions.length === 0 && allowCustom && inputValue.trim() && (
            <div
              className="cursor-pointer p-3 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center justify-between"
              onClick={() => addItem(inputValue.trim())}
            >
              <span>Add custom: &quot;<strong>{inputValue.trim()}</strong>&quot;</span>
              <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">Press Enter</span>
            </div>
          )}

          {!loading && suggestions.length === 0 && !inputValue.trim() && (
            <div className="p-3 text-xs text-zinc-500">Type to search available suggestions...</div>
          )}

          {!loading &&
            suggestions.map((opt, idx) => {
              const isHighlighted = idx === highlightedIndex;
              return (
                <div
                  key={`${opt.label}-${idx}`}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => addItem(opt.label)}
                  className={`cursor-pointer px-3.5 py-2 text-xs transition-colors flex flex-col gap-0.5 ${
                    isHighlighted ? 'bg-[#10b981]/20 text-[#10b981]' : 'text-zinc-200 hover:bg-zinc-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{opt.label}</span>
                    {opt.category && (
                      <span className="text-[10px] uppercase tracking-wider text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                        {opt.category}
                      </span>
                    )}
                  </div>
                  {opt.description && (
                    <p className="text-[11px] text-zinc-400 line-clamp-1">{opt.description}</p>
                  )}
                  {renderOptionDetails && renderOptionDetails(opt)}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
