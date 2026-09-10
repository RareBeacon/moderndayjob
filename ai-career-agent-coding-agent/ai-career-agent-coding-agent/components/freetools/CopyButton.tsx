'use client';

export function CopyButton({ text }: { text: string }) {
  return <button className="btn secondary" onClick={() => navigator.clipboard.writeText(text).catch(() => undefined)}>Copy</button>;
}
