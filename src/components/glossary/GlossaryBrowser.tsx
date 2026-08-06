'use client';

/**
 * The glossary, searchable.
 *
 * THE ANCHOR PROBLEM, AND WHY IT DECIDES THE DESIGN
 * ------------------------------------------------
 * `<Term>` links to `/glossary/#slug` from all over the app, so readers arrive
 * here aimed at one section. If a filter were applied before that jump — from
 * a remembered query, a restored form value, anything — the browser would look
 * for an id that is no longer in the document and land the reader at the top of
 * a page they were sent to the middle of, with no error and no explanation.
 *
 * So the query starts empty and is never persisted. Everything renders on first
 * paint, the hash resolves, and filtering only ever happens after a deliberate
 * keystroke. Clearing the box restores the full list, and the chip strip stays
 * complete so every anchor remains reachable however the list is filtered.
 *
 * WHY THE COUNT IS ALWAYS SHOWN
 * -----------------------------
 * A filtered list with no count looks like the whole glossary to anyone who
 * did not notice their own typing — this app has already shipped one panel
 * that silently showed a subset. "6 of 28" is one line and removes the doubt.
 */

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { GLOSSARY } from '@/lib/glossary';
import { searchGlossary, whyMatched } from '@/lib/glossary-search';

export default function GlossaryBrowser() {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchGlossary(GLOSSARY, query), [query]);
  const filtering = query.trim().length > 0;

  return (
    <div className="not-prose">
      <div className="relative my-6">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every term and explanation"
          aria-label="Search the glossary"
          className="w-full rounded-xl border border-sand-300 bg-sand-50 py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-ink-faint focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/30"
        />
        {filtering && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear the search"
            /* The 16px icon sits inside a 40px button: the target is the
               button, not the glyph. */
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint transition hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="mb-4 text-xs text-ink-faint" aria-live="polite">
        {filtering ? (
          hits.length === 0 ? (
            <>
              Nothing matches <strong className="text-ink-soft">{query}</strong>. The glossary
              covers the bond market&apos;s own vocabulary — if this is a word we should explain,
              we would genuinely like to know.
            </>
          ) : (
            <>
              Showing <span className="num font-semibold text-ink-soft">{hits.length}</span> of{' '}
              <span className="num">{GLOSSARY.length}</span> terms. Explanations are searched too,
              not just the names.
            </>
          )
        ) : (
          <>
            <span className="num">{GLOSSARY.length}</span> terms, in the order you will meet them.
          </>
        )}
      </p>

      {/* The full chip strip, always. Filtering the jump list as well would
          make an anchor unreachable at the exact moment a reader is hunting
          for it. */}
      <nav aria-label="Jump to a term" className="mb-6 flex flex-wrap gap-1.5">
        {GLOSSARY.map((t) => (
          <a
            key={t.slug}
            href={`#${t.slug}`}
            onClick={() => setQuery('')}
            className="rounded-lg border border-sand-300 bg-sand-100 px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-gold-500 hover:text-ink"
          >
            {t.term}
          </a>
        ))}
      </nav>

      <div className="space-y-3">
        {hits.map(({ term: t, ...hit }) => {
          const note = filtering ? whyMatched({ term: t, ...hit }) : null;
          return (
            <section
              key={t.slug}
              id={t.slug}
              className="scroll-mt-24 rounded-xl border border-sand-300 bg-sand-50 p-4"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="font-display text-base font-bold text-ink">{t.term}</h2>
                {t.also && <span className="text-xs text-ink-faint">also: {t.also}</span>}
                {note && <span className="text-xs text-ink-faint">· {note}</span>}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{t.plain}</p>
              {t.why && (
                <p className="mt-2 border-l-2 border-gold-500 pl-3 text-sm leading-relaxed text-ink-muted">
                  {t.why}
                </p>
              )}
              {t.precise && (
                <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                  <span className="font-semibold uppercase tracking-wider">Precisely: </span>
                  {t.precise}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
