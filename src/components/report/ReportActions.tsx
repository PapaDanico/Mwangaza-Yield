'use client';

import { useState } from 'react';
import { FileText, ImageDown } from 'lucide-react';
import { printReport } from '@/lib/share';

/**
 * Getting the one-page report off the device.
 *
 * The only way to do this used to be a "PDF report" button calling
 * `window.print()`, and for a large share of this audience that button did
 * nothing at all. `print` is a blocking platform dialog that the platform is
 * free to refuse: iOS Safari has no print dialog when the app is running
 * installed to the home screen, several Android WebViews drop the call, and
 * the report sheet itself is `display: none` until print media applies — so
 * when the call was ignored there was no dialog, no report, no error and
 * nothing on screen. It looked exactly like a dead button, which is what we
 * were told it was.
 *
 * Printing is still offered, because where it works it is the best answer: real
 * A4, selectable text, "Save as PDF" built into the dialog. But it is no longer
 * the ONLY answer. The image export rasterises the same sheet and downloads it,
 * which needs no platform dialog, works installed or in a browser, and produces
 * the thing a Kenyan reader actually wants to do with a plan — send it to
 * somebody on WhatsApp.
 *
 * The lessons in the sister product's exporter are carried over rather than
 * rediscovered: html2canvas-pro over html2canvas, explicit ceil'd bounds so the
 * last line is not sliced, and a catch that tells the reader when it failed.
 * A silent failure on a download button is worse than an error, because the
 * reader's next assumption is that their own phone blocked it.
 */
export default function ReportActions({
  sheetId,
  filename,
}: {
  /** id of the `.print-only` report sheet to rasterise. */
  sheetId: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function downloadImage() {
    const el = document.getElementById(sheetId);
    if (!el) {
      setError('Could not find the report on this page.');
      return;
    }
    setBusy(true);
    setError('');

    // The sheet is display:none until print media applies, and an element with
    // no layout rasterises to nothing. Reveal it off-screen for the capture,
    // inline rather than via a class: html2canvas measures the live element but
    // paints a clone, and a class-based rule can leave the two disagreeing
    // about the height.
    const prev = {
      display: el.style.display,
      position: el.style.position,
      left: el.style.left,
      top: el.style.top,
      width: el.style.width,
      background: el.style.background,
    };
    el.style.display = 'block';
    el.style.position = 'fixed';
    el.style.left = '-10000px';
    el.style.top = '0';
    el.style.width = '794px'; // A4 portrait at 96dpi
    el.style.background = '#ffffff';

    try {
      const { default: html2canvas } = await import('html2canvas-pro');
      const bounds = el.getBoundingClientRect();
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        // Ceil and add slack: measured height comes up fractionally short and
        // clips the final line of the disclaimer.
        width: Math.ceil(bounds.width),
        height: Math.ceil(bounds.height) + 8,
        windowHeight: Math.ceil(bounds.height) + 8,
      });

      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `Could not build the image (${err.message}). Try Print instead, or a screenshot.`
          : 'Could not build the image. Try Print instead, or a screenshot.'
      );
    } finally {
      el.style.display = prev.display;
      el.style.position = prev.position;
      el.style.left = prev.left;
      el.style.top = prev.top;
      el.style.width = prev.width;
      el.style.background = prev.background;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={downloadImage}
          disabled={busy}
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-sand-400 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand-200 disabled:opacity-50"
        >
          <ImageDown size={15} /> {busy ? 'Building…' : 'Save image'}
        </button>
        <button
          onClick={() => printReport()}
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-sand-400 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand-200"
        >
          <FileText size={15} /> Print / PDF
        </button>
      </div>
      {error && <p className="max-w-[22rem] text-right text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
