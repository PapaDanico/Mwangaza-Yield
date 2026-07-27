"""Turn a CBK bond prospectus into auction calendar records — one per BOND.

Written against what the documents actually say, printed by probe_calendar.py
from the live listing rather than remembered from an older layout:

    PROSPECTUS FOR RE-OPENED 10,20 AND 30-YEARS FIXED COUPON
    ISSUE NUMBER (S)      FXD1/2022/010  FXD1/2021/020  FXD1/2026/030
    COUPON RATES (%)         13.4900        13.4440        12.5000
    WITHHOLDING TAX (%)         10             10             10
    MATURITY DATES        03-May-2032    22-Jul-2041    13-Mar-2056
    PERIOD OF SALE        25-Jun 2026 to 08-Jul-2026
    AUCTION DATE          Wednesday, 08-Jul-2026
    SETTLEMENT DATE       Monday, 13-Jul-2026

WHAT THIS CHANGES ABOUT cbk_parser.py
-------------------------------------
Four things, each of which would have shipped a wrong calendar:

  1. ONE RECORD PER BOND. cbk_parser takes the first issue code in the file
     (`ISSUE_RE.search`). Both documents on the live listing sell more than one
     bond — three and two. Automating it as written publishes one and silently
     drops the rest, which is the multi-bond trap that already cost a rewrite on
     the results side.

  2. THERE IS NO "OFFER CLOSES" FIELD. The close date is the tail of a single
     PERIOD OF SALE line holding both ends. cbk_parser looks for "Offer Closes"
     or "Closing Date" and raises when neither appears — which is every current
     prospectus.

  3. THE PER-BOND FIGURES ARE COLUMNS, not one value each. "COUPON RATES (%)
     13.4900 13.4440 12.5000" is three coupons in positional order against three
     codes. cbk_parser's single-value regex takes the first and gives it to
     whichever bond it happened to name.

  4. A MISSING AMOUNT IS NOT ZERO. cbk_parser writes amountOfferedKES = 0 when
     it finds nothing, and nothing is what it finds — the probe matched no
     amount in either document. Zero offered is a claim; absent is the truth.

WHAT IT REFUSES
---------------
Tap sales. They are a different document: no auction date at all, dates only in
prose, per-bond figures written as "FXD1/2018/020 -13.9885%" rather than in
columns. A parser that half-reads one would produce a calendar entry with no
auction date, and the ledger keys on (code, auction date). Better to skip it and
say so than to emit a record nobody can use.

The date CBK prints is sometimes malformed — "25-Jun 2026" is missing its second
hyphen in the live July prospectus — so the day/month/year reader tolerates the
separator being a hyphen or a space, and only that.
"""
import re
from datetime import datetime

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

ISSUE_RE = re.compile(r"\b((?:FXD|IFB|SDB)\s?\d\s?/\s?\d{4}\s?/\s?\d+(?:\.\d+)?)\b", re.I)

# "03-May-2032", and "25-Jun 2026" — the separator is a hyphen OR a space,
# because CBK's own July 2026 prospectus prints one of each on the same line.
DMY_RE = re.compile(r"(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})")

# A tap sale says so in its heading, and it is a different document entirely.
TAP_RE = re.compile(r"\btap\s*sale\b", re.I)

LABELS = {
    "codes": re.compile(r"ISSUE\s*NUMBER", re.I),
    "coupons": re.compile(r"COUPON\s*RATES?", re.I),
    "maturities": re.compile(r"MATURITY\s*DATES?", re.I),
    "wht": re.compile(r"WITHHOLDING\s*TAX", re.I),
    "period": re.compile(r"PERIOD\s*OF\s*SALE", re.I),
    "auction": re.compile(r"AUCTION\s*DATE", re.I),
    "settlement": re.compile(r"SETTLEMENT\s*DATE", re.I),
}


