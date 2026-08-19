'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';

interface DiagRow {
  label: string;
  value: string;
  status: 'ok' | 'warn' | 'error' | 'info';
}

function StatusIcon({ s }: { s: DiagRow['status'] }) {
  if (s === 'ok') return <CheckCircle2 size={14} className="shrink-0 text-mint-700" />;
  if (s === 'warn') return <AlertTriangle size={14} className="shrink-0 text-gold-700" />;
  if (s === 'error') return <XCircle size={14} className="shrink-0 text-red-700" />;
  return <div className="h-3.5 w-3.5 shrink-0 rounded-full bg-sand-400" />;
}

export default function PwaDiagnosticsPage() {
  const [rows, setRows] = useState<DiagRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      const out: DiagRow[] = [];

      // --- Connection
      const online = navigator.onLine;
      out.push({
        label: 'Connection',
        value: online ? 'Online' : 'Offline',
        status: online ? 'ok' : 'warn',
      });

      // --- Service Worker
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration('/').catch(() => null);
        if (reg) {
          const state =
            reg.active?.state ?? reg.installing?.state ?? reg.waiting?.state ?? 'unknown';
          out.push({ label: 'Service worker', value: `Registered · ${state}`, status: 'ok' });
          out.push({
            label: 'SW scope',
            value: reg.scope,
            status: 'info',
          });
          if (reg.waiting) {
            out.push({
              label: 'Pending update',
              value: 'New version waiting — reload to apply',
              status: 'warn',
            });
          }
        } else {
          out.push({ label: 'Service worker', value: 'Not registered', status: 'error' });
        }
      } else {
        out.push({ label: 'Service worker', value: 'API not available', status: 'error' });
      }

      // --- Cache storage
      if ('caches' in globalThis) {
        const cacheNames = await caches.keys();
        out.push({
          label: 'Cache count',
          value: `${cacheNames.length} cache${cacheNames.length !== 1 ? 's' : ''}: ${cacheNames.join(', ') || '(none)'}`,
          status: cacheNames.length > 0 ? 'ok' : 'warn',
        });

        let totalEntries = 0;
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          totalEntries += keys.length;
        }
        out.push({
          label: 'Cached entries',
          value: `${totalEntries} total`,
          status: totalEntries > 0 ? 'ok' : 'warn',
        });
      } else {
        out.push({ label: 'Cache storage', value: 'API not available', status: 'error' });
      }

      // --- IndexedDB tables
      try {
        const { db } = await import('@/lib/db');
        const tables = db.tables.map((t) => t.name);
        out.push({
          label: 'IndexedDB tables',
          value: tables.join(', '),
          status: tables.length > 0 ? 'ok' : 'warn',
        });

        const bondCount = await db.bonds.count().catch(() => -1);
        out.push({
          label: 'Bonds cached',
          value: bondCount >= 0 ? `${bondCount} bonds` : 'Read failed',
          status: bondCount > 0 ? 'ok' : bondCount === 0 ? 'warn' : 'error',
        });

        const priceCount = await db.userPrices.count().catch(() => -1);
        out.push({
          label: 'User prices',
          value: priceCount >= 0 ? `${priceCount} prices` : 'Read failed',
          status: 'info',
        });

        const communityCount = await db.communityPrices.count().catch(() => -1);
        out.push({
          label: 'Community submissions',
          value: communityCount >= 0 ? `${communityCount} entries` : 'Read failed',
          status: 'info',
        });

        const receiptCount = await db.receipts.count().catch(() => -1);
        out.push({
          label: 'Saved receipts',
          value: receiptCount >= 0 ? `${receiptCount} receipts` : 'Read failed',
          status: 'info',
        });
      } catch (err) {
        out.push({ label: 'IndexedDB', value: `Error: ${String(err)}`, status: 'error' });
      }

      // --- Push / notifications
      out.push({
        label: 'Push notifications',
        value: 'Notification' in globalThis ? Notification.permission : 'Not supported',
        status: 'info',
      });

      // --- Install prompt
      out.push({
        label: 'Standalone mode',
        value: window.matchMedia('(display-mode: standalone)').matches
          ? 'Running as installed PWA'
          : 'Running in browser tab',
        status: 'info',
      });

      // --- Manifest
      const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      out.push({
        label: 'Web manifest',
        value: manifestLink?.href ?? 'Not found',
        status: manifestLink ? 'ok' : 'warn',
      });

      setRows(out);
    })();
  }, [refreshKey]);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">PWA Diagnostics</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Service worker, cache, and IndexedDB status for this session.
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-1.5 rounded-lg border border-sand-400 px-3 py-1.5 text-sm text-ink-muted hover:border-ink-muted hover:text-ink"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="card divide-y divide-sand-200">
        {rows.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-muted">Running diagnostics…</p>
        )}
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-3 py-2.5">
            <StatusIcon s={row.status} />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-ink">{row.label}</span>
              <span className="mx-2 text-ink-faint">·</span>
              <span className="break-all text-sm text-ink-soft">{row.value}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-ink-faint">
        This page is accessible at /_debug/pwa/ and is not linked from the main navigation.
        All data shown is local to this device — nothing is sent to a server.
      </p>
    </div>
  );
}
