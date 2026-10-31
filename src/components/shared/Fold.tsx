import type { ReactNode } from 'react';

/**
 * Explanatory text kept in the page (so crawlers, previews and readers without
 * JavaScript still get it) but folded away, so a phone reader reaches the next
 * tool without scrolling past three screens of prose. Native <details>: no
 * client JavaScript, keyboard and screen-reader behaviour for free.
 */
export default function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-sand-200 bg-sand-50/60 px-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink marker:content-none">
        {title}
        <span aria-hidden className="text-lg text-gold-700 transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="space-y-4 pb-4">{children}</div>
    </details>
  );
}
