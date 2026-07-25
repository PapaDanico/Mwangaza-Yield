"""Parse CBK Treasury bond auction RESULTS into auction-results.json.

Source: https://www.centralbank.go.ke/bills-bonds/treasury-bonds/ — the LIVE
section. (The /securities/ path answers HTTP 200 while serving a 2016 archive;
see docs/DATA-SOURCES.md §15. That trap cost this project two wrong
conclusions.) Results PDFs live under /uploads/historical_treasury_bond_results/.

This is the dataset three roadmap items were waiting on: coupon rates for the
59 registered bonds we cannot currently price, twelve months of clearing
yields to answer "is that any good?", and the weighted average accepted rate —
what to actually bid.

WHY THIS DOES NOT PARSE extract_text()
--------------------------------------
The probe showed pdfplumber rendering one line as:

    Coupon Rate (%)   1 1.277   1 2.873

Those are TWO coupons — 11.277% and 12.873% — printed in side-by-side columns,
with a space injected inside each number. A regex over that text finds four
numbers (1, 1.277, 1, 2.873) and gets every one of them wrong while looking
entirely confident. For a figure that drives someone's yield calculation, that
is the worst possible failure mode.

So we work from word POSITIONS instead. The issue codes in the header fix the
column centres; every later value is assigned to the nearest column and the
fragments within a column are joined. "1" and "1.277" sitting in the same
column become "11.277" because that is what the page actually shows.
"""
import json
import os
import re
import sys
import time
from datetime import date, datetime
from io import BytesIO
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from common import DATA_DIR, normalise_issue_code, write_dataset

LISTING = "https://www.centralbank.go.ke/bills-bonds/treasury-bonds/"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 60
# Every results PDF is parsed exactly ONCE. Its numbers never change after
# publication — an auction held in 2021 cleared where it cleared — so
# re-downloading 280 files daily to re-derive identical values is pure waste,
# and it was also the thing capping coverage: a cheap daily run could only
# afford a dozen files, which priced 13 of 59 bonds.
#
# Now the run skips anything already in auction-results.json and spends its
# budget on files it has never seen. The first few runs work backwards through
# the archive; after that CBK publishes about four a month and the job has
# almost nothing to do.
#
# The accumulating file is also the yield history roadmap item 4 asked for —
# every auction print we have ever read, kept rather than discarded.
MAX_NEW_PER_RUN = 120

# A count is not a time bound. 120 files at a 60-second timeout is a two-hour
# worst case, and the first dispatch of the incremental parser demonstrated the
# problem: two jobs read the archive concurrently, one finished the same 120
# files in five minutes and the other was still going twenty minutes later —
# CBK evidently rations concurrent readers. A daily job must not be able to run
# for hours because a server got slow.
#
# Stopping early is *free* here, and only because parsing is incremental:
# whatever was read is kept, and the next run resumes at the next unread file.
# Before that change this budget would have meant permanently losing the tail
# of the archive; now it means arriving a day later.
TIME_BUDGET_SECONDS = int(os.environ.get("AUCTION_TIME_BUDGET", "600"))

# Stamp every record with the extraction logic that produced it.
#
# Parsing each PDF once is what made full coverage affordable, and it has one
# sharp edge: a record is never re-derived, so a parser BUG outlives its fix.
# That is not hypothetical. Records captured before the column-geometry fix
# attribute a coupon to the wrong bond — one file's 11.766 was hung on the leg
# of the auction that had been cancelled — and no amount of correct code
# afterwards revisits them. The archive silently preserves the mistakes of
# whatever parser was running that day.
#
# Bumping this makes the next run treat older records as unread and re-derive
# them. Bump it whenever a change alters what gets EXTRACTED — a new field, a
# different column rule, a changed guard — and leave it alone for changes that
# only affect which files are fetched or how fast.
PARSER_VERSION = 2

