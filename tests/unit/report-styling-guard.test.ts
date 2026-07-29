import { describe, it, expect } from 'vitest';
import {
  colouredFraction,
  MIN_BODY_COLOUR,
  MASTHEAD_SHARE,
} from '../../src/lib/report-styling';

/**
 * The PDF came back structurally perfect and visually worthless.
 *
 * html2canvas paints a COPY of the report in a detached iframe. A download
 * from production came back with none of the page's CSS applied to that copy:
 * browser-default serif, no cards, no colour, no chart. Right page size, right
 * orientation, working text layer, and unusable.
 *
 * What identified it was the geometry. The capture was 1123 x 721 CSS pixels —
 * the STYLED height. An unstyled sheet lays out roughly three times taller. So
 * the element was styled when measured and unstyled when painted, which puts
 * the loss inside the clone rather than on the page.
 *
 * Every check this file already had passed, because none of them looked at the
 * picture. This one looks.
 */
describe('the guard against shipping an unstyled report', () => {
  /** RGBA for `n` pixels of one colour. */
  const fill = (n: number, r: number, g: number, b: number) => {
    const d = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      d[i * 4] = r;
      d[i * 4 + 1] = g;
      d[i * 4 + 2] = b;
      d[i * 4 + 3] = 255;
    }
    return d;
  };

  it('reads black-on-white as having no colour at all', () => {
    // What an unstyled sheet is: text and paper, nothing else.
    const paper = fill(4000, 255, 255, 255);
    for (let i = 0; i < 400; i++) {
      paper[i * 4 * 7] = 20;
      paper[i * 4 * 7 + 1] = 20;
      paper[i * 4 * 7 + 2] = 20;
    }
    expect(colouredFraction(paper)).toBeLessThan(MIN_BODY_COLOUR);
  });

  it('reads the branded body as styled', () => {
    // A mint chart band and green figures over paper — roughly the real mix.
    const d = fill(4000, 255, 255, 255);
    for (let i = 0; i < 200; i++) {
      d[i * 4 * 16] = 4;
      d[i * 4 * 16 + 1] = 120;
      d[i * 4 * 16 + 2] = 87;
    }
    expect(colouredFraction(d)).toBeGreaterThan(MIN_BODY_COLOUR);
  });

  it('does not count near-greys as colour', () => {
    // Anti-aliased text and hairline rules are grey and must not rescue a
    // sheet that has otherwise lost its styling.
    expect(colouredFraction(fill(2000, 128, 132, 130))).toBe(0);
    expect(colouredFraction(fill(2000, 240, 240, 236))).toBe(0);
  });

  /**
   * The threshold is a claim about two real images, so it is written down.
   *
   * Measured below the masthead: the broken production capture scores 0.00000
   * and a correct one 0.01799. The line has to sit between them with room on
   * both sides, or it is not a line, it is a coin toss.
   */
  it('sits well clear of both measured values', () => {
    const BROKEN_MEASURED = 0.0;
    const GOOD_MEASURED = 0.01799;
    expect(MIN_BODY_COLOUR).toBeGreaterThan(BROKEN_MEASURED);
    // At least a five-fold margin under the good value, so ordinary variation
    // in how much colour a given plan happens to show cannot trip it.
    expect(GOOD_MEASURED / MIN_BODY_COLOUR).toBeGreaterThan(5);
  });

  /**
   * The masthead is excluded, and that exclusion is the whole fix.
   *
   * The first version of this guard sampled the masthead, reasoning that the
   * logo and gold rule are the most obviously branded thing on the page. Run
   * against the actual broken image it scored 0.021 — comfortably "styled" —
   * because the logo is an <img> and an image needs no CSS to render. It would
   * have passed the exact document it was written to catch.
   */
  it('excludes the masthead, because an <img> renders without CSS', () => {
    expect(MASTHEAD_SHARE).toBeGreaterThan(0.1);
    expect(MASTHEAD_SHARE).toBeLessThan(0.3);
    // A band that is pure logo must not be able to vouch for the whole sheet.
    const logoOnly = fill(1000, 12, 26, 48);
    expect(
      colouredFraction(logoOnly) > MIN_BODY_COLOUR,
      'a navy logo tile alone reads as styled — which is why it is excluded'
    ).toBe(true);
  });
});
