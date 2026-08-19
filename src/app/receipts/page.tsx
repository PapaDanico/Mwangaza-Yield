'use client';

import { useEffect, useState } from 'react';
import { FileText, Trash2, Download, Clock } from 'lucide-react';
import { db } from '@/lib/db';
import ReceiptModal from '@/components/shared/ReceiptModal';
import { receiptToJSON, type Receipt } from '@/lib/receipt';

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [viewing, setViewing] = useState<Receipt | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    db.receipts
      .orderBy('timestamp')
      .reverse()
      .toArray()
      .then((rows) => { setReceipts(rows); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  async function deleteReceipt(id: string) {
    await db.receipts.delete(id).catch(() => {});
    setReceipts((prev) => prev.filter((r) => r.id !== id));
  }

  async function clearAll() {
    await db.receipts.clear().catch(() => {});
    setReceipts([]);
  }

  function downloadJSON(r: Receipt) {
    const url = URL.createObjectURL(
      new Blob([receiptToJSON(r)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${r.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Receipt History</h1>
          <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-ink-muted">
            Calculation receipts generated in this browser. Stored locally — never uploaded.
          </p>
        </div>
        {receipts.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-lg border border-sand-400 px-3 py-1.5 text-sm text-ink-muted hover:border-red-400 hover:text-red-700"
          >
            <Trash2 size={14} /> Clear all
          </button>
        )}
      </div>

      {!loaded && (
        <p className="text-sm text-ink-muted">Loading…</p>
      )}

      {loaded && receipts.length === 0 && (
        <div className="card text-center">
          <FileText size={32} className="mx-auto text-ink-faint" />
          <p className="mt-3 font-medium text-ink">No receipts yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Generate one from the{' '}
            <a href="/calculator/" className="text-gold-700 underline-offset-2 hover:underline">
              Calculator
            </a>{' '}
            or{' '}
            <a href="/portfolio/" className="text-gold-700 underline-offset-2 hover:underline">
              Portfolio
            </a>{' '}
            pages.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {receipts.map((r) => (
          <div key={r.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{r.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-faint">
                  <Clock size={11} />
                  {r.timestamp.replace('T', ' ').slice(0, 19)} UTC
                  <span>·</span>
                  <span className="font-mono text-[11px]">{r.hash.slice(0, 16)}…</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setViewing(r)}
                  className="flex items-center gap-1.5 rounded-lg border border-sand-400 px-2.5 py-1.5 text-xs text-ink-muted hover:border-ink-muted hover:text-ink"
                >
                  <FileText size={13} /> View
                </button>
                <button
                  onClick={() => downloadJSON(r)}
                  className="flex items-center gap-1.5 rounded-lg border border-sand-400 px-2.5 py-1.5 text-xs text-ink-muted hover:border-ink-muted hover:text-ink"
                >
                  <Download size={13} /> JSON
                </button>
                <button
                  onClick={() => deleteReceipt(r.id)}
                  aria-label={`Delete receipt ${r.id.slice(0, 8)}`}
                  className="flex items-center gap-1.5 rounded-lg border border-sand-400 px-2.5 py-1.5 text-xs text-ink-muted hover:border-red-400 hover:text-red-700"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-[12px] text-ink-soft">{r.result}</p>
          </div>
        ))}
      </div>

      {viewing && (
        <ReceiptModal receipt={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