RESULT_HREF_RE = re.compile(r"historical_treasury_bond_results|RESULTS", re.I)
# These PDFs carry TWO sections: "A." the auction just held, and "B. FORTHCOMING
# TREASURY BOND(S) ISSUE(S)" naming NEXT month's bonds. The second dry-run
# proved we were reading across the boundary and attaching an auctioned coupon
# to a forthcoming bond. Everything at or below this line is not a result.
SECTION_B_RE = re.compile(r"\bFORTHCOMING\b|^\s*B\.\s", re.I)
# Issue codes appear as FXD1-2021-005 in filenames and FXD1/2021/5 in the page.
# The tenor may carry a fraction: CBK issued IFB1/2023/6.5 and IFB1/2024/8.5.
ISSUE_RE = re.compile(r"\b((?:FXD|IFB|SDB)\s?\d?)\s?[/-]\s?(\d{4})\s?[/-]\s?(\d{1,3}(?:\.\d)?)\b", re.I)
# CBK dates its result files four different ways across the archive:
#   DATED 15-11-2021 · DATED 21.09.2020 · DATED 19-7-2021 · DD 24.01.2022
# The first version of this pattern accepted only DD-MM-YYYY, which left 23 of
# 169 captured records with no auction date at all — invisible to the yield
# history, and a latent bug besides: the deduplication key is
# (issue code, auction date), so two undated auctions of the SAME bond would
# have silently collapsed into one. That had not happened yet. It would have.
DATE_IN_NAME_RE = re.compile(r"\b(\d{1,2})[-.](\d{1,2})[-.](\d{2,4})\b")

# Rows we care about, and how to recognise them whatever CBK's wording that year.
FIELDS = [
    ("couponRate", re.compile(r"coupon\s*rate", re.I)),
    ("weightedAverageRate", re.compile(r"weighted\s*average\s*(?:rate|yield)", re.I)),
    ("marketWeightedAverageRate", re.compile(r"market\s*weighted\s*average", re.I)),
    ("pricePer100", re.compile(r"price\s*per\s*(?:kshs?)?\s*100", re.I)),
    ("amountOfferedKESM", re.compile(r"amount\s*offered", re.I)),
    ("amountAcceptedKESM", re.compile(r"amount\s*accepted", re.I)),
    ("bidsReceivedKESM", re.compile(r"(?:total\s*)?bids?\s*received", re.I)),
]

# Plausible bands. A value outside these means we read the wrong cell, and a
# wrong coupon is worse than a missing one.
#
# The rate floor was 0.5 and let ten artefacts through, five of them exactly
# 1.0 — the signature of "11.000" losing its leading digit to CBK's split-digit
# rendering. One of those reached production: FXD1/2012/15 was published with a
# 1% coupon on a fifteen-year Kenyan government bond, which is not a number
# that exists.
#
# 6.0 is evidence, not instinct. Across 276 captured coupons and every clearing
# rate in the archive back to 2014, the lowest genuine figure is 7.78%; every
# value below 6 is a truncation artefact (1.0, 1.619, 1.855, 2.0, 2.5, 5.0 —
# that last one the bond's TENOR read as its coupon). The floor sits below the
# real minimum with room to spare and above every artefact.
RATE_FLOOR, RATE_CEILING = 6.0, 30.0
BANDS = {
    "couponRate": (RATE_FLOOR, RATE_CEILING),
    "weightedAverageRate": (RATE_FLOOR, RATE_CEILING),
    "marketWeightedAverageRate": (RATE_FLOOR, RATE_CEILING),
    "pricePer100": (40.0, 160.0),
}

NUMERIC_RE = re.compile(r"^-?[\d,]+(?:\.\d+)?$")


def normalise_code(family: str, year: str, tenor: str) -> str:
    """Canonical issue code from a regex match. Delegates the padding rules
    to common so the three files that need them cannot drift apart."""
    return normalise_issue_code(f"{family.replace(' ', '')}/{year}/{tenor}")


def group_lines(words: list, tolerance: float = 2.5) -> list:
    """Cluster words into visual lines by their vertical position."""
    lines = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        for line in lines:
            if abs(line[0]["top"] - w["top"]) <= tolerance:
                line.append(w)
                break
        else:
            lines.append([w])
    return [sorted(line, key=lambda w: w["x0"]) for line in lines]


