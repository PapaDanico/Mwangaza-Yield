'use client';

/**
 * The copy-paste half of the feed page.
 *
 * A documented endpoint that a developer has to retype is a documented endpoint
 * they get wrong once and give up on. These are the two things they actually
 * need — the URL, and a working call — with the button that puts either on the
 * clipboard.
 *
 * The snippet reads `netEAY` rather than `quotedDiscountRate` on purpose. It is
 * the first thing anyone copies, so it is also the strongest place to make the
 * right field the default one; the note beneath says why in one line rather
 * than leaving it to the prose further down the page.
 */

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { FEED_JSON_URL, FEED_CSV_URL, FEED_SNIPPET } from '@/lib/feed-meta';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked (insecure context, or permission refused). The
          // text is on screen and selectable, so this is a convenience that
          // failed, not a feature that broke — saying so would be noise.
        }
      }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-sand-300 px-3 text-xs font-medium text-ink-soft hover:bg-sand-100"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function FeedSnippets() {
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-display font-semibold text-ink">The endpoints</h2>
        <div className="mt-2 space-y-2">
          {[
            { url: FEED_JSON_URL, label: 'JSON', hint: 'everything, with the notes' },
            { url: FEED_CSV_URL, label: 'CSV', hint: 'the T-bill rows, for a spreadsheet' },
          ].map((e) => (
            <div key={e.url} className="flex flex-wrap items-center gap-2">
              <code className="num min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-sand-100 px-2 py-2 text-xs text-ink">
                {e.url}
              </code>
              <CopyButton text={e.url} label={`the ${e.label} endpoint`} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-semibold text-ink">Read it in a browser</h2>
          <CopyButton text={FEED_SNIPPET} label="the snippet" />
        </div>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-ink px-3 py-3 text-xs leading-relaxed text-sand-50">
          <code>{FEED_SNIPPET}</code>
        </pre>
        <p className="mt-2 text-xs text-ink-faint">
          No key, no build step, no server in between — the feed allows any origin. It reads{' '}
          <code>netEAY</code>, the yield after withholding tax, because{' '}
          <code>quotedDiscountRate</code> is CBK&apos;s quote and not a return.
        </p>
      </div>
    </div>
  );
}
