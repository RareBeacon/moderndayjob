'use client';
import { useState } from 'react';

const ITEMS = [
  { q: 'Will Jobiest lie on my CV or applications?', a: 'Never. Every CV, cover letter and answer is generated only from facts you verified in your profile. If something is missing or uncertain, it flags it rather than inventing it.' },
  { q: 'Does it read my email inbox?', a: 'No. There is no inbox access, no email OAuth and no stored email password. You provide an application email address only — the contact address used when you apply.' },
  { q: 'Does it bypass CAPTCHAs or bot protection?', a: 'No — never. The agent stops on CAPTCHAs, logins, access restrictions and unsupported sites. Auto mode only submits eligible applications within rules you set.' },
  { q: 'Is it really free?', a: 'Yes. The free tier is forever: 2 AI career credits a day, CV generation, ATS checks, job matching and tracking. Upgrade only when you want automation.' },
  { q: 'Does it work for my profession?', a: 'Yes — it is profession-agnostic. Whether you are an AI engineer, designer, marketer, creator or anything else, the same profile, matching and application tools apply.' },
  { q: 'How much control do I have?', a: 'Full control. Choose Draft, Assist, Approval (recommended) or Auto. In Approval mode you approve every application before it is sent.' },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq">
      {ITEMS.map((it, i) => {
        const isOpen = open === i;
        return (
          <div className="faq-item" key={i}>
            <button type="button" className="faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
              <span>{it.q}</span>
              <span className="chev" aria-hidden="true">+</span>
            </button>
            <div className={`faq-a${isOpen ? ' open' : ''}`}>
              <div><p>{it.a}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
