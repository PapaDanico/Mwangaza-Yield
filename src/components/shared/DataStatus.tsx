'use client';

/**
 * The data-health dot in the navbar, and the panel behind it.
 *
 * WHY THIS READS data-freshness.ts AND NOT A THRESHOLD OF ITS OWN
 * --------------------------------------------------------------
 * This component shipped with its own freshness rule — under 6 hours "fresh",
 * under 24 "stale", under 72 "old", beyond that "expired" — applied to each
 * dataset's newest record date. Every part of that was wrong for this project:
 *
 *   - The refresh is scheduled twice a day, at 03:17 and 15:17 UTC. A 6-hour
 *     "fresh" window means the dot spends half of every healthy day amber.
 *   - Sunday has no scheduled run at all, so a correct Sunday evening read is
 *     over a day old and the rule called it "old" — red, all weekend, every
 *     weekend. data-freshness.ts exists precisely because of that case and its
 *     header says so.
 *   - Datasets have their own cadences. Sovereign context is 595 days old
 *     against a 900-day budget and is perfectly healthy; a 72-hour rule calls
 *     it expired.
 *   - The date it judged was the newest record IN the dataset, not when the
 *     data was fetched. For auctions that is a scheduled FUTURE auction, so the
 *     age came out negative and the rule reported "fresh" — freshness derived
 *     from a calendar entry that has not happened yet.
 *
 * On 2026-08-20, with the pipeline having run on time the previous afternoon,
 * the panel reported three of its four datasets "old" and the fourth "fresh"
 * for the wrong reason.
 *
 * So freshness is not computed here. The dot comes from `freshness()`, which
 * counts SCHEDULED RUNS THAT DID NOT HAPPEN, and the per-dataset rows come from
 * freshness.json, which the pipeline writes with each dataset's real budget.
 * One cadence table, in the place that already owned it. What stays local is
 * QUALITY — completeness and outliers — which is a different question from age
 * and genuinely has no other home.
 */

import { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Download } from 'lucide-react';
import { computeDataQuality, type QualityScore } from '@/lib/data-quality';
import {
  datasetFreshness,
  freshness,
  freshnessNotice,
  type DatasetFreshness,
} from '@/lib/data-freshness';
import meta from '../../../public/data/meta.json';

/**
 * Datasets whose contents we can score for quality, and where to read them.
 *
 * Deliberately does NOT carry a source string. The previous version listed
 * "NSE/CBK" and "KNBS/CBK/World Bank" here, which put the two sources this
 * project is not permitted to redistribute — see licences.ts — on screen as
 * attributions, in a hand-kept list that no test could hold to the registry.
 * Provenance belongs to /sources and licences.ts, which is where the panel now
 * points instead of restating it.
 */
const SCORED = [
  { file: 'macro.json', label: 'Macro (CBR, CPI, FX)' },
  { file: 'bonds.json', label: 'Bonds' },
  { file: 'auctions.json', label: 'Auctions' },
  { file: 'tbills.json', label: 'Treasury bills' },
] as const;

/** Worst state loudest. The previous order left `expired` grey — calmer than `old`. */
function badgeClass(stale: boolean): string {
  return stale ? 'bg-red-600 text-sand-50' : 'bg-mint-600 text-sand-50';
}

