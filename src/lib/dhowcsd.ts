import type { Holding } from '../types/bond';

/**
 * Reading a DhowCSD portfolio export.
 *
 * DhowCSD is the CBK settlement system every Kenyan retail bondholder actually
 * holds through, and "Export portfolio" is the one file a reader already has.
 * Asking them to retype it into our own four-column template is asking them not
 * to bother — so this reads theirs.
 *
 * WHAT THE EXPORT CONTAINS, AND WHAT IT DOES NOT
 * ----------------------------------------------
 * It is a POSITION statement, not a transaction history. It states what is held
 * today: issue number, ISIN, maturity, quantity, face value, and how much of
 * that quantity is pledged, banned or disputed. It carries NO purchase date and
 * NO purchase price, because a custodian records custody, not what you paid.
 *
 * That absence is the whole design problem, and it is the reason this file
 * exists instead of a few lines in the page. The existing importer defaults a
 * missing price to 100 and a missing date to today. Applied to this file, every
 * holding would silently acquire a cost basis nobody supplied, and the yield,
 * the capital gain and the total return computed from it would be presented to
 * a reader as facts about their own money. A wrong number carrying your own
 * portfolio's name on it is worse than a blank.
 *
 * So a holding imported from DhowCSD is marked `costBasisKnown: false` and the
 * page shows what the file genuinely supports:
 *
 *   EXACT, from face value alone — coupon amounts, the payment calendar,
 *   withholding tax, maturity proceeds. None of these depend on what was paid.
 *
 *   REFUSED until the reader supplies a price — yield to maturity, yield on
 *   cost, capital gain, total return. All of these are a function of cost.
 *
 * The reader can add a price per holding afterwards and get the rest. What they
 * cannot do is have one invented for them.
 *
 * PRIVACY
 * -------
 * The trailer of this file carries the account holder's full name, email,
 * postal address, phone number, KRA PIN, CUI and IBANs. None of it is read.
 * Parsing stops at the trailer and only the position columns are returned —
 * see `parseDhowCsd` and the test that asserts no trailer value survives.
 * Nothing here leaves the device in any case: the app is a static site and the
 * portfolio store writes to IndexedDB.
 */

/** Columns that identify the format. DhowCSD writes these exact headings. */
const SIGNATURE = ['issue number', 'isin', 'total quantity'];

/**
 * Rows after the positions, which state who the account belongs to.
 * Parsing stops at the first one rather than trying to skip them individually.
 */
const TRAILER_RE =
  /^(export\s*date|requested\s*date|iban|email|address|full\s*name|cui|kra\s*pin)\s*:/i;

export interface DhowCsdPosition {
  issuer: string;
  issueCode: string;
  isin: string;
  /** ISO date, or null when the export's date could not be read. */
  maturityDate: string | null;
  issueType: string;
  /** Face value of the whole position, in shillings. */
  faceValueKES: number;
  totalQuantity: number;
  availableQuantity: number;
  /** Pledged, banned or disputed — quantity that cannot simply be sold. */
  encumberedQuantity: number;
  currency: string;
}

export interface DhowCsdImport {
  positions: DhowCsdPosition[];
  /** Rows that looked like positions but could not be read, with the reason. */
  rejected: { row: number; reason: string }[];
  /** True when the header matched the DhowCSD signature. */
  recognised: boolean;
}

