'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A "how is this computed?" disclosure.
 *
 * The app's habit is to show a number and stand behind it; this is the
 * standard place to put the method without burying the number under it.
 * Collapsed by default — the reader who trusts the figure loses nothing,
 * the reader who wants to check it gets the whole answer in place instead
 * of a support e-mail.
 */
export default function Explain({
  label = 'How is this computed?',
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        /* 44px, not 32px. This is a disclosure for the reader who does not yet
           trust the number — the one most likely to be on a cheap phone, and
           the last person who should have to tap twice. */
        className="flex min-h-11 items-center gap-1 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
        {label}
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl bg-sand-100 p-3 text-xs leading-relaxed text-ink-soft">
          {children}
        </div>
      )}
    </div>
  );
}
