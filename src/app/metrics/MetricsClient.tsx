'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { summarise, TRAFFIC_CAVEAT, type MetricsPayload } from '@/lib/metrics';

/**
 * Everything here runs in the reader's browser against the token they paste.
 * The token is never sent anywhere but the site's own function, and is kept in
 * localStorage only so the owner is not retyping it on every visit.
 */
const TOKEN_KEY = 'my.metricsToken';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; hint?: string }
  | { status: 'ready'; payload: MetricsPayload };

export default function MetricsClient() {
  const [token, setToken] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(TOKEN_KEY);
      if (saved) setToken(saved);
    } catch {
      /* private mode; the owner can still paste it each time */
    }
  }, []);

  const load = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setState({ status: 'error', message: 'Enter the METRICS_TOKEN to read the counters.' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const res = await fetch(
        `/.netlify/functions/track?token=${encodeURIComponent(trimmed)}`,
        { headers: { accept: 'application/json' } }
      );
      if (res.status === 401) {
        setState({
          status: 'error',
          message: 'That token was refused.',
          hint:
            'Either it does not match METRICS_TOKEN, or METRICS_TOKEN is not set on the site at ' +
            'all — the function refuses every read when it is unconfigured, rather than serving ' +
            'the counters openly.',
        });
        return;
      }
      if (!res.ok) {
        setState({ status: 'error', message: `The function answered ${res.status}.` });
        return;
      }
      const payload = (await res.json()) as MetricsPayload;
      if (!payload?.ok) {
        setState({ status: 'error', message: 'The function answered, but reported a failure.' });
        return;
      }
      try {
        window.localStorage.setItem(TOKEN_KEY, trimmed);
      } catch {
        /* not fatal */
      }
      setState({ status: 'ready', payload });
    } catch {
      setState({
        status: 'error',
        message: 'Could not reach the function.',
        hint:
          'Functions do not run on a static export served from disk. This page reads real ' +
          'counters only on the deployed site.',
      });
    }
  }, []);

  const summary = useMemo(
    () => (state.status === 'ready' ? summarise(state.payload) : null),
    [state]
  );

  const peakDay = useMemo(() => {
    if (!summary?.daily.length) return 0;
    return Math.max(...summary.daily.map((d) => d.total));
  }, [summary]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-slate-500">
          <BarChart3 className="h-4 w-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide">Owner view</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Tool usage</h1>
        <p className="mt-2 text-sm text-slate-600">
          The counters <code className="text-xs">track.mts</code> has been keeping. Last 60 days.
        </p>
      </header>

      <form
        className="mb-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void load(token);
        }}
      >
        <label className="sr-only" htmlFor="metrics-token">
          METRICS_TOKEN
        </label>
        <div className="relative flex-1">
          <KeyRound
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            id="metrics-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="METRICS_TOKEN"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-mint-600 focus:outline-none focus:ring-1 focus:ring-mint-600"
          />
        </div>
        <button
          type="submit"
          disabled={state.status === 'loading'}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {state.status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          {state.status === 'ready' ? 'Refresh' : 'Load'}
        </button>
      </form>

      {state.status === 'error' && (
        <div className="mb-6 rounded-lg border border-gold-300 bg-gold-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-slate-900">{state.message}</p>
              {state.hint && <p className="mt-1 text-sm text-slate-600">{state.hint}</p>}
            </div>
          </div>
        </div>
      )}

      {summary && (
        <>
          {/* The caveat comes BEFORE the numbers, not as a footnote under them.
              Read after the fact, it excuses a misreading that has already
              happened. */}
          <p className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            {TRAFFIC_CAVEAT}
          </p>

          {summary.totalEvents === 0 ? (
            <p className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-600">
              No events recorded yet. The counters only fill on the deployed site.
            </p>
          ) : (
            <>
              <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Views" value={summary.views.toLocaleString()} />
                <Tile label="Actions" value={summary.actions.toLocaleString()} />
                <Tile
                  label="Actions / 100 views"
                  value={
                    summary.actionsPerHundredViews === null
                      ? '—'
                      : summary.actionsPerHundredViews.toFixed(1)
                  }
                />
                <Tile
                  label="Days covered"
                  value={String(summary.daysCovered)}
                  note={
                    summary.daysWithNoData > 0
                      ? `${summary.daysWithNoData} with no data`
                      : undefined
                  }
                />
              </div>

              <section className="mb-8">
                <h2 className="mb-1 text-sm font-semibold text-slate-900">By day</h2>
                <p className="mb-3 text-xs text-slate-500">
                  {summary.firstDay} to {summary.lastDay}. A hatched column is a day with no
                  counter at all — a gap in collection, not a measured zero.
                </p>
                <div className="flex items-end gap-px overflow-x-auto rounded-lg border border-slate-200 p-3">
                  {summary.daily.map((d) => (
                    <div
                      key={d.date}
                      className="group relative flex min-w-[6px] flex-1 flex-col justify-end"
                      style={{ height: 96 }}
                      title={
                        d.noData
                          ? `${d.date}: no data`
                          : `${d.date}: ${d.views} views, ${d.actions} actions`
                      }
                    >
                      {d.noData ? (
                        <div
                          className="w-full rounded-sm border border-dashed border-slate-300"
                          style={{ height: 8 }}
                        />
                      ) : (
                        <>
                          <div
                            className="w-full rounded-t-sm bg-mint-600"
                            style={{
                              height: peakDay ? Math.max(2, (d.actions / peakDay) * 96) : 2,
                            }}
                          />
                          <div
                            className="w-full bg-slate-300"
                            style={{
                              height: peakDay ? Math.max(1, (d.views / peakDay) * 96) : 1,
                            }}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  <span className="inline-block h-2 w-2 rounded-sm bg-mint-600" /> actions{' '}
                  <span className="ml-3 inline-block h-2 w-2 rounded-sm bg-slate-300" /> views
                </p>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold text-slate-900">By event</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2">Event</th>
                      <th className="py-2">Kind</th>
                      <th className="py-2 text-right">Count</th>
                      <th className="py-2 text-right">Share of kind</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byEvent.map((e) => (
                      <tr key={e.event} className="border-b border-slate-100">
                        <td className="py-2 text-slate-900">{e.label}</td>
                        <td className="py-2">
                          <span
                            className={
                              e.kind === 'act'
                                ? 'rounded bg-mint-300 px-1.5 py-0.5 text-xs font-medium text-mint-800'
                                : 'rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600'
                            }
                          >
                            {e.kind === 'act' ? 'action' : 'view'}
                          </span>
                        </td>
                        <td className="num py-2 text-right text-slate-900">
                          {e.count.toLocaleString()}
                        </td>
                        <td className="num py-2 text-right text-slate-600">
                          {e.sharePct === null ? '—' : `${e.sharePct.toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="num mt-1 text-xl font-bold text-slate-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-gold-700">{note}</p>}
    </div>
  );
}