def cell_value(fragments: list) -> str:
    """Join fragments that share a column.

    "1" + "1.277" -> "11.277". CBK's PDFs split digits inside a number, so
    joining WITHOUT a separator is the only reading that reproduces the page.
    """
    joined = "".join(f["text"] for f in fragments).replace(",", "").strip()
    return joined


# A fragment that could be part of a number. Anything else on a data row is
# label text, whichever side of the boundary it happened to land on.
VALUE_FRAGMENT_RE = re.compile(r"^[\d,]*\.?\d+$")


def assign_to_columns(line: list, centres: list, label_x: float) -> dict:
    """Map a line's numeric fragments onto the column each one sits under.

    Two filters, and the content one is what makes a cell trustworthy.

    `cell_value` joins fragments WITHOUT a separator, because that is the only
    way to put CBK's split digits back together — "1" + "3.9420" is 13.9420.
    The cost is that a stray label word joins just as silently. `label_x` is a
    positional guess, min(centres) - 40, and on narrow tables it is far too
    permissive: with column centres at 104 and 199 the boundary sits at 64, and
    a row reading "Weighted Average Rate of Accepted Bids (%) 13.9128" has
    label words to the right of it. Those were glued onto the digits, so the
    cell read "(%)13.9128", failed NUMERIC_RE and was dropped — every field,
    which is how a file whose header parsed perfectly returned nothing at all.

    Moving the boundary does NOT fix this, which is worth stating because it
    was the obvious thing to try. Deriving it from the header's own left edge
    instead of the magic 40 lands at or below 64 on these files — equally
    permissive. What settles it is asking whether a fragment could be part of a
    number before letting it into a cell.
    """
    buckets: dict = {i: [] for i in range(len(centres))}
    for w in line:
        mid = (w["x0"] + w["x1"]) / 2
        if mid < label_x:  # part of the row label, not a value
            continue
        if not VALUE_FRAGMENT_RE.match(w["text"]):
            continue  # label text that reached past the boundary
        nearest = min(range(len(centres)), key=lambda i: abs(centres[i] - mid))
        buckets[nearest].append(w)
    return {i: cell_value(frs) for i, frs in buckets.items() if frs}


def results_section(lines: list) -> list:
    """Drop everything from the 'FORTHCOMING ISSUES' heading downwards."""
    for i, line in enumerate(lines):
        if SECTION_B_RE.search(" ".join(w["text"] for w in line)):
            return lines[:i]
    return lines


def codes_on_line(line: list) -> tuple:
    """The issue codes on one visual line, with the x-centre of each.

    Matches against the JOINED line rather than word by word. The first dry-run
    matched each word separately and so found only one issue in PDFs whose
    filename named two — CBK splits a code like "FXD1/2019/20" across word
    boundaries often enough that per-word matching silently loses half the
    bonds. Under-extraction is quieter than a wrong number and just as wrong.
    """
    spans, pos, parts = [], 0, []
    for w in line:
        parts.append(w["text"])
        spans.append((pos, pos + len(w["text"]), w))
        pos += len(w["text"]) + 1  # the joining space
    text = " ".join(parts)

    codes, centres = [], []
    for m in ISSUE_RE.finditer(text):
        start, end = m.span()
        owners = [w for (ws, we, w) in spans if ws < end and we > start]
        if not owners:
            continue
        codes.append(normalise_code(*m.groups()))
        centres.append((min(o["x0"] for o in owners) + max(o["x1"] for o in owners)) / 2)
    return codes, centres


