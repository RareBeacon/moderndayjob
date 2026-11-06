'use client';

import React, { useState, useRef, type KeyboardEvent, type ClipboardEvent } from 'react';

export interface ExperienceBulletEditorProps {
  bullets: string[];
  onChange: (bullets: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function ExperienceBulletEditor({
  bullets = [],
  onChange,
  disabled = false,
  className = '',
}: ExperienceBulletEditorProps) {
  const [currentInput, setCurrentInput] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addBullet = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onChange([...bullets, trimmed]);
    setCurrentInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // PREVENT parent form submission!
      e.preventDefault();
      e.stopPropagation();
      addBullet(currentInput);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const paste = e.clipboardData.getData('text');
    if (paste && paste.includes('\n')) {
      e.preventDefault();
      const lines = paste
        .split('\n')
        .map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim())
        .filter(Boolean);
      if (lines.length > 0) {
        onChange([...bullets, ...lines]);
        setCurrentInput('');
      }
    }
  };

  const removeBullet = (index: number) => {
    onChange(bullets.filter((_, i) => i !== index));
  };

  const moveBullet = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= bullets.length) return;
    const copy = [...bullets];
    const temp = copy[index];
    copy[index] = copy[target];
    copy[target] = temp;
    onChange(copy);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditingText(bullets[index]);
  };

  const saveEdit = (index: number) => {
    const trimmed = editingText.trim();
    if (!trimmed) {
      removeBullet(index);
    } else {
      const copy = [...bullets];
      copy[index] = trimmed;
      onChange(copy);
    }
    setEditingIndex(null);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Responsibilities & Achievements
        </label>
        <span className="text-[11px] text-zinc-500">
          Press <kbd className="rounded bg-zinc-800 px-1 py-0.5 text-zinc-300">Enter</kbd> to add bullet
        </span>
      </div>

      {/* Existing bullets list */}
      {bullets.length > 0 && (
        <ul className="space-y-2">
          {bullets.map((bullet, idx) => (
            <li
              key={idx}
              className="group flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-sm text-zinc-200 transition-colors hover:border-zinc-700"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#10b981]" />

              {editingIndex === idx ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit(idx);
                      } else if (e.key === 'Escape') {
                        setEditingIndex(null);
                      }
                    }}
                    autoFocus
                    className="flex-1 rounded-lg border border-[#10b981] bg-zinc-950 px-2 py-1 text-xs text-zinc-100 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => saveEdit(idx)}
                    className="rounded bg-[#10b981] px-2 py-1 text-xs font-semibold text-zinc-950"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="flex-1 text-xs sm:text-sm leading-relaxed text-zinc-300">{bullet}</div>
              )}

              {/* Action buttons */}
              {editingIndex !== idx && !disabled && (
                <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => moveBullet(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-20"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBullet(idx, 'down')}
                    disabled={idx === bullets.length - 1}
                    className="p-1 text-zinc-400 hover:text-zinc-200 disabled:opacity-20"
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(idx)}
                    className="p-1 text-zinc-400 hover:text-[#10b981]"
                    title="Edit bullet"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBullet(idx)}
                    className="p-1 text-zinc-400 hover:text-red-400"
                    title="Remove bullet"
                  >
                    ✕
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* New bullet input */}
      {!disabled && (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Describe an achievement or responsibility (e.g. Led redesign of mobile app)..."
            className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900/90 px-3.5 py-2.5 pr-20 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 transition-all focus:border-[#10b981] focus:outline-none focus:ring-1 focus:ring-[#10b981]"
          />
          {currentInput.trim() && (
            <button
              type="button"
              onClick={() => addBullet(currentInput)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-[#10b981] px-2.5 py-1 text-xs font-semibold text-zinc-950 transition-colors hover:bg-[#059669]"
            >
              Add
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-zinc-500 italic">
        Tip: Start with strong action verbs (e.g. Designed, Built, Led, Architected, Automated). Paste multiline text to auto-split into bullets.
      </p>
    </div>
  );
}
