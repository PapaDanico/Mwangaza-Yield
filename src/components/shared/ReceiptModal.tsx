'use client';

import { useEffect, useRef, useCallback } from 'react';
import { X, Copy, Download, Share2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { receiptToMarkdown, receiptToJSON, type Receipt } from '@/lib/receipt';

interface Props {
  receipt: Receipt;
  onClose: () => void;
}

function downloadText(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-gold-700">
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function ReceiptModal({ receipt, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus close button on open for keyboard users.
  useEffect(() => { closeRef.current?.focus(); }, []);

  // Trap focus within the modal.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = overlayRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    },
    [onClose],
  );

  const markdown = receiptToMarkdown(receipt);

  async function copyText() {
    try { await navigator.clipboard.writeText(markdown); } catch { /* silent */ }
  }

  function downloadJSON() {
    downloadText(
      receiptToJSON(receipt),
      `receipt-${receipt.id.slice(0, 8)}.json`,
      'application/json',
    );
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(
      `*${receipt.title}*\n${receipt.result}\n\nVerification: ${receipt.hash.slice(0, 16)}…\n\nCalculated with Mwangaza Yield — https://mwangazayield.org`,
    );
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  return (
    /* Overlay */
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-treasury-navy/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="receipt-title"
    >
      {/* Panel */}
      <div
        ref={overlayRef}
        onKeyDown={handleKeyDown}
        className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-sand-300 bg-sand-50 shadow-2xl"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(203,189,156,0.15) 23px, rgba(203,189,156,0.15) 24px)' }}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-sand-300 bg-sand-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-gold-600" />
            <h2 id="receipt-title" className="font-display text-sm font-bold text-ink">
              Calculation Receipt
            </h2>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-faint">
            <span>{receipt.timestamp.replace('T', ' ').slice(0, 16)} UTC</span>
            <span>·</span>
            <span>v{receipt.appVersion}</span>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close receipt"
            className="ml-4 flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-sand-200 hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <p className="font-display text-base font-bold text-ink">{receipt.title}</p>

          {/* Inputs */}
          <Section title="Inputs">
            <table className="w-full text-[12px]">
              <tbody>
                {receipt.inputs.map((inp, i) => (
                  <tr key={i} className="border-b border-sand-200/70 last:border-0">
                    <td className="py-1.5 pr-3 text-ink-muted">{inp.label}</td>
                    <td className="py-1.5 font-medium text-ink">{inp.value}</td>
                    <td className="py-1.5 pl-2 text-right text-[11px] text-ink-faint">{inp.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* Data Sources */}
          <Section title="Data Sources">
            <ul className="space-y-1">
              {receipt.dataSources.map((ds, i) => (
                <li key={i} className="text-[12px] text-ink-soft">
                  <span className="font-medium text-ink">{ds.name}</span>
                  {ds.lastUpdated && <span className="text-ink-faint"> · {ds.lastUpdated}</span>}
                  {ds.url && (
                    <a
                      href={ds.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-gold-700 underline-offset-2 hover:underline"
                    >
                      {ds.url.replace(/^https?:\/\//, '').slice(0, 48)}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {/* Formula */}
          <Section title="Formula">
            <p className="mb-2 text-[12px] leading-relaxed text-ink-soft">
              {receipt.formulaPlainText}
            </p>
            <pre className={cn(
              'overflow-x-auto rounded-lg border border-sand-300 bg-treasury-navy/5 p-3',
              'font-mono text-[11px] leading-relaxed text-ink',
            )}>
              {receipt.formulaNotation}
            </pre>
          </Section>

          {/* Result */}
          <Section title="Result">
            <p className="font-display text-sm font-semibold text-gold-700">{receipt.result}</p>
          </Section>

          {/* Verification */}
          <Section title="Verification">
            <p className="mb-1 text-[12px] text-ink-soft">
              SHA-256 hash of inputs + formula. Re-run the calculation with the same inputs and
              verify the hash matches to confirm the figures have not changed.
            </p>
            <p className={cn(
              'break-all rounded-lg border border-sand-300 bg-treasury-navy/5 p-2',
              'font-mono text-[11px] text-ink',
            )}>
              {receipt.hash}
            </p>
            <p className="mt-1 text-[11px] text-ink-faint">Receipt ID: {receipt.id}</p>
          </Section>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2 border-t border-sand-300 bg-sand-100 px-5 py-3">
          <button
            onClick={copyText}
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-sand-400 px-3 text-sm text-ink-muted hover:border-ink-muted hover:text-ink"
          >
            <Copy size={13} /> Copy as text
          </button>
          <button
            onClick={downloadJSON}
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-sand-400 px-3 text-sm text-ink-muted hover:border-ink-muted hover:text-ink"
          >
            <Download size={13} /> Download JSON
          </button>
          <button
            onClick={shareWhatsApp}
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-sm font-medium text-white hover:bg-[#1ebe5d]"
          >
            <Share2 size={13} /> Share via WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
