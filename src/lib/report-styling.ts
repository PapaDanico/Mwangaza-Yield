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
