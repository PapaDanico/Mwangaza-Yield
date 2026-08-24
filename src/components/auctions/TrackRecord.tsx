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

import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { summariseLedger, type Prediction } from '@/lib/predictions';
import { scoringVerdict } from '@/lib/prediction-verdict';
import { backtest, summariseBacktest } from '@/lib/backtest';
import { useBondStore } from '@/stores/bondStore';
import { cn } from '@/lib/utils';

/**
 * One prediction's outcome, rendered identically wherever it appears.
 *
 * It appears twice: in its own column on sm and up, and stacked under the
 * stated range below that (four columns need 368px and the narrowest phones
 * give the card 286, so the column that fell off the edge was this one — the
 * entire point of the ledger). Two call sites, one renderer, so the mobile and
 * desktop readings cannot drift apart.
 */
function Outcome({ p }: { p: Prediction }) {
  if (p.excludedOn !== undefined) {
    return <span className="text-ink-faint">not scored — {p.exclusionReason}</span>;
  }
  if (p.scoredOn === undefined) {
    return <span className="text-ink-faint">awaiting result</span>;
  }
  return (
    <span className={cn('num font-semibold', p.hitRange ? 'text-mint-700' : 'text-red-600')}>
      {p.actualRate!.toFixed(2)}% {p.hitRange ? '✓ in range' : '✗ outside'}
    </span>
  );
}