def header_candidates(lines: list, expected: list | None = None) -> list:
    """Every line that could be the column header, most promising first.

    There is usually more than one, and the obvious ranking picks the wrong
    one. These PDFs open with a TITLE that names every bond in prose —
    "FXD1/2022/03 & FXD1/2019/15 DATED 24/04/2023" — above a table whose header
    row may name only the bonds actually auctioned, e.g. "TENOR FXD1/2022/03"
    after the other leg was cancelled. Scoring by how many of the filename's
    bonds a line mentions therefore prefers the title, and the title's word
    positions are prose positions with no relationship to the table's columns.

    The live probe caught exactly that: geometry taken from the title put both
    bonds' figures into a single column, so the coupon cell read
    "15.03916.844" — two numbers glued together — and was rejected. Every field
    failed, and the file yielded nothing.

    So this returns candidates rather than a winner, and the caller keeps
    whichever one actually makes the table parse. Ties on score break toward
    the wider spread, because a real header row is laid out across the page
    while a prose title runs together.
    """
    scored = []
    for line in lines:
        codes, centres = codes_on_line(line)
        if not codes:
            continue
        score = len(set(codes) & set(expected or [])) if expected else 0
        spread = (max(centres) - min(centres)) if len(centres) > 1 else 0.0
        scored.append((score, spread, codes, centres))
    scored.sort(key=lambda t: (-t[0], -t[1]))
    return [(codes, centres) for _score, _spread, codes, centres in scored]


def find_header(lines: list, expected: list | None = None) -> tuple:
    """The single best header line. See header_candidates for the ranking."""
    candidates = header_candidates(lines, expected)
    return candidates[0] if candidates else ([], [])


def codes_in_name(url: str) -> list:
    """Issue codes named in the filename — the cross-check on what we found."""
    return [normalise_code(*m.groups()) for m in ISSUE_RE.finditer(url)]


def auction_date_from_name(url: str):
    """The auction date CBK put in the filename, or None if there isn't one.

    Takes the LAST plausible date in the string rather than the first. Issue
    codes are full of digits and separators (FXD1-2012-020) and they always
    precede the date, so reading from the right is what keeps a bond's tenor
    from being mistaken for the day it was sold.
    """
    best = None
    for m in DATE_IN_NAME_RE.finditer(url):
        d, mo, y = (int(g) for g in m.groups())
        # "28.12.20" is 2020. Two-digit years are unambiguous here: this archive
        # starts in 2019 and CBK is not publishing auctions from 1920.
        if y < 100:
            y += 2000
        if not (2000 <= y <= date.today().year + 1):
            continue
        try:
            best = datetime(y, mo, d).date().isoformat()
        except ValueError:
            continue  # 31-02, or a tenor that looked like a date
    return best


# How many candidate headers to try before giving up on a page. The real one
# has never been far down the ranking; this only bounds a pathological page.
MAX_HEADER_TRIES = 4


def _field_count(records: dict) -> int:
    """Numeric fields recovered under one candidate geometry."""
    return sum(len(r) - 5 for r in records.values())  # minus the identity keys


def _fit(records: dict, codes: list) -> tuple:
    """How well a candidate header explains the page. Higher is better.

    Column COVERAGE leads and field count only breaks ties, because counting
    fields alone is not merely weak — it is unsafe. On a real CBK file where
    one leg of a two-bond auction was cancelled, the prose title named both
    bonds while the table listed one. Both geometries recovered exactly one
    field, so a count could not choose between them; but the title's columns
    put that coupon under the CANCELLED bond. A wrong number attached to a real
    bond name is the worst thing this parser can produce, and far worse than
    reading nothing at all.

    Coverage separates them cleanly. The values fell into one of the title's
    two columns (0.5) and into the only column the true header declares (1.0).
    A header whose columns are real gets them filled.
    """
    if not codes:
        return (0.0, 0)
    return (len(records) / len(codes), _field_count(records))


def read_fields(lines: list, codes: list, centres: list,
                auction_date, source_url: str) -> dict:
    """Read every known field for one candidate column geometry."""
    # Values sit to the right of the row labels; anchor on the leftmost column
    # centre so label words are never mistaken for data.
    label_x = min(centres) - 40
    records: dict = {}
    for key, pattern in FIELDS:
        for line in lines:
            text = " ".join(w["text"] for w in line)
            if not pattern.search(text):
                continue
            for idx, raw in assign_to_columns(line, centres, label_x).items():
                if idx >= len(codes) or not NUMERIC_RE.match(raw):
                    continue
                value = float(raw)
                lo_hi = BANDS.get(key)
                if lo_hi and not (lo_hi[0] <= value <= lo_hi[1]):
                    print(f"[auctions] {codes[idx]} {key}={value} outside "
                          f"{lo_hi} — dropping", file=sys.stderr)
                    continue
                rec = records.setdefault(codes[idx], {
                    "id": f"res-{codes[idx].replace('/', '-').lower()}-{auction_date}",
                    "issueCode": codes[idx],
                    "auctionDate": auction_date,
                    "sourceUrl": source_url,
                    "parserVersion": PARSER_VERSION,
                })
                rec.setdefault(key, value)
            break
    return records


