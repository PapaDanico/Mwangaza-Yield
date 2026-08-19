'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Download } from 'lucide-react';
import type { DataManifest } from '@/lib/data-quality';
import { computeFreshness, generateDataReport } from '@/lib/data-quality';
import meta from '../../../public/data/meta.json';

const DATASETS = [
  { id: 'bonds', label: 'Bonds', file: '/data/bonds.json', source: 'CBK', sourceUrl: 'https://www.centralbank.go.ke' },
  { id: 'auctions', label: 'Auctions', file: '/data/auctions.json', source: 'CBK', sourceUrl: 'https://www.centralbank.go.ke' },
  { id: 'macro', label: 'Macro', file: '/data/macro.json', source: 'KNBS/CBK/World Bank', sourceUrl: 'https://www.knbs.or.ke' },
  { id: 'prices', label: 'Prices', file: '/data/secondary.json', source: 'NSE/CBK', sourceUrl: 'https://www.centralbank.go.ke' },
] as const;

function dotClass(level: string): string {
  if (level === 'fresh') return 'bg-mint-600';
  if (level === 'stale') return 'bg-gold-600';
  if (level === 'old') return 'bg-red-600';
  return 'bg-slate-400';
}

export default function DataStatus() {
  const [open, setOpen] = useState(false);
  const [manifest, setManifest] = useState<DataManifest>({ datasets: [] });
  const [offline, setOffline] = useState(false);

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

  async function loadDatasets(bust = false) {
    const stamp = bust ? `?ts=${Date.now()}` : '';
    const rows = await Promise.all(DATASETS.map(async (d) => {
      try {
        const res = await fetch(`${d.file}${stamp}`, { cache: 'no-store' });
        const json = await res.json();
        const firstDate = Array.isArray(json)
          ? json.map((x: any) => x?.date || x?.auctionDate || x?.tradeDate || x?.asOf).filter(Boolean).sort().at(-1)
          : undefined;
        return {
          ...d,
          dataset: json,
          dataDate: firstDate || meta.generatedAt,
        };
      } catch {
        return {
          ...d,
          dataset: [],
          dataDate: '1970-01-01T00:00:00Z',
        };
      }
    }));
    setManifest({ datasets: rows, lastSuccessfulScrape: meta.generatedAt });
  }

  useEffect(() => {
    loadDatasets().catch(() => {});
  }, []);

  const report = useMemo(() => generateDataReport(manifest), [manifest]);
  const datasetFreshness = computeFreshness(meta.generatedAt, new Date());
  const nextRefresh = useMemo(() => {
    const now = new Date();
    const next = new Date(now);
    const hour = now.getUTCHours() < 12 ? 12 : 0;
    if (hour === 0) next.setUTCDate(now.getUTCDate() + 1);
    next.setUTCHours(hour, 0, 0, 0);
    return next;
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-ink-muted hover:bg-sand-200 hover:text-ink"
        title={`Data refreshed ${Math.max(0, Math.floor((Date.now() - new Date(meta.generatedAt).getTime()) / 3_600_000))} hours ago. Next refresh: ${nextRefresh.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })} EAT.`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass(offline ? 'offline' : datasetFreshness)}`} />
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
              Last successful scrape: {manifest.lastSuccessfulScrape?.slice(0, 19) || 'unknown'}
              {manifest.lastSuccessfulScrape && (Date.now() - new Date(manifest.lastSuccessfulScrape).getTime()) / 3_600_000 > 48 && (
                <span className="ml-2 text-gold-700">Automated updates paused. Technical team notified.</span>
              )}
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-faint">
                    <th className="py-2">Dataset</th>
                    <th>Last updated</th>
                    <th>Source</th>
                    <th>Freshness</th>
                    <th>Quality</th>
                    <th>Records</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {report.datasets.map((d) => (
                    <tr key={d.id} className="border-t border-sand-200">
                      <td className="py-2 font-medium text-ink">{d.label}</td>
                      <td className="num text-ink-soft">{d.dataDate.slice(0, 19)}</td>
                      <td><a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-gold-700 hover:underline">{d.source}</a></td>
                      <td><span className={`rounded-full px-2 py-0.5 text-xs ${dotClass(d.freshness)} text-sand-50`}>{d.freshness}</span></td>
                      <td className="num">{d.quality.score}</td>
                      <td className="num">{d.recordCount}</td>
                      <td className="text-right">
                        <a
                          download={`${d.id}.json`}
                          href={`data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify((manifest.datasets.find((x) => x.id === d.id) as any)?.dataset ?? [], null, 2))}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-sand-300 px-2 py-1 text-xs hover:bg-sand-100"
                        >
                          <Download size={12} /> Raw
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-ink-muted">Overall quality score: {report.overallScore}</p>
              <button
                onClick={() => loadDatasets(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-sand-300 px-3 py-1.5 text-xs hover:bg-sand-100"
              >
                <RefreshCw size={12} /> Force Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
