/**
 * Kenya's government yield curve, year by year, rebuilt from auction results.
 *
 * WHY THIS EXISTS ALONGSIDE THE DASHBOARD'S CURVE
 *
 * The dashboard plots one point per tenor taken from each bond's last auction,
 * whenever that happened to be. That is the only curve you can draw without
 * market prices, and its own source file documents the cost: on shipped data
 * twelve of twenty-three points were over two years old, and comparing a 2024
 * point against a 2026 one produced a curve shape that was an artefact of the
 * calendar rather than the market.
 *
 * This module answers a different question, and one the archive can actually
 * support: what did the curve look like IN a given year, using only auctions
 * held in that year? Every point on a 2023 curve cleared in 2023. The shape is
 * then real, because the points are contemporaneous with each other.
 *
 * WHY IT STARTS IN 2018 AND NOT 2010
 *
 * The archive reaches back to 2009 and the intent was to publish from 2010.
 * The data does not support it. Clearing rates before 2017 are mostly absent
 * from CBK's older result documents — 2009 has none at all, 2013 none, 2014
 * one, 2015 two — and a curve drawn through one point a year is not a curve,
 * it is a line with a story attached. `CURVE_MIN_BUCKETS` states the rule
 * instead of hard-coding a start year, so the range grows by itself if the
 * archive is ever backfilled.
 *
 * The sparse early years are NOT hidden: `curveRows` returns every cell it can
 * compute, with its sample size, and the CSV carries all of them. Only the
 * drawn curve is gated. A reader who wants 2011's single 2-year point can have
 * it; what they cannot have is it drawn as though it were a curve.
 */

import type { AuctionPrint, Bond } from '../types/bond';
import { normaliseCode, clearingRate, auctionKind } from './auction-history';

/**
 * Remaining-term buckets, labelled by the tenor a reader recognises.
 *
 * Buckets rather than exact tenors because the archive re-opens bonds: a
 * 15-year bond sold with nine years left is a 10-year point that year, and
 * filing it under "15" would put a short bond's yield on the long end. `lo` is
 * inclusive, `hi` exclusive.
 */
export const TENOR_BUCKETS: { lo: number; hi: number; label: string; years: number }[] = [
  { lo: 0, hi: 3, label: '2y', years: 2 },
  { lo: 3, hi: 7, label: '5y', years: 5 },
  { lo: 7, hi: 12, label: '10y', years: 10 },
  { lo: 12, hi: 17, label: '15y', years: 15 },
  { lo: 17, hi: 22, label: '20y', years: 20 },
  { lo: 22, hi: 99, label: '25y+', years: 25 },
];

/** A year needs this many populated buckets before its curve is drawn. */
export const CURVE_MIN_BUCKETS = 4;

export interface CurveCell {
  year: number;
  label: string;
  years: number;
  /** Median clearing rate across that year's auctions in that bucket. */
  rate: number;
  /** How many auctions the median is over. 1 is a single auction, not a curve. */
  n: number;
}

export interface CurveYear {
  year: number;
  cells: CurveCell[];
  /** True when enough buckets are populated to draw a shape rather than dots. */
  drawable: boolean;
}

/**
 * When the bond matures, from the archive if we hold it and from the issue
 * code if we do not.
 *
 * Most pre-2020 bonds have matured and are no longer in bonds.json, so relying
 * on the bond list alone throws away the older half of the archive. The issue
 * code carries the answer: FXD1/2019/015 was issued in 2019 for fifteen years.
 * Checked against the 58 bonds we DO hold a maturity date for, that arithmetic
 * lands on the right year 57 times.
 *
 * The approximation is the year, not the day, so this returns mid-year. That
 * is up to six months of error in the remaining term — irrelevant against
 * buckets three to five years wide, and stated here rather than left for
 * someone to discover at a bucket boundary.
 */
export function maturityAt(print: AuctionPrint, byCode: Map<string, Bond>): Date | null {
  const bond = byCode.get(normaliseCode(print.issueCode));
  if (bond?.maturityDate) {
    const d = new Date(bond.maturityDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const m = /^[A-Z]+\d*\/(\d{4})\/(\d+)/.exec(String(print.issueCode).toUpperCase());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]) + Number(m[2]), 5, 30));
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Build the curve for every year the archive can speak to.
 *
 * Restricted to FXD issuances:
 *  - Issuance only, because a tap sells at a fixed price and a switch is a debt
 *    exchange; neither is the market saying what it wants to be paid, which is
 *    the only thing a yield curve plots.
 *  - FXD only, because IFBs are withholding-tax exempt. An IFB yield and an FXD
 *    yield are not the same measurement, and averaging them into one point
 *    would quietly understate the long end, where most IFBs sit.
 */
export function curveRows(prints: AuctionPrint[], bonds: Bond[]): CurveYear[] {
  const byCode = new Map(bonds.map((b) => [normaliseCode(b.issueCode), b]));
  const buckets = new Map<string, number[]>();

  for (const p of prints) {
    if (!p.auctionDate) continue;
    if (auctionKind(p) !== 'issuance') continue;
    if (String(p.issueCode).toUpperCase().startsWith('IFB')) continue;
    const rate = clearingRate(p);
    if (rate == null) continue;

    const maturity = maturityAt(p, byCode);
    const auctioned = new Date(p.auctionDate);
    if (!maturity || Number.isNaN(auctioned.getTime())) continue;
    const years = (maturity.getTime() - auctioned.getTime()) / (365.25 * 86_400_000);
    // A bond auctioned after its own maturity date is a data error, not a
    // zero-year point; dropped rather than clamped into the short bucket.
    if (!(years > 0)) continue;

    const bucket = TENOR_BUCKETS.find((b) => years >= b.lo && years < b.hi);
    if (!bucket) continue;
    const key = `${p.auctionDate.slice(0, 4)}|${bucket.label}`;
    const seen = buckets.get(key);
    if (seen) seen.push(rate);
    else buckets.set(key, [rate]);
  }

  const years = new Map<number, CurveCell[]>();
  for (const [key, rates] of buckets) {
    const [y, label] = key.split('|');
    const bucket = TENOR_BUCKETS.find((b) => b.label === label)!;
    const cell: CurveCell = {
      year: Number(y),
      label,
      years: bucket.years,
      rate: Math.round(median(rates) * 1000) / 1000,
      n: rates.length,
    };
    const list = years.get(cell.year);
    if (list) list.push(cell);
    else years.set(cell.year, [cell]);
  }

  return [...years.entries()]
    .map(([year, cells]) => ({
      year,
      cells: cells.sort((a, b) => a.years - b.years),
      drawable: cells.length >= CURVE_MIN_BUCKETS,
    }))
    .sort((a, b) => a.year - b.year);
}

/**
 * The curve as a reader would download it — every cell, sparse years included,
 * with the sample size beside each rate so nobody has to take a one-auction
 * median on trust.
 */
export function curveToCSV(rows: CurveYear[]): string {
  const lines = ['year,tenor,tenor_years,median_clearing_rate_pct,auctions,drawn_as_curve'];
  for (const row of rows) {
    for (const c of row.cells) {
      lines.push(
        [row.year, c.label, c.years, c.rate.toFixed(3), c.n, row.drawable ? 'yes' : 'no'].join(',')
      );
    }
  }
  return lines.join('\n') + '\n';
}