def parse_pdf(content: bytes, source_url: str) -> list:
    # Imported here, not at module scope, so the column-reconstruction logic
    # above stays importable and testable without a PDF stack present.
    import pdfplumber

    with pdfplumber.open(BytesIO(content)) as pdf:
        pages = [p.extract_words() or [] for p in pdf.pages]

    auction_date = auction_date_from_name(source_url)

    expected = codes_in_name(source_url)
    records: dict = {}
    for words in pages:
        if not words:
            continue
        lines = results_section(group_lines(words))
        # Try each plausible header and keep whichever actually makes the table
        # parse. Picking one up front and trusting it is how geometry from the
        # prose title got used for a table, collapsing both bonds into one
        # column. Counting the fields recovered is a direct measure of whether
        # a header explains the page, so it needs no heuristic about titles.
        best_page: dict = {}
        best_fit = (0.0, 0)
        for codes, centres in header_candidates(lines, expected)[:MAX_HEADER_TRIES]:
            attempt = read_fields(lines, codes, centres, auction_date, source_url)
            fit = _fit(attempt, codes)
            if fit > best_fit:
                best_page, best_fit = attempt, fit
        for code, rec in best_page.items():
            records.setdefault(code, {}).update(rec)

    # CBK names the issues in the filename, so we can check our own work. If
    # the header yielded fewer, we have silently dropped a bond — say so
    # rather than return a tidy-looking partial result.
    missing = [c for c in expected if c not in records]
    if missing:
        print(f"[auctions] {source_url[-58:]}: filename names {len(expected)} issue(s), "
              f"parsed {len(records)} — MISSING {missing}", file=sys.stderr)
    return list(records.values())


def find_result_pdfs() -> list:
    r = requests.get(LISTING, headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    seen, out = set(), []
    for a in soup.find_all("a", href=True):
        href = urljoin(LISTING, a["href"])
        if href.lower().endswith(".pdf") and RESULT_HREF_RE.search(href) and href not in seen:
            seen.add(href)
            out.append(href)
    return out


def load_existing() -> tuple:
    """Records already captured, and the set of PDFs they came from."""
    path = DATA_DIR / "auction-results.json"
    if not path.exists():
        return [], set()
    try:
        records = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[auctions] existing file unreadable ({exc.__class__.__name__}) — "
              f"starting fresh", file=sys.stderr)
        return [], set()
    fresh = [r for r in records if r.get("parserVersion") == PARSER_VERSION]
    stale = len(records) - len(fresh)
    if stale:
        print(f"[auctions] {stale} record(s) came from an older parser "
              f"(< v{PARSER_VERSION}) — discarding so their PDFs are read again",
              file=sys.stderr)
    fresh = repair_codes(repair_dates(fresh))
    return fresh, {r.get("sourceUrl") for r in fresh if r.get("sourceUrl")}


def repair_dates(records: list) -> list:
    """Fill in auction dates the parser could not read when it first ran.

    Incremental parsing has one cost that is easy to miss: a file is read once,
    so a LATER improvement to the parser never reaches records already
    captured. Widening the filename date pattern would otherwise have left 23
    existing records permanently undated — the archive would carry a bug that
    had already been fixed.

    This is safe to redo on every run precisely because it invents nothing: the
    date is recovered from the source URL we already stored, by the same
    function that would have read it at capture time. Nothing is re-downloaded
    and no record without a readable filename date is touched.
    """
    fixed = 0
    for rec in records:
        if rec.get("auctionDate") or not rec.get("sourceUrl"):
            continue
        recovered = auction_date_from_name(rec["sourceUrl"])
        if not recovered:
            continue
        rec["auctionDate"] = recovered
        rec["id"] = f"res-{rec['issueCode'].replace('/', '-').lower()}-{recovered}"
        fixed += 1
    if fixed:
        print(f"[auctions] recovered the auction date for {fixed} existing "
              f"record(s) from their filenames", file=sys.stderr)
    return records


