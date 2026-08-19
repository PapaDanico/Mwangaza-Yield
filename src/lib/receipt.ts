import type { Bond } from '@/types/bond';
import type { InvestmentResult } from './financial-engine';
import { formatKES, formatPct } from './financial-engine';

/** Current app version — read from the environment variable set at build time,
 *  falling back to the package.json value so tests don't need the env. */
export const APP_VERSION =
  process.env['NEXT_PUBLIC_APP_VERSION'] ?? '0.1.0';

// ---------------------------------------------------------------------------
// Context types — one per calculation kind.
// ---------------------------------------------------------------------------

export interface DataSource {
  name: string;
  /** Public URL or descriptive path. */
  url: string;
  /** ISO date the source was last updated, or null if unknown. */
  lastUpdated: string | null;
}

export interface BondInvestmentContext {
  kind: 'bond-investment';
  bond: Pick<
    Bond,
    'isin' | 'issueCode' | 'couponRate' | 'maturityDate' | 'taxExempt' | 'tenorYears'
  >;
  faceValueKES: number;
  cleanPrice: number;
  priceSource: string;
  settlementDate: string;
  result: InvestmentResult;
  dataSources: DataSource[];
}

export interface PortfolioHolding {
  issueCode: string;
  faceValueKES: number;
  cleanPrice: number;
  priceSource: string;
  netYTM: number;
  settlementCostKES: number;
}

export interface PortfolioContext {
  kind: 'portfolio';
  holdings: PortfolioHolding[];
  weightedNetYTM: number;
  totalCostKES: number;
  totalAnnualIncomeKES: number;
  dataSources: DataSource[];
}

export type CalculationContext = BondInvestmentContext | PortfolioContext;

// ---------------------------------------------------------------------------
// Receipt type
// ---------------------------------------------------------------------------

export interface Receipt {
  id: string;
  /** ISO timestamp at which the receipt was generated. */
  timestamp: string;
  appVersion: string;
  kind: CalculationContext['kind'];
  /** Human-readable title for display in history. */
  title: string;
  /** All inputs as key-value pairs. */
  inputs: Array<{ label: string; value: string; source?: string }>;
  dataSources: DataSource[];
  formulaPlainText: string;
  formulaNotation: string;
  /** Final computed value as a display string. */
  result: string;
  /** SHA-256 hex of `${kind}:${JSON.stringify(inputs)}:${formulaNotation}`,
   *  or a djb2 hex prefixed "djb2:" when SubtleCrypto is unavailable. */
  hash: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** djb2 hash as a hex string — deterministic fallback when SubtleCrypto
 *  is not available (Node tests, non-secure origins). */
function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep as uint32
  }
  return 'djb2:' + h.toString(16).padStart(8, '0');
}

async function sha256Hex(payload: string): Promise<string> {
  try {
    const subtle =
      typeof globalThis.crypto?.subtle !== 'undefined'
        ? globalThis.crypto.subtle
        : null;
    if (!subtle) return djb2Hex(payload);
    const buf = await subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload),
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return djb2Hex(payload);
  }
}

