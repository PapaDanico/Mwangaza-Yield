'use client';

import { useState } from 'react';
import { FileDown, ImageDown, Printer } from 'lucide-react';
import { printReport } from '@/lib/share';
import { bodyLooksUnstyled, MASTHEAD_SHARE } from '@/lib/report-styling';

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

/** Filled by renderSheet, consumed by downloadPdf on the very next line. */
let lastTextRuns: TextRun[] = [];

/** Where a run of text sits on the sheet, in CSS pixels from its top-left. */
interface TextRun {
  text: string;
  x: number;
  y: number;
  /** Baseline-ish font size, for matching the invisible layer to the picture. */
  size: number;
}

/**
 * Every visible run of text on the sheet, with its position.
 *
 * The report is a rasterised screenshot — html2canvas paints a picture and
 * jsPDF places it. That is why it looks exactly like the app, and also why a
 * reader cannot select a figure, search for a bond code, or have a screen
 * reader speak it. On a free download that is a shame. On a document tabled at
 * a board or sent to an auditor it is the first thing somebody tries and the
 * first thing that fails.
 *
 * Rewriting the report as vector primitives would fix it and would mean
 * maintaining two renderings of every layout for ever. So this does what a
 * scanned document does instead: keep the picture, and lay real text over it
 * at matching coordinates with `renderingMode: 'invisible'`. Selection,
 * search, copy and extraction all work; nothing about the appearance changes.
 *
 * Positions come from Range rectangles rather than from element boxes, because
 * an element box is the whole paragraph and a wrapped line needs one rectangle
 * per line for selection to track the words.
 */
/**
 * Typographic punctuation to its ASCII equivalent, for the text layer only.
 *
 * jsPDF's built-in fonts are WinAnsi-encoded, so an em dash extracts as a gap:
 * "par 100  a placeholder" instead of "par 100 — a placeholder". The picture
 * is unaffected — this touches nothing the reader sees — but a text layer
 * exists to be copied and searched, and it should hand over clean characters.
 */
function asciiPunctuation(text: string): string {
  return text
    /* U+2212 MINUS SIGN, and it is not the same character as a hyphen.
     *
     * The spread table renders income forgone as `\u2212Ksh 48,033` with a true
     * minus, which is typographically right and outside WinAnsi. jsPDF could
     * not encode it, so that cell extracted as
     *
     *     " K s h   4 8 , 0 3 3
     *
     * \u2014 the sign replaced by a quote and the rest letter-spaced. A garbled
     * negative in the one column whose entire job is to say what a choice
     * COSTS is the worst place on the sheet for this to happen, and it was
     * invisible because the picture is fine; only the text layer is affected. */
    .replace(/[\u2014\u2013\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u00D7]/g, 'x');
}

/**
 * Give the clone the page's stylesheets, rather than trusting it to inherit them.
 *
 * html2canvas paints a COPY of the sheet in a detached iframe, not the element
 * you can see. The copy is expected to pick up the page's CSS on its own, and
 * usually does. A report downloaded from production came back with none of it:
 * browser-default serif, no cards, no colour, no chart — the same document, in
 * the same build that renders correctly here.
 *
 * The geometry is what identifies the failure. That capture was 1123 x 721 CSS
 * pixels, which is the STYLED height; an unstyled sheet lays out roughly three
 * times taller. So the element was styled when it was measured and unstyled
 * when it was painted, which places the loss squarely inside the clone. It is
 * environment-specific — it does not reproduce here in headless Chromium at
 * any viewport, with or without the service worker — and chasing it further
 * through somebody else's browser is worth less than removing the dependency.
 *
 * So the styles are handed over explicitly. Same-origin rules are serialised
 * and inlined; anything whose `cssRules` cannot be read (which is exactly the
 * case that fails silently) has its <link> copied so the clone re-fetches it.
 */
function adoptStylesIntoClone(clonedDoc: Document): void {
  const head = clonedDoc.head ?? clonedDoc.getElementsByTagName('head')[0];
  if (!head) return;

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin, or blocked. Fall through to re-linking it below.
      rules = null;
    }

    if (rules && rules.length) {
      const style = clonedDoc.createElement('style');
      style.textContent = Array.from(rules)
        .map((r) => r.cssText)
        .join('\n');
      head.appendChild(style);
      continue;
    }

    const href = sheet.href;
    if (href) {
      const link = clonedDoc.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      head.appendChild(link);
    }
  }
}

