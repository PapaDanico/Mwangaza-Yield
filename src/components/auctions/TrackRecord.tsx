'use client';

/**
 * The bid assistant's public track record.
 *
 * Every range in this list was recorded BEFORE its auction closed — the
 * recorded-on date is part of the entry — and scored against the clearing
 * rate CBK published afterwards. The ledger is append-only (enforced by
 * scripts/update-predictions.mjs and pinned by tests), which is the entire
 * point: a forecast that can be edited after the fact is marketing, and this
 * page is meant to be checkable instead.
 */

import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { summariseLedger, type Prediction } from '@/lib/predictions';
import { cn } from '@/lib/utils';

export default function TrackRecord() {
  const [ledger, setLedger] = useState<Prediction[] | null>(null);

  useEffect(() => {
    fetch('/data/predictions.json')
      .then((r) => (r.ok ? r.json() : []))
      .then(setLedger)
      .catch(() => setLedger([]));
  }, []);

  if (!ledger) return null;
  const s = summariseLedger(ledger);
  const rows = [...ledger].sort((a, b) => b.auctionDate.localeCompare(a.auctionDate)).slice(0, 12);

  return (
    <div className="card">
      <div className="flex items-center gap-2">
        <ClipboardCheck size={16} className="text-gold-700" />
        <h2 className="font-display font-semibold text-ink">Bid guidance track record</h2>
      </div>

      {ledger.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          Nothing to show yet — and that is deliberate. When CBK announces the next auction, the
          guidance range is recorded here <em>before</em> bidding closes, then scored against the
          published result. A forecast only counts if it was written down first.
        </p>
      ) : (
        <>
          {s.claims > 0 && (
            <p className="mt-1.5 text-sm text-ink-soft">
              Of <span className="num font-semibold">{s.claims}</span> scored prediction{s.claims === 1 ? '' : 's'},
              the stated range contained the actual clearing rate{' '}
              <span className="num font-semibold">{s.hitRange}</span> time{s.hitRange === 1 ? '' : 's'}
              {' '}(middle half: <span className="num">{s.hitMiddleHalf}</span>).
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-faint">
                <tr>
                  <th className="py-1 pr-3 font-medium">Bond</th>
                  <th className="py-1 pr-3 font-medium">Auction</th>
                  <th className="py-1 pr-3 font-medium">Recorded</th>
                  <th className="py-1 pr-3 font-medium">Stated range</th>
                  <th className="py-1 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="text-ink-soft">
                {rows.map((r) => (
                  <tr key={`${r.issueCode}|${r.auctionDate}`} className="border-t border-sand-200">
                    <td className="py-1.5 pr-3 font-medium text-ink">{r.issueCode}</td>
                    <td className="num py-1.5 pr-3">{r.auctionDate}</td>
                    <td className="num py-1.5 pr-3">{r.recordedOn}</td>
                    <td className="num py-1.5 pr-3">
                      {r.low.toFixed(2)}–{r.high.toFixed(2)}%{r.thin && (
                        <span className="ml-1 text-ink-faint">(thin sample)</span>
                      )}
                    </td>
                    <td className="py-1.5">
                      {r.scoredOn === undefined ? (
                        <span className="text-ink-faint">awaiting result</span>
                      ) : (
                        <span
                          className={cn(
                            'num font-semibold',
                            r.hitRange ? 'text-mint-700' : 'text-red-600'
                          )}
                        >
                          {r.actualRate!.toFixed(2)}% {r.hitRange ? '✓ in range' : '✗ outside'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