export default function DataStatus() {
  const [open, setOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [quality, setQuality] = useState<Record<string, QualityScore>>({});
  const [raw, setRaw] = useState<Record<string, unknown[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const updateNet = () => setOffline(!navigator.onLine);
    updateNet();
    window.addEventListener('online', updateNet);
    window.addEventListener('offline', updateNet);
    return () => {
      window.removeEventListener('online', updateNet);
      window.removeEventListener('offline', updateNet);
    };
  }, []);

  const rows: DatasetFreshness[] = useMemo(() => datasetFreshness(), []);
  const fresh = useMemo(() => freshness(new Date()), []);
  const notice = useMemo(() => freshnessNotice(fresh), [fresh]);

  /**
   * Fetch the datasets only when the panel is opened.
   *
   * They were previously fetched on mount, on every page, including on phones
   * where the button is hidden by a `lg:` breakpoint and the panel can never be
   * opened at all — several tens of kilobytes of JSON pulled to compute a
   * number nobody could see.
   */
  async function loadQuality(bust = false) {
    setLoading(true);
    const stamp = bust ? `?ts=${Date.now()}` : '';
    const scores: Record<string, QualityScore> = {};
    const datasets: Record<string, unknown[]> = {};
    await Promise.all(
      SCORED.map(async (d) => {
        try {
          const res = await fetch(`/data/${d.file}${stamp}`, { cache: 'no-store' });
          const json = await res.json();
          const arr = Array.isArray(json) ? json : [];
          datasets[d.file] = arr;
          scores[d.file] = computeDataQuality(arr);
        } catch {
          // A dataset we cannot read has no quality score, and saying nothing
          // is honest. It still shows its age, which comes from the build.
        }
      })
    );
    setQuality(scores);
    setRaw(datasets);
    setLoading(false);
  }

  useEffect(() => {
    if (open && !Object.keys(quality).length) loadQuality().catch(() => {});
    // Loading is keyed on opening the panel; `quality` is the guard, not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const anyStale = rows.some((d) => d.stale) || fresh.stale;
  const dot = offline ? 'bg-slate-400' : anyStale ? 'bg-red-600' : 'bg-mint-600';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-ink-muted hover:bg-sand-200 hover:text-ink"
        title={
          offline
            ? 'You are offline. Showing the data saved on this device.'
            : notice ?? `Data current as of ${fresh.generatedAt.slice(0, 10)}. Refreshes twice a day, Monday to Saturday.`
        }
      >
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className="hidden lg:inline">Data</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-ink/40 p-4">
          <div className="mx-auto max-w-4xl rounded-2xl border border-sand-300 bg-sand-50 p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Data Health</h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-sand-200"><X size={15} /></button>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Last successful scrape: {meta.generatedAt.slice(0, 19)}
              {notice && <span className="ml-2 text-gold-700">{notice}</span>}
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-faint">
                    <th className="py-2">Dataset</th>
                    <th>As of</th>
                    <th>Age</th>
                    <th>Expected within</th>
                    <th>State</th>
                    <th>Quality</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const q = quality[d.file];
                    const rows_ = raw[d.file];
                    return (
                      <tr key={d.file} className="border-t border-sand-200">
                        <td className="py-2 font-medium text-ink">{d.label}</td>
                        <td className="num text-ink-soft">{d.asOf}</td>
                        <td className="num text-ink-soft">{d.ageDays}d</td>
                        <td className="num text-ink-soft">{d.budgetDays}d</td>
                        <td>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClass(d.stale)}`}>
                            {d.stale ? 'overdue' : 'on schedule'}
                          </span>
                        </td>
                        <td className="num">{q ? q.score : loading ? '…' : '—'}</td>
                        <td className="text-right">
                          {rows_ ? (
                            <a
                              download={d.file}
                              href={`data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(rows_, null, 2))}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-sand-300 px-2 py-1 text-xs hover:bg-sand-100"
                            >
                              <Download size={12} /> Raw
                            </a>
                          ) : (
                            <a
                              href={`/data/${d.file}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-sand-300 px-2 py-1 text-xs hover:bg-sand-100"
                            >
                              <Download size={12} /> Raw
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-ink-muted">
                Ages and budgets are the pipeline&apos;s own, from freshness.json. Where each
                figure comes from, and on whose licence, is on the{' '}
                <a href="/sources/" className="text-gold-700 hover:underline">Sources</a> page.
              </p>
              <button
                onClick={() => loadQuality(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-sand-300 px-3 py-1.5 text-xs hover:bg-sand-100"
              >
                <RefreshCw size={12} /> Re-check
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