/** "50,000" and "550,000" — thousands separators, sometimes quoted. */
function num(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/[",\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * "21 May 2040" to "2040-05-21".
 *
 * Returns null rather than guessing. A maturity date is what every cash-flow
 * projection is measured to, so a misread one is not a cosmetic problem, and
 * the bond can usually be identified by its issue code anyway.
 */
export function parseDhowDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\s*$/.exec(raw);
  if (!m) return null;
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = Number(m[1]);
  if (day < 1 || day > 31) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Read the positions out of a parsed DhowCSD export.
 *
 * Takes rows already split by a CSV reader — the app uses PapaParse, which
 * handles the quoted multi-line IBAN block correctly — so this deals only with
 * meaning, not with quoting.
 */
export function parseDhowCsd(rows: Record<string, string>[]): DhowCsdImport {
  const first = rows[0];
  const headers = first ? Object.keys(first).map((h) => h.trim().toLowerCase()) : [];
  // The BOM rides on the first header, so match loosely.
  const recognised = SIGNATURE.every((s) => headers.some((h) => h.includes(s)));
  if (!recognised) return { positions: [], rejected: [], recognised: false };

  const get = (r: Record<string, string>, want: string): string | undefined => {
    const key = Object.keys(r).find((k) => k.trim().toLowerCase().includes(want));
    return key ? r[key] : undefined;
  };

  const positions: DhowCsdPosition[] = [];
  const rejected: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const values = Object.values(r).map((v) => (v ?? '').trim());
    const lead = values[0] ?? '';

    // The trailer starts here and everything below it is personal data.
    if (TRAILER_RE.test(lead)) break;
    if (values.every((v) => !v)) continue;

    const issueCode = (get(r, 'issue number') ?? '').trim();
    if (!issueCode) {
      // A row with no issue number this far up is malformed, not a trailer.
      rejected.push({ row: i + 2, reason: 'no issue number' });
      continue;
    }

    const total = num(get(r, 'total quantity')) ?? 0;
    const available = num(get(r, 'avaliable quantity')) ?? num(get(r, 'available quantity')) ?? 0;
    const nominal = num(get(r, 'individual nominal value'));

    // Face value, preferring the column that says so. Quantity times nominal is
    // the same figure when both are present, and is the fallback when the face
    // value column is blank.
    const stated = num(get(r, 'face value'));
    const derived = nominal != null && total ? nominal * total : null;
    const faceValueKES = stated ?? derived;
    if (!faceValueKES) {
      rejected.push({ row: i + 2, reason: `${issueCode}: no face value` });
      continue;
    }

    // Disagreement means one of the two readings is wrong and there is no way
    // to tell which, so the row is refused rather than silently halved. A
    // shilling of rounding is not a disagreement.
    if (stated != null && derived != null && Math.abs(stated - derived) > 1) {
      rejected.push({
        row: i + 2,
        reason: `${issueCode}: face value ${stated} does not match ${nominal} x ${total}`,
      });
      continue;
    }

    positions.push({
      issuer: (get(r, 'issuer') ?? '').trim(),
      issueCode,
      isin: (get(r, 'isin') ?? '').trim(),
      maturityDate: parseDhowDate(get(r, 'maturity date')),
      issueType: (get(r, 'issue type') ?? '').trim(),
      faceValueKES,
      totalQuantity: total,
      availableQuantity: available,
      encumberedQuantity: Math.max(0, total - available),
      currency: (get(r, 'currency') ?? 'KES').trim() || 'KES',
    });
  }

  return { positions, rejected, recognised: true };
}

/**
 * A DhowCSD position as a holding, with the cost basis left unknown.
 *
 * `purchaseCleanPrice` still carries par so that nothing downstream divides by
 * undefined, but `costBasisKnown: false` is what the page reads, and every
 * price-dependent figure is suppressed on that flag rather than on the value.
 * The two must not be confused: par is a placeholder here, not a reading.
 */
export function toHoldings(positions: DhowCsdPosition[]): Holding[] {
  return positions.map((p, i) => ({
    id: `dhowcsd-${p.isin || p.issueCode}-${i}`,
    isin: p.isin,
    issueCode: p.issueCode,
    faceValueKES: p.faceValueKES,
    purchaseDate: '',
    purchaseCleanPrice: 100,
    costBasisKnown: false,
    encumberedQuantity: p.encumberedQuantity || undefined,
  }));
}

/** True when a CSV's headers look like a DhowCSD export rather than our template. */
export function looksLikeDhowCsd(rows: Record<string, string>[]): boolean {
  return parseDhowCsd(rows).recognised;
}
