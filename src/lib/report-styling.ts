/**
 * Is the rasterised report actually styled, or did the clone lose the CSS?
 *
 * WHY THIS EXISTS
 * ---------------
 * The PDF export paints a COPY of the report in a detached iframe, via
 * html2canvas. A download from production came back with none of the page's
 * CSS applied to that copy: browser-default serif, no cards, no colour, no
 * chart. Right page size, right orientation, working text layer, and unusable.
 *
 * What identified it was the geometry. The capture was 1123 x 721 CSS pixels —
 * the STYLED height. An unstyled sheet lays out roughly three times taller. So
 * the element was styled when it was measured and unstyled when it was
 * painted, which places the loss inside the clone rather than on the page.
 *
 * Every check in the export path passed, because none of them looked at the
 * picture. This module looks.
 *
 * It lives apart from ReportActions because that file is a client component
 * whose helpers are all scoped inside the component body — and because a
 * threshold justified by measurement should be somewhere a test can reach it.
 */

/**
 * Fraction of sampled pixels carrying real colour rather than grey.
 *
 * `stride` samples every Nth pixel; at 2246px wide the default keeps this well
 * inside a frame while still reading thousands of points.
 */
export function colouredFraction(data: Uint8ClampedArray, stride = 16): number {
  let coloured = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4 * stride) {
    // Channel spread. Greys spread ~0; anything branded spreads widely.
    const spread =
      Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    if (spread > 24) coloured++;
    total++;
  }
  return total > 0 ? coloured / total : 0;
}

/**
 * Below this, the sheet has lost its styling.
 *
 * MEASURED, not guessed, against the two artefacts: the report that came back
 * unstyled from production, and one this build produces correctly. Sampling
 * everything below the masthead, the broken capture scores 0.00000 and the
 * good one 0.01799. The gap is not marginal, so the line sits an order of
 * magnitude under the good value and above zero.
 */
export const MIN_BODY_COLOUR = 0.002;

/**
 * The top slice to ignore, and ignoring it is the whole point.
 *
 * The first version of this check sampled the masthead, reasoning that the
 * logo tile and gold rule are the most obviously branded thing on the sheet.
 * Run against the actual broken image it scored 0.021 — comfortably "styled" —
 * because the logo is an <img>, and an image needs no CSS to render. The check
 * would have passed the exact document it was written to catch.
 *
 * Everything below the masthead is different: the green figures, the gold
 * accents, the mint chart band, the tax-free badges all come from CSS and
 * nothing else. That is why the broken capture scores exactly zero there.
 */
export const MASTHEAD_SHARE = 0.15;

/** True when the body of the sheet carries essentially no colour. */
export function bodyLooksUnstyled(data: Uint8ClampedArray): boolean {
  return colouredFraction(data) < MIN_BODY_COLOUR;
}

/* ------------------------------------------------------- capture geometry */

/**
 * The widths the exporter lays the sheet out at, best-first by measurement.
 *
 * Shared rather than copied because `tests/e2e/smoke.mjs` measures the sheet
 * under geometry it writes itself, and that copy is what drifts: the fit check
 * would keep measuring 1123px while real downloads were captured at 900px,
 * passing happily on a geometry the product no longer uses.
 */
export const CAPTURE_WIDTHS = [1123, 1040, 1000, 950, 900];

/** The gutters the capture applies. Text clears the printer's dead margin by
 *  this alone, so it is measured in the fit check rather than assumed. */
export const CAPTURE_PADDING = '34px 40px';

/** A4 landscape, long edge over short. */
export const A4_ASPECT = 297 / 210;

/**
 * Millimetres per CSS pixel once the page fit has placed the sheet.
 *
 * The fit binds on whichever edge is tighter: a sheet wider than the page's
 * aspect is limited by width, a taller one by height. This is the whole reason
 * a narrower layout can print LARGER — it trades a width that was not binding
 * for a scale that is.
 */
export function placedScaleMmPerPx(width: number, height: number): number {
  return width / Math.max(1, height) > A4_ASPECT ? 297 / width : 210 / Math.max(1, height);
}

/**
 * Pick the layout width that renders the largest type for this sheet.
 *
 * `heightAt` must apply the width and return the resulting scroll height WITH
 * the capture padding already in place. A height read before the gutters exist
 * is a measurement of a different document — 68px shorter — and picks a width
 * with complete confidence while being wrong.
 */
export function chooseCaptureWidth(heightAt: (width: number) => number): number {
  let best = CAPTURE_WIDTHS[0];
  let bestScale = 0;
  for (const w of CAPTURE_WIDTHS) {
    const scale = placedScaleMmPerPx(w, heightAt(w));
    if (scale > bestScale) {
      bestScale = scale;
      best = w;
    }
  }
  return best;
}