def parse_dmy(raw: str):
    """'03-May-2032' or '25-Jun 2026' to an ISO date. None when unreadable."""
    m = DMY_RE.search(raw or "")
    if not m:
        return None
    month = MONTHS.get(m[2][:3].lower())
    if not month:
        return None
    try:
        return datetime(int(m[3]), month, int(m[1])).date().isoformat()
    except ValueError:
        return None


def all_dmy(raw: str) -> list:
    """Every date on a line, in order. PERIOD OF SALE carries two."""
    out = []
    for m in DMY_RE.finditer(raw or ""):
        month = MONTHS.get(m[2][:3].lower())
        if not month:
            continue
        try:
            out.append(datetime(int(m[3]), month, int(m[1])).date().isoformat())
        except ValueError:
            continue
    return out


def normalise_code(code: str) -> str:
    """Pad the tenor to three digits, as the results archive spells it."""
    c = re.sub(r"\s", "", code).upper()
    m = re.match(r"^([A-Z]+\d*)/(\d{4})/(\d+)(\.\d+)?$", c)
    if not m:
        return c
    return f"{m[1]}/{m[2]}/{m[3].zfill(3)}{m[4] or ''}"


def _labelled(lines: list, key: str) -> str:
    pat = LABELS[key]
    for line in lines:
        if pat.search(line):
            return line
    return ""


def parse_prospectus_text(text: str) -> dict:
    """Records plus the reasons anything was refused.

    Returns {"records": [...], "skipped": "why"} — never raises on a document
    it cannot read, because one odd prospectus must not stop a scheduled run
    from publishing the others.
    """
    lines = [" ".join(l.split()) for l in (text or "").splitlines() if l.strip()]

    if any(TAP_RE.search(l) for l in lines[:40]):
        return {"records": [], "skipped": "tap sale — a different layout, and it "
                                          "carries no auction date to key on"}

    code_line = _labelled(lines, "codes")
    codes = [normalise_code(m[1]) for m in ISSUE_RE.finditer(code_line)]
    if not codes:
        return {"records": [], "skipped": "no ISSUE NUMBER line"}

    auction_date = parse_dmy(_labelled(lines, "auction"))
    if not auction_date:
        # The ledger and the archive both key on (code, auction date). A record
        # without one cannot be matched to its own result later.
        return {"records": [], "skipped": "no readable AUCTION DATE"}

    period = all_dmy(_labelled(lines, "period"))
    open_date = period[0] if period else None
    close_date = period[1] if len(period) > 1 else None
    settlement = parse_dmy(_labelled(lines, "settlement"))

    # Positional: the nth number on the coupon row belongs to the nth code.
    # Only used when the counts agree — a mismatch means the row wrapped or a
    # column was missed, and guessing which coupon belongs to which bond is
    # how a reader ends up with the wrong cash flows.
    def aligned(key: str, pattern: str):
        raw = _labelled(lines, key)
        vals = re.findall(pattern, raw.split(")", 1)[-1] if ")" in raw else raw)
        return vals if len(vals) == len(codes) else None

    coupons = aligned("coupons", r"\d+\.\d+")
    maturities = None
    mat_line = _labelled(lines, "maturities")
    mats = all_dmy(mat_line)
    if len(mats) == len(codes):
        maturities = mats

    records = []
    for i, code in enumerate(codes):
        tenor_raw = code.rsplit("/", 1)[1]
        records.append({
            "id": f"auc-{code.replace('/', '-').lower()}-{auction_date}",
            "issueCode": code,
            "category": re.match(r"^[A-Z]+", code)[0],
            "tenorYears": float(tenor_raw),
            "couponRate": float(coupons[i]) if coupons else None,
            "maturityDate": maturities[i] if maturities else None,
            "offerOpenDate": open_date,
            "offerCloseDate": close_date,
            "auctionDate": auction_date,
            "settlementDate": settlement,
            # Absent, not zero. The probe matched no amount in either live
            # document, and "Ksh 0 on offer" is a claim we would be inventing.
            "amountOfferedKES": None,
            "status": "upcoming",
        })
    return {"records": records, "skipped": None}
