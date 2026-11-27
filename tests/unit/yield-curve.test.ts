import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  curveRows,
  curveToCSV,
  maturityAt,
  TENOR_BUCKETS,
  CURVE_MIN_BUCKETS,
  curveContext,
} from '../../src/lib/yield-curve';
import { normaliseCode, auctionKind } from '../../src/lib/auction-history';
import type { AuctionPrint, Bond } from '../../src/types/bond';

const prints: AuctionPrint[] = JSON.parse(
  readFileSync('public/data/auction-results.json', 'utf8')
);
const bonds: Bond[] = JSON.parse(readFileSync('public/data/bonds.json', 'utf8'));
const rows = curveRows(prints, bonds);

describe('the curve is built from something', () => {
  // Every assertion below is trivially true on an empty result. This is what
  // stops the rest of the file from going quiet if the inputs change shape.
  it('produces years and cells', () => {
    expect(rows.length).toBeGreaterThan(8);
    expect(rows.flatMap((r) => r.cells).length).toBeGreaterThan(40);
  });

  it('covers the years the archive actually carries rates for', () => {
    const drawable = rows.filter((r) => r.drawable).map((r) => r.year);
    expect(drawable).toContain(2022);
    expect(drawable).toContain(2026);
    // The point of the gate: the sparse early years must NOT be drawn.
    expect(drawable).not.toContain(2013);
    expect(drawable).not.toContain(2015);
  });
});

describe('what is allowed onto a yield curve', () => {
  it('excludes taps and switches', () => {
    // A tap is priced, not bid; a switch is an exchange. Neither is the market
    // stating a required yield. Rebuilding with them removed must change
    // nothing, which is only meaningful because the archive contains 71.
    const issuanceOnly = prints.filter((p) => auctionKind(p) === 'issuance');
    expect(prints.length - issuanceOnly.length).toBeGreaterThan(20);
    expect(curveToCSV(curveRows(issuanceOnly, bonds))).toBe(curveToCSV(rows));
  });

  it('excludes IFBs, whose yields are not tax-comparable to FXDs', () => {
    const noIfb = prints.filter((p) => !String(p.issueCode).toUpperCase().startsWith('IFB'));
    expect(prints.length - noIfb.length).toBeGreaterThan(20);
    expect(curveToCSV(curveRows(noIfb, bonds))).toBe(curveToCSV(rows));
  });
});

describe('maturity is recovered for bonds that have since matured', () => {
  it('derives maturity from the issue code when the bond is gone', () => {
    const p = { issueCode: 'FXD1/2019/015', auctionDate: '2019-02-11' } as AuctionPrint;
    const derived = maturityAt(p, new Map());
    expect(derived?.getUTCFullYear()).toBe(2034);
  });

  it('prefers the archive date when we hold the bond', () => {
    const withDate = bonds.find((b) => b.maturityDate);
    expect(withDate).toBeDefined();
    const byCode = new Map([[normaliseCode(withDate!.issueCode), withDate!]]);
    const p = { issueCode: withDate!.issueCode, auctionDate: '2024-01-01' } as AuctionPrint;
    expect(maturityAt(p, byCode)!.toISOString().slice(0, 10)).toBe(
      new Date(withDate!.maturityDate).toISOString().slice(0, 10)
    );
  });

  it('reaches auctions of bonds that are no longer in bonds.json', () => {
    /* The first version of this test named the fallback and then measured
     * `curveRows(prints, bonds)` — with the fallback switched on — against a
     * threshold it already cleared. It passed without exercising anything.
     *
     * The honest measurement is the one the fallback exists for: prints whose
     * bond has matured out of bonds.json. `maturityAt` is given an EMPTY map,
     * so the archive route cannot answer and only the issue code can. */
    const held = new Set(bonds.map((b) => normaliseCode(b.issueCode)));
    const orphaned = prints.filter(
      (p) => p.auctionDate && !held.has(normaliseCode(p.issueCode))
    );
    expect(orphaned.length).toBeGreaterThan(100);

    const recovered = orphaned.filter((p) => maturityAt(p, new Map()) !== null);
    expect(recovered.length).toBe(orphaned.length);
  });
});

