// What a bid's expected range pays once tax is taken off, against simply
// buying the best T-bill. The bid assistant says where an auction is likely to
// clear; the question a saver has on the day is "is that worth tying money up
// for", and that needs the same number in after-tax terms next to the
// alternative that carries no price risk.
//
// The after-tax figure is `gross x (1 - withholding rate)`. That treats the
// bond's whole yield as taxed interest, which slightly overstates the tax on a
// bond bought below par and understates it above par, so it is labelled
// "about" wherever it is shown. It is for comparing, not for a tax return.

export interface BidPayoffInput {
  /** Bottom, middle and top of the expected clearing range, gross %. */
  lowPct: number;
  medianPct: number;
  highPct: number;
  /** Withholding tax rate on this bond (0 for an IFB, 0.10 or 0.15 otherwise). */
  whtRate: number;
  /** After-tax effective yield of the best T-bill on offer, %. */
  bestBillNetPct: number;
}

export type PayoffVerdict = 'leads' | 'mixed' | 'trails';

export interface BidPayoff {
  netLow: number;
  netMedian: number;
  netHigh: number;
  /** Points above (+) or below (-) the best bill at each end and the middle. */
  edgeLow: number;
  edgeMedian: number;
  edgeHigh: number;
  verdict: PayoffVerdict;
}

export function bidPayoff(i: BidPayoffInput): BidPayoff | null {
  const vals = [i.lowPct, i.medianPct, i.highPct, i.whtRate, i.bestBillNetPct];
  if (!vals.every(Number.isFinite) || i.whtRate < 0 || i.whtRate >= 1) return null;
  if (i.lowPct > i.highPct) return null;
  const net = (g: number) => g * (1 - i.whtRate);
  const [netLow, netMedian, netHigh] = [net(i.lowPct), net(i.medianPct), net(i.highPct)];
  const edge = (n: number) => n - i.bestBillNetPct;
  const verdict: PayoffVerdict =
    edge(netLow) >= 0 ? 'leads' : edge(netHigh) < 0 ? 'trails' : 'mixed';
  return {
    netLow, netMedian, netHigh,
    edgeLow: edge(netLow), edgeMedian: edge(netMedian), edgeHigh: edge(netHigh),
    verdict,
  };
}

const pct = (v: number) => `${v.toFixed(2)}%`;
const points = (v: number) => `${Math.abs(v).toFixed(2)} ${Math.abs(v).toFixed(2) === '1.00' ? 'point' : 'points'}`;

export function describePayoff(p: BidPayoff, whtRate: number, bestBillNetPct: number): string {
  const tax = whtRate === 0 ? 'with no withholding tax' : `after ${Math.round(whtRate * 100)}% tax`;
  const range = `about ${pct(p.netLow)} to ${pct(p.netHigh)} ${tax}`;
  const bill = `the best T-bill's ${pct(bestBillNetPct)}`;
  if (p.verdict === 'leads') {
    return `That range pays ${range}: even at the bottom it beats ${bill}, by ${points(p.edgeLow)}, and by ${points(p.edgeMedian)} at the middle.`;
  }
  if (p.verdict === 'trails') {
    return `That range pays ${range}: below ${bill} even at the top. A T-bill pays more here, with no price risk.`;
  }
  return (
    `That range pays ${range}. At the bottom it would trail ${bill} by ${points(p.edgeLow)}; ` +
    `at the middle it ${p.edgeMedian >= 0 ? `leads by ${points(p.edgeMedian)}` : `still trails by ${points(p.edgeMedian)}`}.`
  );
}
