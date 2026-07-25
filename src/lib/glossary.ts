/**
 * Plain-English definitions for every technical term the app uses.
 *
 * The rule for writing these: explain it the way you would to a friend over
 * chai, then check that a professional would still call it correct. If those
 * two things conflict, the plain version wins and the precise version follows
 * in `precise`. A definition nobody understands protects nobody.
 *
 * Terms are ordered as a reader meets them, not alphabetically — the glossary
 * page reads as a short course, and the A–Z index sits on top for lookup.
 */

export interface Term {
  slug: string;
  term: string;
  also?: string;
  plain: string;
  precise?: string;
  why?: string;
}

export const GLOSSARY: Term[] = [
  {
    slug: 'bond',
    term: 'Bond',
    also: 'Treasury bond, government paper',
    plain:
      'A loan you make to the government. You hand over money now, they pay you interest along the way, and they give your money back on an agreed date.',
    precise:
      'A tradeable debt security issued by the National Treasury through the Central Bank of Kenya, carrying a fixed or indexed coupon and a stated maturity.',
    why: 'You are the lender here, not the borrower. Everything else follows from that.',
  },
  {
    slug: 'coupon',
    term: 'Coupon',
    plain:
      'The interest the government pays you, usually twice a year. A 13% coupon on KES 100,000 pays KES 13,000 a year — KES 6,500 every six months.',
    precise:
      'The annual interest rate stated on the bond, paid in instalments at the coupon frequency (twice yearly for most Kenyan issues).',
    why: 'The coupon is fixed for the life of the bond. It never changes, whatever happens to rates later.',
  },
  {
    slug: 'face-value',
    term: 'Face value',
    also: 'par, principal, nominal',
    plain:
      'The amount the government promises to give back at the end. Prices are quoted per KES 100 of face value, so a price of 98 means you pay 98 to be repaid 100 later.',
    why: 'This is why a bond bought below 100 earns you more than its coupon suggests.',
  },
  {
    slug: 'maturity',
    term: 'Maturity',
    plain: 'The date the government repays your money in full and the bond ends.',
    why: 'Your money is committed until then — unless you sell to someone else first.',
  },
  {
    slug: 'tenor',
    term: 'Tenor',
    plain:
      'How long the loan runs. A 10-year bond has a 10-year tenor. Kenya issues everything from 91 days to 30 years.',
    why: 'Longer usually pays more, because you are waiting longer and taking more risk.',
  },
  {
    slug: 'yield',
    term: 'Yield',
    also: 'YTM, yield to maturity',
    plain:
      'Your actual annual return if you hold the bond to the end — counting the interest you receive AND any gain or loss from the price you paid.',
    precise:
      'The discount rate that makes the present value of all remaining cash flows equal to the price paid, including accrued interest.',
    why: 'The coupon tells you what the bond pays. The yield tells you what YOU earn. They are only the same if you paid exactly 100.',
  },
  {
    slug: 'net-yield',
    term: 'Net yield',
    plain:
      'Your yield after withholding tax has been taken off. This is the number that actually reaches your bank account.',
    why: 'Almost everywhere else quotes gross yield. A 15% gross yield on a short bond is 12.75% in your hand.',
  },
  {
    slug: 'withholding-tax',
    term: 'Withholding tax',
    also: 'WHT',
    plain:
      'Tax deducted from your interest before you receive it. In Kenya: 10% on bonds of 10 years or longer, 15% on shorter ones, and 0% on infrastructure bonds.',
    precise:
      'A final tax on interest income under the Income Tax Act, deducted at source by the paying agent. Applied to coupon interest only — the return of your principal is not taxed.',
    why: 'Tenor changes your tax rate, so a longer bond can beat a shorter one twice over.',
  },
  {
    slug: 'infrastructure-bond',
    term: 'Infrastructure bond',
    also: 'IFB',
    plain:
      'A government bond that funds infrastructure projects and pays interest completely free of withholding tax.',
    why: 'A 12% tax-free IFB beats a 13.5% taxable bond. Comparing headline rates alone gets this backwards.',
  },
  {
    slug: 'yield-curve',
    term: 'Yield curve',
    also: 'the curve, term structure',
    plain:
      'A picture of what the government pays for loans of different lengths — 2 years, 5 years, 10, 20 — drawn as a line from short to long.',
    precise:
      'The relationship between yield to maturity and time to maturity across a set of comparable securities.',
    why:
      'When the line slopes up, longer loans pay more and you are rewarded for waiting. When it is flat, a 20-year bond pays little more than a 5-year one — so why lock your money away? The shape is the market telling you where the value is.',
  },
  {
    slug: 'central-bank-rate',
    term: 'Central Bank Rate',
    also: 'CBR, policy rate, base rate',
    plain:
      'The interest rate the Central Bank sets to steer the whole economy. Every other rate in Kenya — bonds, bank loans, savings — is priced with one eye on it.',
    why: 'When the CBR falls, new bonds tend to pay less. That is why the direction it is moving matters as much as the level.',
  },
  {
    slug: 'clean-and-dirty-price',
    term: 'Clean and dirty price',
    plain:
      'The clean price is the quoted price. The dirty price is what you actually pay — clean price plus the interest that has built up since the last coupon date.',
    why: 'You are compensating the seller for interest they earned but have not yet been paid. Budget for it: it is real money on settlement day.',
  },
  {
    slug: 'accrued-interest',
    term: 'Accrued interest',
    plain:
      'Interest that has quietly built up day by day since the last coupon payment, but has not been paid out yet.',
    precise:
      'Calculated on an Actual/365 day-count basis for Kenyan government securities.',
  },
  {
    slug: 'discount-rate',
    term: 'Discount rate',
    plain:
      'How Treasury bills are quoted. You buy below KES 100 and are repaid KES 100 — the gap is your interest. A "9% discount rate" is not a 9% return.',
    why: 'Your true annual return is always higher than the quoted discount rate, and the gap widens the longer the bill runs. Our T-bills page does the conversion.',
  },
  {
    slug: 'treasury-bill',
    term: 'Treasury bill',
    also: 'T-bill',
    plain:
      'A short government loan of 91, 182 or 364 days. No coupons — you simply pay less than KES 100 today and receive KES 100 at the end.',
    why: 'The natural home for money you will need soon but do not want sitting idle.',
  },
  {
    slug: 'ladder',
    term: 'Ladder',
    plain:
      'Spreading your money across bonds that mature in different years, so something matures regularly instead of everything at once.',
    why: 'You are never forced to sell at a bad moment, and you keep reinvesting at whatever rates arrive.',
  },
  {
    slug: 'auction',
    term: 'Auction',
    also: 'primary issue',
    plain:
      'How new bonds are first sold. CBK announces an offer, investors bid, and the accepted bids set the rate. You can bid from KES 50,000.',
  },
  {
    slug: 'secondary-market',
    term: 'Secondary market',
    plain:
      'Where bonds are bought and sold between investors after issue, on the Nairobi Securities Exchange. This is how you exit before maturity.',
    why: 'Prices here move with rates, so selling early can gain or lose you money. Holding to maturity avoids the question entirely.',
  },
  {
    slug: 'dhowcsd',
    term: 'DhowCSD',
    plain:
      "The Central Bank's online system where you open a securities account, place bids and hold your bonds. It replaced the old CDS branch process.",
  },
  {
    slug: 'inflation',
    term: 'Real return',
    also: 'after inflation',
    plain:
      'What your money earns after prices have risen. Earning 13% while inflation runs at 6% means you are about 7% better off in what your money can actually buy.',
    why: 'A high rate in a high-inflation year can leave you standing still. This is the number that decides whether you are genuinely getting ahead.',
  },
];

export const GLOSSARY_BY_SLUG: Record<string, Term> = Object.fromEntries(
  GLOSSARY.map((t) => [t.slug, t]),
);