export default function TrackRecord() {
  const [ledger, setLedger] = useState<Prediction[] | null>(null);
  const bonds = useBondStore((s) => s.bonds);
  const auctionResults = useBondStore((s) => s.auctionResults);

  /* Replayed in the browser from data the store already holds, so this costs
   * no extra fetch. Memoised because it is a few hundred guidance rebuilds and
   * the inputs only change when the archive reloads. */
  const bt = useMemo(
    () =>
      auctionResults.length && bonds.length
        ? summariseBacktest(backtest(auctionResults, bonds))
        : null,
    [auctionResults, bonds]
  );

  useEffect(() => {
    fetch('/data/predictions.json')
      .then((r) => (r.ok ? r.json() : []))
      .then(setLedger)
      .catch(() => setLedger([]));
  }, []);

  // Fetched separately from the store, so this is the last thing on the page
  // to arrive and it sat below two other cards. Reserving is unconditional
  // here: this component owns its own loading state rather than the store's.
  if (!ledger) return <div className="card h-40 animate-pulse" aria-hidden="true" />;
  const s = summariseLedger(ledger);
  /* THE INTERPRETATION, FIXED BEFORE THE RESULTS.
   *
   * Written on 6 August with all five predictions unscored, so the sentence
   * for a clean sweep and the sentence for a total miss were composed to the
   * same standard by the same hand on the same day. Reading it off the counts
   * rather than writing it afterwards is what stops the outcome choosing the
   * tone. See prediction-verdict.ts. */
  const verdict = scoringVerdict(ledger, s);
  const unscored = ledger.filter((p) => p.scoredOn === undefined && p.excludedOn === undefined);
  const excluded = ledger.filter((p) => p.excludedOn !== undefined);
  const pending = unscored.length;
  // The earliest auction still awaiting a result: the date a reader can come
  // back on. `sort` over a copy — `unscored` is a fresh array, so this is safe,
  // but the rows below sort their own copy for the same reason.
  const nextResult = pending
    ? [...unscored].sort((a, b) => a.auctionDate.localeCompare(b.auctionDate))[0].auctionDate
    : null;
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
              {/* THE MIXED STATE — some scored, some still open.
                * Found by dry-running the 12 August scoring: the summary read
                * "Of 4 scored predictions" while the table showed five rows,
                * and the fifth's "awaiting result" had no explanation, because
                * the pending copy above is gated on nothing having scored yet.
                * A reader counting rows against the sentence is owed the
                * difference. */}
              {pending > 0 && (
                <>
                  {' '}
                  <span className="num">{pending}</span> more{' '}
                  {pending === 1 ? 'is' : 'are'} on the record and still waiting on CBK to
                  publish.
                </>
              )}
              {excluded.length > 0 && (
                <>
                  {' '}
                  <span className="num">{excluded.length}</span> {excluded.length === 1 ? 'entry was' : 'entries were'} excluded because the event was not a cash issuance.
                </>
              )}
            </p>
          )}
          {s.claims > 0 && (
            <div className="mt-2 rounded-xl border border-sand-300 bg-sand-50 p-3">
              <p className="text-sm font-medium text-ink">{verdict.headline}</p>
              <ul className="mt-1.5 space-y-1.5">
                {verdict.caveats.map((c) => (
                  <li key={c} className="text-xs leading-relaxed text-ink-soft">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* RECORDED BUT NOT YET SCORED — the state this card is actually in
            * today, and stays in until the first result publishes.
            *
            * The component had copy for an empty ledger and copy for a scored
            * one, and nothing for the state in between: a visitor met five rows
            * reading "awaiting result" with no sentence telling them what they
            * were looking at. That is the state a shared link lands on right
            * now, which makes it the one that most needed explaining. */}
          {s.claims === 0 && pending > 0 && (
            <p className="mt-1.5 text-sm text-ink-soft">
              <span className="num font-semibold">{pending}</span> range
              {pending === 1 ? ' is' : 's are'} on the record and not yet scored — written down
              here before bidding closed, waiting on CBK to publish what the auction actually
              paid{nextResult ? <> (the first is due after {nextResult})</> : null}. Nothing has
              been graded yet, so there is no hit rate to quote and none is claimed. The replay
              below is what there is to judge in the meantime.
            </p>
          )}
          {/* NOWRAP, AND WHY THE SCROLL CONTAINER NEEDED IT
            *
            * At 390px the cells wrapped instead of scrolling: "2026-08-24"
            * broke across two lines as "2026-" / "08-24", and "awaiting
            * result" split in two. A date broken mid-value is not a date, and
            * the ragged two-line rows made a five-row table look like ten.
            *
            * The `overflow-x-auto` wrapper was already here to handle a table
            * wider than the card — wrapping is what stopped it ever being
            * needed. `whitespace-nowrap` hands the job back to it: values stay
            * whole and the table scrolls sideways if it must. `w-full` becomes
            * `min-w-full` so the table may exceed the card rather than being
            * squeezed into it. */}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full whitespace-nowrap text-left text-xs">
              <thead className="text-ink-faint">
                <tr>
                  <th className="py-1 pr-2 font-medium sm:pr-3">Bond</th>
                  <th className="py-1 pr-2 font-medium sm:pr-3">Auction</th>
                  <th className="py-1 font-medium sm:pr-3">Stated range (%)</th>
                  <th className="hidden py-1 font-medium sm:table-cell">Result</th>
                </tr>
              </thead>
              <tbody className="text-ink-soft">
                {rows.map((r) => (
                  <tr key={`${r.issueCode}|${r.auctionDate}`} className="border-t border-sand-200">
                    {/* RECORDED-ON MOVED UNDER THE BOND CODE, NOT DROPPED
                      * Five columns did not fit 390px, and the one pushed off
                      * the edge was Result — the entire point of the ledger.
                      * The recorded-on date is the credibility artefact and
                      * could not simply go, so it sits under the code as a
                      * caption. Four columns fit; nothing was lost. */}
                    <td className="py-1.5 pr-2 align-top font-medium text-ink sm:pr-3">
                      {r.issueCode}
                      <span className="num block text-[10px] font-normal text-ink-faint">
                        rec. {r.recordedOn}
                      </span>
                    </td>
                    <td className="num py-1.5 pr-2 sm:pr-3 align-top">{r.auctionDate}</td>
                    <td className="num py-1.5 align-top sm:pr-3">
                      {r.low.toFixed(2)}–{r.high.toFixed(2)}
                      {/* The thin-sample marker sat inline after the range, in
                        * a cell that must not wrap, so it added ~75px to the
                        * widest column and pushed the table off a phone. It is
                        * a caveat on the range rather than part of it, so it
                        * reads as well on its own line — and costs no width. */}
                      {r.thin && (
                        <span className="block whitespace-normal text-[10px] text-ink-faint">
                          thin sample
                        </span>
                      )}
                      {/* `whitespace-normal` deliberately re-enables wrapping
                        * for this line and nothing else. The table-wide nowrap
                        * exists to stop dates and rates breaking mid-value; a
                        * scored outcome is a phrase ("16.42% ✗ outside"), and
                        * it is longer than "awaiting result" — pixel-tuning
                        * the column to the longest string would only hold
                        * until the wording changed. Letting the caption wrap
                        * fits any label at any width. */}
                      <span className="block whitespace-normal text-[11px] sm:hidden">
                        <Outcome p={r} />
                      </span>
                    </td>
                    <td className="hidden py-1.5 align-top sm:table-cell">
                      <Outcome p={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* THE BACKTEST, AND WHY IT SITS BELOW THE LIVE LEDGER
        *
        * The ledger above is the real record: ranges written down before the
        * auction, scored after. It began in July 2026 and will be thin for
        * months. This replays the SAME method over the archive so a reader has
        * something to judge today — but it is second, smaller, and labelled,
        * because a backtest is evidence of a weaker kind and presenting it
        * first would be putting the flattering number where the honest one
        * belongs.
        *
        * It leads with the middle-half figure rather than the full-range one.
        * The full range hits far more often and reads better; the middle half
        * is the number that shows the method is overconfident. Leading with
        * the good one and burying the bad one is how an honest calculation
        * becomes a dishonest page. */}
      {bt && bt.claims > 0 && (
        <div className="mt-4 border-t border-sand-200 pt-3">
          <p className="text-xs font-semibold text-ink-soft">
            Before the ledger existed: the same method, replayed on {bt.claims} past auctions
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Its stated middle range contained the actual clearing rate{' '}
            <span className="num font-semibold">
              {Math.round((100 * bt.hitMiddleHalf) / bt.claims)}%
            </span>{' '}
            of the time. A well-judged middle range should be right about half the time, so{' '}
            <strong>the range we quote is too narrow</strong> — it sounds more certain than the
            method has earned. The wider low-to-high range did contain it{' '}
            <span className="num">{Math.round((100 * bt.hitRange) / bt.claims)}%</span> of the
            time, and the typical miss was{' '}
            <span className="num">{bt.medianAbsErrorPp.toFixed(2)}</span> percentage points
            {bt.medianBiasPp < 0 ? ', usually quoting below what the auction paid' : ', usually quoting above what the auction paid'}.
          </p>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-ink-faint hover:text-gold-700">
              What this test can and cannot tell you
            </summary>
            <ul className="mt-1.5 space-y-1 text-ink-faint">
              <li>
                Covers {bt.firstAuction} to {bt.lastAuction}. The archive reaches back to 2009, but
                guidance only draws on auctions from 2022 — CBK&apos;s older records are missing the
                clearing rate about a fifth of the time, so a longer test would be quoting a sample
                we cannot vouch for.
              </li>
              <li>
                At each auction the range was rebuilt using only auctions dated <em>before</em> it.
                Nothing from the day itself or afterwards was used.
              </li>
              <li>
                The method was designed by people who had already seen this history. No amount of
                careful testing removes that advantage.
              </li>
              <li>
                Auctions in the same rate cycle move together, so {bt.claims} results tell you
                considerably less than {bt.claims} independent tries would.
              </li>
              <li>It says nothing about the future. The next shock will not look like the last.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