/**
 * Would this canvas embarrass us in front of a broker?
 *
 * The production failure produced a PDF that was structurally perfect — right
 * page size, right orientation, working text layer — and visually worthless.
 * Every check in this file passed, because none of them looked at the picture.
 *
 * THE FIRST VERSION OF THIS CHECK DID NOT WORK
 * --------------------------------------------
 * It sampled the masthead, on the reasoning that the logo tile and gold rule
 * are the most obviously branded thing on the sheet. Run against the actual
 * broken image it scored 0.021 — comfortably "styled" — because the logo is an
 * <img>, and an image needs no CSS to render. The check would have passed the
 * exact document it was written for.
 *
 * So it samples everything BELOW the masthead instead. Every bit of colour
 * down there — the green figures, the gold accents, the mint chart band, the
 * tax-free badges — comes from CSS and nothing else, which is why the broken
 * capture scores exactly zero there.
 */
function looksUnstyled(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false; // Cannot tell; never block a download on a guess.

  const top = Math.floor(canvas.height * MASTHEAD_SHARE);
  const h = canvas.height - top;
  if (h <= 0) return false;

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, top, canvas.width, h).data;
  } catch {
    return false; // Tainted canvas — not this check's business.
  }

  return bodyLooksUnstyled(data);
}

function collectTextRuns(el: HTMLElement, bounds: DOMRect): TextRun[] {
  const runs: TextRun[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = node.nodeValue ?? '';
    if (!raw.trim()) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const style = window.getComputedStyle(parent);
    // Anything the picture does not show must not be searchable either — a
    // hidden string that turns up in a Ctrl+F is worse than no text layer.
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
      continue;
    }
    const size = parseFloat(style.fontSize) || 10;

    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) continue;

    if (rects.length === 1) {
      runs.push({
        /* Trailing space, because adjacent runs otherwise fuse on extraction.
         *
         * Each run is placed at its own coordinate, and an extractor decides
         * word breaks from geometry. Where two runs abut with no gap — a table
         * cell holding "2" beside one holding "bonds", or a stacked title —
         * the copied text came out as "2bonds", "4of 12", "Passive incomeplan".
         * Harmless to look at and fatal to search: nobody finds "4 of 12" in
         * that document. The layer is invisible, so a space costs nothing. */
        text: `${asciiPunctuation(raw.replace(/\s+/g, ' ').trim())} `,
        x: rects[0].left - bounds.left,
        y: rects[0].bottom - bounds.top,
        size,
      });
      continue;
    }

    /* Wrapped text: split the string across its line rectangles by width, so
     * each visual line carries roughly the words drawn on it. Approximate by
     * construction — the alternative is measuring every character — and good
     * enough for selection and search, which is what this layer is for. */
    const words = asciiPunctuation(raw.replace(/\s+/g, ' ').trim()).split(' ');
    const total = rects.reduce((sum, r) => sum + r.width, 0);
    let cursor = 0;
    rects.forEach((r, i) => {
      const share = i === rects.length - 1
        ? words.length - cursor
        : Math.max(1, Math.round((r.width / total) * words.length));
      const slice = words.slice(cursor, cursor + share).join(' ');
      cursor += share;
      if (slice) {
        // Same trailing space as the single-rect branch above: a wrapped line
        // abuts the next one just as readily as two table cells do.
        runs.push({ text: `${slice} `, x: r.left - bounds.left, y: r.bottom - bounds.top, size });
      }
    });
  }
  return runs;
}

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
    /* A4 LANDSCAPE at 96dpi, not portrait.
     *
     * The sheet was laid out at portrait width and then placed on a page
     * chosen to suit it, which is the wrong way round: narrow width forces the
     * content to stack, the stack makes the sheet tall, and a tall sheet wastes
     * whichever page it lands on. Measured on a real ladder plan, the old
     * portrait output covered 49% of its page.
     *
     * Given landscape width the sheet lays out wider, its own grids get to use
     * two columns, and the result fits the landscape page it is placed on. The
     * orientation choice in downloadPdf still measures the result rather than
     * assuming it, so a report that genuinely comes out tall still gets
     * portrait. */
    el.style.width = '1123px'; // A4 landscape at 96dpi
    el.style.background = '#ffffff';
    /* Margins. On screen the sheet is print-only and takes its gutters from
     * the @page rule, which never runs when the page is RASTERISED instead of
     * printed — so the capture came out edge to edge, and the rightmost glyph
     * of the document title, the maturity column and the last chart bar were
     * each shaved by a pixel or two. Not cropped enough to look broken; just
     * enough to look cheap on a document going to a broker.
     *
     * box-sizing matters as much as the padding: without it the padding is
     * added OUTSIDE the forced 1123px and the sheet stops being A4-shaped. */
    el.style.boxSizing = 'border-box';
    el.style.padding = '34px 40px';

    try {
      const { default: html2canvas } = await import('html2canvas-pro');
      const bounds = el.getBoundingClientRect();
      lastTextRuns = collectTextRuns(el, bounds);
      /* Capture the SCROLL width, not the box width.
       *
       * The sheet is forced to 1123px, but forcing a width does not stop the
       * content inside it being wider — a table with a right-aligned MATURES
       * column and a ten-bar cash chart both overrun it. html2canvas was told
       * to paint exactly 1123px, so everything past that edge was simply cut:
       * the document title lost its last word, the maturity dates lost their
       * column, and the final year of the chart disappeared.
       *
       * It never showed up on a phone, because at a narrow viewport the report
       * lays out taller than it is wide, takes the portrait branch, and fits.
       * Every desktop download was clipped.
       *
       * scrollWidth is the width the content actually needs; the placement
       * below already fits whichever edge binds, so a wider capture is scaled
       * rather than cropped. */
      const captureW = Math.ceil(Math.max(bounds.width, el.scrollWidth));
      const captureH = Math.ceil(Math.max(bounds.height, el.scrollHeight)) + 8;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        // Ceil and add slack: the measured height comes up fractionally short
        // and clips the last line of the disclaimer.
        width: captureW,
        height: captureH,
        windowWidth: captureW,
        windowHeight: captureH,
        onclone: adoptStylesIntoClone,
      });

      /* Checked here rather than in downloadPdf, so the image export is
       * covered by the same rule. A styleless PNG is no better to send on. */
      if (looksUnstyled(canvas)) {
        throw new Error(
          'The report rendered without its styling, so the download was stopped rather than ' +
            'save an unformatted document. Reload the page and try again.'
        );
      }
      return canvas;
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

      /* ORIENTATION FOLLOWS THE CONTENT, rather than being assumed.
       *
       * The sheet is wider than it is tall — measured on a real ladder plan,
       * 1588 x 1136, an aspect of 1.40. Dropped onto A4 portrait (0.707) it
       * fitted to the page width and finished at 210 x 150mm on a 297mm page:
       * 49% used, half the sheet blank, and every figure shrunk to make room
       * for nothing.
       *
       * A4 landscape is 1.414 — within one percent of the sheet's own shape.
       * So the page turns to suit the content instead of the content being
       * squeezed to suit the page.
       *
       * Chosen from the measurement, not hardcoded the other way: a future
       * report that is genuinely tall should get portrait, and this keeps
       * working when the sheet's design changes. */
      const A4_ASPECT = 297 / 210;
      const contentAspect = canvas.width / canvas.height;
      const landscape = contentAspect > 1;
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: landscape ? 'landscape' : 'portrait',
      });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const pageAspect = landscape ? A4_ASPECT : 1 / A4_ASPECT;

      /* Fit to whichever edge binds, then centre on the other. Fitting to
       * width unconditionally is what cropped or shrank things before: a
       * sheet relatively taller than the page needs its HEIGHT matched, and a
       * relatively wider one its width. Nothing is ever cropped. */
      let imgW: number;
      let imgH: number;
      if (contentAspect > pageAspect) {
        imgW = pageW;
        imgH = pageW / contentAspect;
      } else {
        imgH = pageH;
        imgW = pageH * contentAspect;
      }
      const x = (pageW - imgW) / 2;
      const y = (pageH - imgH) / 2;

      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, imgW, imgH);

      /* THE TEXT LAYER, invisible, over the picture.
       *
       * Without it the report is a photograph of numbers: nothing selectable,
       * nothing searchable, nothing a screen reader can speak, and no way to
       * copy a figure into a spreadsheet. Every scanned document solves this
       * the same way, and so does this — the picture is what you see, the text
       * is what you can use.
       *
       * Coordinates are the sheet's own CSS pixels scaled into the placed
       * image, so the layer tracks whatever orientation and fit were chosen
       * above rather than assuming either. */
      const sheetW = canvas.width / 2; // rendered at scale 2
      const mmPerPx = imgW / sheetW;
      pdf.setTextColor(0, 0, 0);
      for (const run of lastTextRuns) {
        if (!run.text) continue;
        pdf.setFontSize(run.size * mmPerPx * 2.8346); // mm -> pt
        pdf.text(run.text, x + run.x * mmPerPx, y + run.y * mmPerPx, {
          renderingMode: 'invisible',
          baseline: 'alphabetic',
        });
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