function uuid(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function buildBondInvestmentReceipt(
  ctx: BondInvestmentContext,
): Omit<Receipt, 'hash' | 'id' | 'timestamp'> {
  const { bond, faceValueKES, cleanPrice, priceSource, settlementDate, result } = ctx;
  const taxLabel = bond.taxExempt ? '0% (IFB — tax-free)' : `${(result.whtRate * 100).toFixed(0)}%`;

  const inputs: Receipt['inputs'] = [
    { label: 'Bond', value: bond.issueCode, source: 'bonds.json' },
    { label: 'ISIN', value: bond.isin },
    { label: 'Coupon rate', value: formatPct(bond.couponRate), source: 'bonds.json' },
    { label: 'Maturity date', value: bond.maturityDate, source: 'bonds.json' },
    { label: 'Face value (Ksh)', value: formatKES(faceValueKES), source: 'User input' },
    { label: 'Clean price per 100', value: cleanPrice.toFixed(4), source: priceSource },
    { label: 'Settlement date', value: settlementDate, source: 'Computed (today)' },
    { label: 'Withholding tax rate', value: taxLabel, source: 'Income Tax Act §7A' },
    { label: 'Day-count convention', value: 'Actual / 364', source: 'CBK bond prospectuses' },
    { label: 'Coupon frequency', value: 'Semi-annual (182-day periods)' },
  ];

  return {
    appVersion: APP_VERSION,
    kind: 'bond-investment',
    title: `${bond.issueCode} — net yield calculation`,
    inputs,
    dataSources: ctx.dataSources,
    formulaPlainText:
      'Net YTM is solved by bisection on the remaining coupon schedule, discounting '
      + 'each after-tax coupon payment and the principal repayment to the dirty settlement '
      + 'price. Accrued interest uses Actual/364. WHT applies to coupon income only; '
      + 'principal redemption is untaxed.',
    formulaNotation:
      'DirtyPrice = Σ [ C·(1−τ) / (1+r)^(t_i/364) ] + FV / (1+r)^(T/364)\n'
      + 'where C = coupon/2, τ = WHT rate, r = net YTM / 2, t_i = days to coupon i,\n'
      + 'T = days to maturity, FV = 100 (face value per 100).',
    result:
      `Net YTM: ${formatPct(result.netYTM)} · `
      + `Total outlay: ${formatKES(result.settlementCostKES)} · `
      + `Semi-annual net income: ${formatKES(result.netCouponPerPeriodKES)}`,
  };
}

function buildPortfolioReceipt(
  ctx: PortfolioContext,
): Omit<Receipt, 'hash' | 'id' | 'timestamp'> {
  const { holdings, weightedNetYTM, totalCostKES, totalAnnualIncomeKES } = ctx;

  const inputs: Receipt['inputs'] = [
    { label: 'Holdings count', value: String(holdings.length), source: 'User portfolio (IndexedDB)' },
    ...holdings.map((h) => ({
      label: h.issueCode,
      value: `${formatKES(h.faceValueKES)} face · price ${h.cleanPrice.toFixed(2)} · net ${formatPct(h.netYTM)}`,
      source: h.priceSource,
    })),
  ];

  return {
    appVersion: APP_VERSION,
    kind: 'portfolio',
    title: 'Portfolio weighted yield',
    inputs,
    dataSources: ctx.dataSources,
    formulaPlainText:
      'Portfolio weighted net YTM is the cost-weighted average of each holding\'s individual '
      + 'net YTM, where the weight is the settlement cost (dirty price × face value / 100). '
      + 'Holdings with no recorded price use par (100) as a placeholder — these are flagged.',
    formulaNotation:
      'WeightedNetYTM = Σ( netYTM_i × cost_i ) / Σ( cost_i )\n'
      + 'where cost_i = dirtyPrice_i × faceValue_i / 100',
    result:
      `Weighted net YTM: ${formatPct(weightedNetYTM)} · `
      + `Total portfolio cost: ${formatKES(totalCostKES)} · `
      + `Annual net income: ${formatKES(totalAnnualIncomeKES)}`,
  };
}

export async function generateReceipt(ctx: CalculationContext): Promise<Receipt> {
  const partial =
    ctx.kind === 'bond-investment'
      ? buildBondInvestmentReceipt(ctx)
      : buildPortfolioReceipt(ctx);

  const hashPayload = `${partial.kind}:${JSON.stringify(partial.inputs)}:${partial.formulaNotation}`;
  const hash = await sha256Hex(hashPayload);

  return {
    ...partial,
    id: uuid(),
    timestamp: new Date().toISOString(),
    hash,
  };
}

export function receiptToMarkdown(r: Receipt): string {
  const lines: string[] = [
    `# Calculation Receipt`,
    `**${r.title}**`,
    `Generated: ${r.timestamp.replace('T', ' ').slice(0, 19)} UTC · App v${r.appVersion}`,
    '',
    `## Inputs`,
    ...r.inputs.map(
      (i) => `- ${i.label}: **${i.value}**${i.source ? ` _(${i.source})_` : ''}`,
    ),
    '',
    `## Data Sources`,
    ...r.dataSources.map(
      (d) =>
        `- ${d.name}${d.lastUpdated ? ` · ${d.lastUpdated}` : ''}${d.url ? ` · ${d.url}` : ''}`,
    ),
    '',
    `## Formula`,
    r.formulaPlainText,
    '',
    '```',
    r.formulaNotation,
    '```',
    '',
    `## Result`,
    r.result,
    '',
    `## Verification`,
    `SHA-256: \`${r.hash}\``,
    `Receipt ID: ${r.id}`,
    '',
    `---`,
    `Mwangaza Yield · https://mwangazayield.org`,
    `Figures are calculated client-side and never sent to a server.`,
  ];

  return lines.join('\n');
}

export function receiptToJSON(r: Receipt): string {
  return JSON.stringify(r, null, 2);
}
