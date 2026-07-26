'use client';

import { useState } from 'react';
import { FileDown, ImageDown, Printer } from 'lucide-react';
import { printReport } from '@/lib/share';

/**
 * Getting the one-page report off the device — as an actual PDF.
 *
 * THE BUG THIS FIXES, STATED PLAINLY
 * ----------------------------------
 * The app has never produced a PDF. It offered two buttons:
 *
 *   "Print / PDF"  → window.print(). Absent on iOS when the app runs from the
 *                    home screen, dropped by several Android WebViews. On those
 *                    devices it does nothing at all, silently.
 *   "Save image"   → downloads a .png.
 *
 * So a reader who wanted a PDF had one button that did nothing on their phone
 * and one that gave them the wrong file type. An earlier fix made the report
 * REACHABLE without the print dialog; it never made it a PDF. That was the
 * gap, and "I still cannot generate PDFs" was an accurate report of it.
 *
 * THE PERMANENT FIX
 * -----------------
 * Build the PDF in the page and download it. No platform dialog is involved at
 * any point, so there is nothing for iOS or a WebView to decline: the sheet is
 * rasterised with html2canvas-pro, placed into a jsPDF A4 page, and saved. It
 * works installed, in a browser, on a phone, offline.
 *
 * WHY AN IMAGE INSIDE THE PDF RATHER THAN TEXT
 * --------------------------------------------
 * A text-based PDF would give selectable text and a smaller file, and it would
 * mean re-implementing the report's layout a second time in PDF primitives —
 * two renderers to keep in step, and the printed figures drifting from the
 * on-screen ones is exactly the class of bug this project keeps finding. One
 * renderer, one layout, one set of numbers. Where selectable text genuinely
 * matters, Print is still there for the desktop browsers that support it.
 *
 * Scale 2 keeps it sharp on a phone screen and at A4 print size; JPEG at 0.92
 * rather than PNG because a full-page PNG runs to several megabytes, and a
 * report nobody can WhatsApp is not much of a report.
 */
export default function ReportActions({
  sheetId,
  filename,
}: {
  /** id of the `.print-only` report sheet to render. */
  sheetId: string;
  filename: string;
}) {
  const [busy, setBusy] = useState<'pdf' | 'image' | null>(null);
  const [error, setError] = useState('');

  /**
   * Rasterise the report sheet.
   *
   * The sheet is `display: none` until print media applies, and an element with
   * no layout rasterises to nothing. It is revealed off-screen for the capture
   * — inline rather than via a class, because html2canvas measures the live
   * element and paints a clone, and a class-based rule leaves the two
   * disagreeing about the height.
   */
  async function renderSheet(el: HTMLElement) {
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
      return await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        // Ceil and add slack: the measured height comes up fractionally short
        // and clips the last line of the disclaimer.
        width: Math.ceil(bounds.width),
        height: Math.ceil(bounds.height) + 8,
        windowHeight: Math.ceil(bounds.height) + 8,
      });
    } finally {
      el.style.display = prev.display;
      el.style.position = prev.position;
      el.style.left = prev.left;
      el.style.top = prev.top;
      el.style.width = prev.width;
      el.style.background = prev.background;
    }
  }

  function sheet(): HTMLElement | null {
    const el = document.getElementById(sheetId);
    if (!el) setError('Could not find the report on this page.');
    return el;
  }

  async function downloadPdf() {
    const el = sheet();
    if (!el) return;
    setBusy('pdf');
    setError('');
    try {
      const canvas = await renderSheet(el);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      // Fit to the page width, then let the height follow the aspect ratio. The
      // sheet is designed to be one page; if a longer one ever appears, this
      // scales it down to fit rather than silently cropping the bottom off.
      const imgW = pageW;
      let imgH = (canvas.height * imgW) / canvas.width;
      let x = 0;
      if (imgH > pageH) {
        const scale = pageH / imgH;
        imgH = pageH;
        x = (pageW - imgW * scale) / 2;
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, 0, imgW * scale, imgH);
      } else {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, imgH);
      }
      pdf.save(`${filename}.pdf`);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `Could not build the PDF (${err.message}). Try "Save image" instead.`
          : 'Could not build the PDF. Try "Save image" instead.'
      );
    } finally {
      setBusy(null);
    }
  }

  async function downloadImage() {
    const el = sheet();
    if (!el) return;
    setBusy('image');
    setError('');
    try {
      const canvas = await renderSheet(el);
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `Could not build the image (${err.message}). Try the PDF instead, or a screenshot.`
          : 'Could not build the image. Try the PDF instead, or a screenshot.'
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    /* Full width on a phone, hugging the right on a desktop.
     *
     * This used to be `flex flex-col items-end` around a `flex-wrap` row, and
     * the page then dropped it into ITS OWN flex-wrap row beside Save plan and
     * the saved-plans dropdown. Two independent wrap contexts at 390px is what
     * produced the staircase in the bug report: PDF on one line, Save image and
     * Print stepped down-left, Save plan floating up-right with its label
     * broken across two lines. Going full width below `sm` gives the row a
     * single predictable wrap, and the buttons below share the line evenly
     * instead of ragging. */
    <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end">
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        <button
          onClick={downloadPdf}
          disabled={busy !== null}
          /* Full width on its own line below `sm`: it is the primary action and
             the one the bug report was about, so it gets the emphatic slot
             rather than competing for a shared line. */
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-sand-50 transition-colors hover:bg-ink-soft disabled:opacity-50 sm:w-auto"
        >
          <FileDown size={15} /> {busy === 'pdf' ? 'Building…' : 'Download PDF'}
        </button>
        <button
          onClick={downloadImage}
          disabled={busy !== null}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-sand-400 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand-200 disabled:opacity-50 sm:flex-none"
        >
          <ImageDown size={15} /> {busy === 'image' ? 'Building…' : 'Save image'}
        </button>
        {/* Print is last and quiet: it is the best output where it works —
            selectable text, real A4 — and does nothing at all on an installed
            iOS app, so it must never be the button a reader reaches for first. */}
        <button
          onClick={() => printReport()}
          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:flex-none"
          title="Opens your browser's print dialog, where it is available"
        >
          <Printer size={15} /> Print
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600 sm:max-w-[22rem] sm:text-right">{error}</p>}
    </div>
  );
}
