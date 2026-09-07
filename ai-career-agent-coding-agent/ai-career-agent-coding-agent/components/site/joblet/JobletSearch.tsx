'use client';

import { useEffect, useRef, useState } from 'react';
import { IconSearch, IconPin, IconChevron } from './Icons';

const LOCATIONS = ['Remote', 'Lagos', 'Abuja', 'Nigeria', 'United States', 'United Kingdom', 'Europe'];

/**
 * Hero job search. Client component so the input can hold state for the
 * clear (×) button and the ⌘K / Ctrl+K focus shortcut. Submits GET /jobs
 * with q + loc, which the real jobs browser filters on.
 */
export function JobletSearch() {
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses the search input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const clearable = q.length > 0;

  return (
    <form className="jl-search" action="/jobs" method="get" role="search">
      <div className="jl-search-field">
        <span className="jl-si"><IconSearch size={19} /></span>
        <input
          ref={inputRef}
          type="search"
          name="q"
          placeholder="Search for jobs, skills or companies..."
          aria-label="Search for jobs, skills or companies"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className="jl-search-clear"
          aria-label="Clear search"
          hidden={!clearable}
          onClick={() => {
            setQ('');
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      </div>
      <span className="jl-search-div" aria-hidden="true" />
      <div className="jl-search-field jl-search-loc">
        <span className="jl-si"><IconPin size={19} /></span>
        <select name="loc" aria-label="Location" value={loc} onChange={(e) => setLoc(e.target.value)}>
          <option value="">Location</option>
          {LOCATIONS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <IconChevron size={16} />
      </div>
      <span className="jl-kbd-hint" aria-hidden="true">
        <kbd>⌘</kbd><kbd>K</kbd>
      </span>
      <button className="jl-search-btn" type="submit">Search</button>
    </form>
  );
}