def repair_codes(records: list) -> list:
    """Restore fractional tenors the old pattern truncated.

    Same shape of problem as repair_dates, same reason it is needed: a PDF is
    read once, so widening the issue-code pattern would never reach the records
    already captured under `IFB1/2023/006` — a bond that does not exist.

    The correction is not a guess. CBK names the issues in the filename, so a
    stored code is a truncation when the filename does NOT name it and names
    exactly one code that differs from it only by a fraction. Anything less
    clear-cut than that is left alone: a wrong issue code would attach one
    bond's coupon to another, which is worse than a missing bond.
    """
    fixed = 0
    for rec in records:
        url = rec.get("sourceUrl")
        if not url:
            continue
        named = codes_in_name(url)
        code = rec.get("issueCode")
        if not code or code in named:
            continue  # the filename confirms it; nothing to correct
        candidates = [c for c in named if "." in c and c.split(".")[0] == code]
        if len(candidates) != 1:
            continue  # ambiguous, or a different problem entirely
        rec["issueCode"] = candidates[0]
        rec["id"] = (f"res-{candidates[0].replace('/', '-').lower()}-"
                     f"{rec.get('auctionDate')}")
        fixed += 1
    if fixed:
        print(f"[auctions] restored the fractional tenor on {fixed} existing "
              f"record(s) from their filenames", file=sys.stderr)
    return records


def main() -> None:
    pdfs = find_result_pdfs()
    print(f"[auctions] {len(pdfs)} result PDF(s) linked from {LISTING}", file=sys.stderr)
    if not pdfs:
        print("[auctions] none found — the listing layout may have changed", file=sys.stderr)
        sys.exit(1)

    records, seen = load_existing()
    fresh = [u for u in pdfs if u not in seen]
    print(f"[auctions] {len(seen)} already parsed, {len(fresh)} new; "
          f"reading up to {MAX_NEW_PER_RUN} this run", file=sys.stderr)
    if not fresh:
        print("[auctions] archive fully parsed — nothing new", file=sys.stderr)

    deadline = time.monotonic() + TIME_BUDGET_SECONDS
    read = 0
    for url in fresh[:MAX_NEW_PER_RUN]:
        if time.monotonic() > deadline:
            print(f"[auctions] {TIME_BUDGET_SECONDS}s budget spent after {read} file(s) — "
                  f"stopping here; the next run resumes at the next unread file", file=sys.stderr)
            break
        try:
            resp = requests.get(url, headers=UA, timeout=TIMEOUT)
            resp.raise_for_status()
            got = parse_pdf(resp.content, url)
        except Exception as exc:  # noqa: BLE001 — one bad PDF must not lose the rest
            print(f"[auctions] {url[-60:]}: {exc.__class__.__name__}", file=sys.stderr)
            continue
        finally:
            read += 1
        print(f"[auctions] {url[-60:]}: {len(got)} issue(s)", file=sys.stderr)
        records.extend(got)

    # Deduplicate on the natural key. A PDF re-listed under a new URL must not
    # produce a second copy of the same auction.
    unique: dict = {}
    for r in records:
        unique[(r["issueCode"], r.get("auctionDate"))] = r

    final = sorted(unique.values(), key=lambda r: (r["auctionDate"] or "", r["issueCode"]))
    with_coupon = [r for r in final if "couponRate" in r]
    bonds = {r["issueCode"] for r in final}
    # Count what was actually read, not what we were allowed to read — the run
    # may have stopped on the clock well before the file cap.
    remaining = max(0, len(fresh) - read)
    print(f"[auctions] {len(final)} record(s) across {len(bonds)} bond(s), "
          f"{len(with_coupon)} with a coupon rate", file=sys.stderr)
    if remaining:
        print(f"[auctions] {remaining} PDF(s) still unread — the next run continues "
              f"where this one stopped", file=sys.stderr)
    write_dataset("auction-results", final)


if __name__ == "__main__":
    main()