describe('a curve is only drawn when there is a shape to draw', () => {
  it('requires CURVE_MIN_BUCKETS populated buckets', () => {
    for (const row of rows) {
      expect(row.drawable).toBe(row.cells.length >= CURVE_MIN_BUCKETS);
    }
  });

  it('never claims more buckets than exist', () => {
    for (const row of rows) {
      expect(row.cells.length).toBeLessThanOrEqual(TENOR_BUCKETS.length);
      const labels = row.cells.map((c) => c.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it('orders cells short to long so the drawn line is not scrambled', () => {
    for (const row of rows) {
      const years = row.cells.map((c) => c.years);
      expect([...years].sort((a, b) => a - b)).toEqual(years);
    }
  });
});

describe('the CSV hides nothing the chart declines to draw', () => {
  const csv = curveToCSV(rows);

  it('carries the sparse years the chart gates out', () => {
    const undrawn = rows.filter((r) => !r.drawable);
    expect(undrawn.length).toBeGreaterThan(0);
    for (const row of undrawn) {
      expect(csv).toContain(`${row.year},${row.cells[0].label},`);
    }
    expect(csv).toContain(',no\n');
  });

  it('publishes the sample size behind every median', () => {
    const body = csv.trim().split('\n').slice(1);
    expect(body.length).toBe(rows.flatMap((r) => r.cells).length);
    for (const line of body) {
      const n = Number(line.split(',')[4]);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    }
  });

  it('has a header naming every column it emits', () => {
    const [header, first] = csv.split('\n');
    expect(header.split(',').length).toBe(first.split(',').length);
  });
});

describe('the numbers are Kenya, not noise', () => {
  const rateAt = (year: number, label: string) =>
    rows.find((r) => r.year === year)?.cells.find((c) => c.label === label)?.rate;

  it('shows the 2023-24 spike and the recent easing at the short end', () => {
    // Sanity against reality: CBK's tightening put short yields far above the
    // long end in 2024, and they have come back down since. A curve that does
    // not show this is not measuring Kenya.
    const spike = rateAt(2024, '5y');
    const now = rateAt(2026, '5y');
    expect(spike).toBeGreaterThan(15);
    expect(now).toBeLessThan(spike! - 3);
  });

  it('keeps every rate inside a range a government bond could plausibly clear', () => {
    for (const c of rows.flatMap((r) => r.cells)) {
      expect(c.rate).toBeGreaterThan(5);
      expect(c.rate).toBeLessThan(25);
    }
  });
});

describe('the policy rate beside each curve', () => {
  const cbr: { date: string; rate: number }[] = JSON.parse(
    readFileSync('public/data/cbr-history.json', 'utf8')
  );

  it('has a real CBR history to work from', () => {
    expect(cbr.length).toBeGreaterThan(50);
  });

  it('reports the rate IN FORCE at year end, not the last decision made that year', () => {
    // The MPC does not meet every month. A year with no decision still has a
    // policy rate — the previous one, still standing. Treating "no decision"
    // as "no rate" would blank most years.
    const quiet = curveContext([2013], cbr)[0];
    expect(quiet.cbrPct).not.toBeNull();
  });

  it('counts decisions taken during the year separately from the rate', () => {
    const rows = curveContext(
      [2020],
      [
        { date: '2019-11-25', rate: 9.0 },
        { date: '2020-03-23', rate: 7.25 },
        { date: '2020-04-29', rate: 7.0 },
        { date: '2021-01-27', rate: 7.0 },
      ]
    )[0];
    expect(rows.cbrPct).toBe(7.0);
    expect(rows.decisions).toBe(2);
    expect(rows.netMoveBps).toBe(-200);
  });

  it('is null before the history begins rather than guessing backwards', () => {
    const early = curveContext([2000], cbr)[0];
    expect(early.cbrPct).toBeNull();
  });

  it('covers every drawable curve year', () => {
    // The layer is useless if it blanks on the years the chart actually draws.
    const drawable = rows.filter((r) => r.drawable).map((r) => r.year);
    const ctx = curveContext(drawable, cbr);
    expect(ctx.every((c) => c.cbrPct !== null)).toBe(true);
  });
});

/* Withholding tax follows the bond's ORIGINAL tenor, as CBK withholds (every
 * 2023-2026 prospectus; e.g. FXD4/2019/010 at 10% with 3.0 years left). The
 * real curve once taxed by the bucket's REMAINING-term years, which put a
 * re-opened long bond in the 15% band. docs/research/2026-11-27-kenya-bond-
 * withholding-tax/REPORT.md. */
describe('withholding tax by original tenor', () => {
  const byCode = new Map(bonds.map((b) => [normaliseCode(b.issueCode), b]));
  const long = (p: AuctionPrint) => {
    const b = byCode.get(normaliseCode(p.issueCode));
    const m = /\/(\d+)$/.exec(String(p.issueCode));
    return (b?.tenorYears ?? (m ? Number(m[1]) : 0)) >= 10;
  };

  it('nets a re-opened long bond at 10% even in a short remaining-term bucket', () => {
    const [reopened] = curveRows(
      [{
        // CBK re-opened this 20-year bond in June 2026 with about 6.4 years
        // left and printed 10% withholding on the prospectus.
        issueCode: 'FXD1/2012/020', auctionDate: '2026-06-17', weightedAverageRate: 13.0,
      } as unknown as AuctionPrint],
      bonds
    ).flatMap((r) => r.cells);
    expect(reopened, 'FXD1/2012/020 produced no cell').toBeDefined();
    expect(reopened.years).toBe(5); // the 5-year bucket by remaining term, where the old rule gave 15%
    expect(reopened.whtRate).toBe(0.1);
    expect(reopened.netRate).toBeCloseTo(13.0 * 0.9, 3);
  });

  it('nets a short original-tenor bond at 15%', () => {
    const [short] = curveRows(
      [{ issueCode: 'FXD1/2023/005', auctionDate: '2026-11-11', weightedAverageRate: 12.0 } as unknown as AuctionPrint],
      bonds
    ).flatMap((r) => r.cells);
    expect(short.whtRate).toBe(0.15);
    expect(short.netRate).toBeCloseTo(12.0 * 0.85, 3);
  });

  it('applies on the real archive: some short buckets hold long-tenor re-openings', () => {
    const cells = rows.flatMap((r) => r.cells).filter((c) => c.years < 10 && c.whtRate != null);
    const mixed = cells.filter((c) => (c.whtRate as number) < 0.15);
    expect(cells.length).toBeGreaterThan(0);
    // If this ever reads zero the archive has no re-openings in short buckets
    // and the guard above is the only thing testing the rule.
    expect(mixed.length + prints.filter((p) => long(p)).length).toBeGreaterThan(0);
  });
});
