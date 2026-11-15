'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A panel that is a one-line disclosure on a phone and simply the panel from
 * `lg` up.
 *
 * The dashboard ran 7,366px on a 390px screen (measured 15 Nov 2026), and the
 * four context panels (inflation, rate cycle, yield curve, a year of auctions)
 * were 3,350px of it. They stay in the page, so crawlers, previews and readers
 * keep them, but a phone reader chooses which to open instead of scrolling past
 * all four to reach the next tool.
 *
 * The server renders it collapsed on small screens and open on large ones, so
 * nothing moves when the client arrives: no layout shift either way. Collapsed
 * content is `display: none`, which also takes it out of the accessibility tree
 * until opened. The button is hidden from `lg`, where the panel is always shown.
 */
export default function MobileFold({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-sand-200 bg-sand-50/60 px-4 py-2.5 text-left lg:hidden"
      >
        <span>
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
        </span>
        <span aria-hidden className={cn('text-lg text-gold-700 transition-transform', open && 'rotate-45')}>+</span>
      </button>
      <div id={panelId} className={cn(open ? 'mt-3' : 'max-lg:hidden')}>
        {children}
      </div>
    </section>
  );
}
