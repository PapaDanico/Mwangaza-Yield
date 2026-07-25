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
from urllib.parse import unquote, urljoin

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
PARSER_VERSION = 7

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
# Anchored on DIGIT boundaries, not word boundaries. `_` is a word
# character, so \b is silent beside it and DATED_21_03_2016 never matched
# however many separators the class accepted — widening [-.] to [-._]
# alone gained nothing, which is what sent us looking at the anchors.
DATE_IN_NAME_RE = re.compile(r"(?<!\d)(\d{1,2})[-._](\d{1,2})[-._](\d{2,4})(?!\d)")

# Some of the older files spell the month: "results 5 year dated november 25th
# 2013". That is a concrete date and can be read exactly — unlike the sixteen
# files carrying a month and a year with no day at all, which stay undated
# because writing the first of the month would put a day in the field that no
# document anywhere claims.
MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july",
               "august", "september", "october", "november", "december"]
# Full name, three-letter abbreviation, and "sept" — which is neither, and is
# how CBK writes September about as often as "Sep". Longest alternative first so
# "september" is not consumed as "sep" with a dangling "tember".
_MONTH_FORMS = sorted(
    {f for m in MONTH_NAMES for f in (m, m[:3])} | {"sept"}, key=len, reverse=True)
_MONTH_ALT = "|".join(_MONTH_FORMS)

# Month first. No guard is needed: a tenor never precedes its own month.
MONTH_DAY_YEAR_RE = re.compile(
    rf"({_MONTH_ALT})\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\s*,?\s*(\d{{4}})(?!\d)", re.I)

# Day first, and the lookbehind is the whole point. An issue code ends in its
# TENOR — FXD1-2019-15 — so "15 March 2021" in a filename may be a fifteen-year
# bond auctioned in March rather than an auction held on the 15th. Refusing a
# day that runs on from a digit or a separator costs one real date in the
# current archive ("fxd 4-2013-2 december 2013") and prevents a whole class of
# confident wrong answers. A missing date is visible; a wrong one is not.
DAY_MONTH_YEAR_RE = re.compile(
    rf"(?<![\d\-/])(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH_ALT})\.?\s*,?\s*(\d{{4}})(?!\d)", re.I)

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
#
# The lookahead is load-bearing. An earlier form required a digit AFTER the
# decimal point, which rejected "13." — and CBK splits numbers at arbitrary
# points, so "13." + "9128" is a real rendering of 13.9128. Dropping the first
# half left the cell reading "9128", silently, which is exactly the field loss
# this filter exists to prevent. Requiring only that a fragment contain SOME
# digit keeps both halves and still rejects "(%)", "Bids" and "Kshs.".
VALUE_FRAGMENT_RE = re.compile(r"^(?=[\d,.]*\d)[\d,]*\.?\d*$")


def label_word_positions(line: list, span: tuple) -> set:
    """Word positions covered by a field's label pattern on the joined line.

    `read_fields` joins a line with single spaces before testing the label
    pattern, so a character span maps back onto word positions exactly. Any word
    overlapping the label's own match is label text by definition, however
    numeric it happens to look.
    """
    start, end = span
    positions, cursor = set(), 0
    for pos, w in enumerate(line):
        w_start, w_end = cursor, cursor + len(w["text"])
        if w_start < end and w_end > start:
            positions.add(pos)
        cursor = w_end + 1  # the joining space
    return positions


def assign_to_columns(line: list, centres: list, label_x: float,
                      skip: set | None = None) -> dict:
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

    That content filter still cannot save us from a label that CONTAINS a
    number, because "100" is exactly as number-like as "97.583":

        Price per Kshs 100 at average yield 97.583

    Both words pass the filter, both sit right of the boundary, and cell_value
    glues them into 10097.583 — which the plausibility band then drops, losing a
    real figure to a guard meant for corrupt ones. No positional or content rule
    separates those two words. `skip` carries the answer from the one place that
    already knows it: the caller matched this row using the field's own label
    pattern, so it knows precisely which words the label occupied.
    """
    buckets: dict = {i: [] for i in range(len(centres))}
    for pos, w in enumerate(line):
        if skip and pos in skip:
            continue  # inside the matched label — the "100" in "per Kshs 100"
        mid = (w["x0"] + w["x1"]) / 2
        if mid < label_x:  # part of the row label, not a value
            continue
        if not VALUE_FRAGMENT_RE.match(w["text"]):
            continue  # label text that reached past the boundary
        nearest = min(range(len(centres)), key=lambda i: abs(centres[i] - mid))
        buckets[nearest].append(w)
    return {i: cell_value(frs) for i, frs in buckets.items() if frs}


# How close two x-centres must be to belong to the same column, when the header
# gives no spacing to scale from. Fragments of one number sit a few points
# apart; CBK's narrowest columns are about 80 apart.
DEFAULT_COLUMN_GAP = 40.0

# How far the total column may sit from the sum of the bond columns and still be
# called a total. Half a percent absorbs CBK's rounding without admitting a
# column that is merely the same order of magnitude.
TOTAL_TOLERANCE = 0.005

# How many rows must add up before the rightmost column is believed to be a
# total. One coincidence is cheap; two rows agreeing to within half a percent on
# figures in the tens of billions is not.
TOTAL_EVIDENCE_ROWS = 2


def _field_span(line: list):
    """The label span of the first field pattern this line matches, or None."""
    text = " ".join(w["text"] for w in line)
    for _key, pattern in FIELDS:
        m = pattern.search(text)
        if m:
            return m.span()
    return None


def value_columns(lines: list, centres: list, label_x: float) -> list:
    """The table's value columns, measured from the VALUES rather than the header.

    The header fixes the columns by where the issue codes sit, which is close
    but not the same thing: codes are centred text and figures are right
    aligned, so on CBK's layouts the values sit some 35 points right of the code
    above them. Nearest-centre assignment absorbs that — until the table has a
    column the header never names.

    It usually does. The rightmost column of a multi-bond results table is the
    auction TOTAL, and the header lists only the bonds:

        header                        FXD3/2019/015      FXD1/2018/025
        centres                            285.5             399.1
        Amount Accepted (Kshs. M)      54,786.72         45,748.83     100,535.55
        x-centres                          321.2             433.8         518.4

    With two centres the total has nowhere of its own to go. It falls to the
    nearest, which is the second bond's, and `cell_value` joins it to the figure
    already there — "45748.83100535.55" — which then fails NUMERIC_RE and is
    dropped. The second bond of every multi-bond auction lost its accepted
    amount and its bids this way, and lost them silently: the first bond parsed
    perfectly, so the file looked read.

    Clustering the value positions finds three columns where the header knew of
    two, which is what lets the caller recognise a total and set it aside. The
    split threshold scales off the header's own spacing, because the fragments
    of one split number ("1" + "3.9420") are a few points apart while columns
    are tens of points apart, and how many tens differs by layout.
    """
    xs = []
    for line in lines:
        span = _field_span(line)
        if span is None:
            continue
        skip = label_word_positions(line, span)
        for pos, w in enumerate(line):
            if pos in skip:
                continue
            mid = (w["x0"] + w["x1"]) / 2
            if mid >= label_x and VALUE_FRAGMENT_RE.match(w["text"]):
                xs.append(mid)
    if not xs:
        return []

    ordered = sorted(centres)
    gaps = [b - a for a, b in zip(ordered, ordered[1:])]
    min_gap = max(20.0, 0.4 * min(gaps)) if gaps else DEFAULT_COLUMN_GAP

    xs.sort()
    groups = [[xs[0]]]
    for x in xs[1:]:
        if x - groups[-1][-1] > min_gap:
            groups.append([])
        groups[-1].append(x)
    return [sum(g) / len(g) for g in groups]


def totals_confirmed(lines: list, cols: list, label_x: float) -> bool:
    """Whether the rightmost column really is the sum of the ones before it.

    An extra column is not evidence of a total by itself — it could be a bond
    the header failed to name, in which case discarding it would throw away real
    figures. So this asks the document: on rows where every column carries a
    number, does the last equal the others added up?

    Requiring TOTAL_EVIDENCE_ROWS such rows rather than one is what keeps a
    coincidence from being read as structure. Rows that do NOT add up are simply
    not evidence, and do not veto: a rate row's rightmost cell may be an
    aggregate weighted average, which is a total in CBK's sense and not a sum.
    """
    agreeing = 0
    for line in lines:
        span = _field_span(line)
        if span is None:
            continue
        cells = assign_to_columns(line, cols, label_x, label_word_positions(line, span))
        if len(cells) != len(cols):
            continue
        if not all(NUMERIC_RE.match(v) for v in cells.values()):
            continue
        values = [float(cells[i]) for i in range(len(cols))]
        total, parts = values[-1], values[:-1]
        if total and abs(total - sum(parts)) <= TOTAL_TOLERANCE * abs(total):
            agreeing += 1
    return agreeing >= TOTAL_EVIDENCE_ROWS


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


def code_density(line: list) -> float:
    """Share of a line's characters that belong to an issue code.

    The tie-break between candidate headers, and it exists because a SENTENCE
    beat a table header. One file reads:

        The auction statistics are summarised in the table below.
        The auction for FXD 1/2019/15 was cancelled.

    That prose names a code, so it scored as a header, its figures happened to
    land in its one column, and it tied with the real "TENOR FXD1/2022/03" row.
    The tie went to whichever came first, and the file's entire results were
    published under FXD1/2019/15 — the leg the sentence says was CANCELLED.

    Density separates them without any rule about wording: a header row is
    almost entirely codes and a short label (0.67-0.79 across CBK's layouts),
    a prose sentence is mostly words (0.13), and the document title sits
    between (~0.55) because it carries "AND" and "DATED <date>".
    """
    text = " ".join(w["text"] for w in line)
    if not text:
        return 0.0
    coded = sum(m.end() - m.start() for m in ISSUE_RE.finditer(text))
    return coded / len(text)


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
        scored.append((score, code_density(line), codes, centres))
    scored.sort(key=lambda t: (-t[0], -t[1]))
    return [(codes, centres, density) for _score, density, codes, centres in scored]


def find_header(lines: list, expected: list | None = None) -> tuple:
    """The single best header line. See header_candidates for the ranking."""
    candidates = header_candidates(lines, expected)
    return (candidates[0][0], candidates[0][1]) if candidates else ([], [])


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
    # Decode first. CBK's older filenames carry spaces, so the listing's hrefs
    # arrive percent-encoded, and %20 puts a DIGIT immediately before the date:
    #
    #     results%20fxd1-2014-5%20dated%2028.04.2014.pdf
    #                                      ^^ the 0 of %20
    #
    # The pattern refuses a date that runs on from a digit — that guard is what
    # keeps a tenor like FXD1-2012-020 from being read as one — so "28.04.2014"
    # was rejected for being preceded by an encoding artefact rather than by
    # anything in the name. Four files lost a full, exact, unambiguous date this
    # way and became undated records, invisible to the year tables and sharing a
    # deduplication key with every other undated auction of the same bond.
    name = unquote(url)

    # Every candidate from every shape, kept with its position so that "last
    # wins" still means last in the STRING and not last pattern to be tried.
    candidates = []
    for m in DATE_IN_NAME_RE.finditer(name):
        d, mo, y = (int(g) for g in m.groups())
        candidates.append((m.start(), d, mo, y))
    for pattern, order in ((MONTH_DAY_YEAR_RE, "mdy"), (DAY_MONTH_YEAR_RE, "dmy")):
        for m in pattern.finditer(name):
            month_word, day = (m.group(1), m.group(2)) if order == "mdy" \
                else (m.group(2), m.group(1))
            mo = MONTH_NAMES.index(
                next(n for n in MONTH_NAMES if n.startswith(month_word[:3].lower()))) + 1
            candidates.append((m.start(), int(day), mo, int(m.group(3))))

    for _pos, d, mo, y in sorted(candidates):
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


FIELD_KEYS = {key for key, _pattern in FIELDS}


def _field_count(records: dict) -> int:
    """Numeric fields recovered under one candidate geometry.

    Counts the fields by name rather than subtracting a fixed number of identity
    keys. The subtraction was already off by one wherever `bidsLabel` was
    recorded, and `offeredScope` would have made it off by two — so a geometry
    that happened to read a bids row scored a free point against one that read a
    coupon, for no reason connected to how well it explained the page.
    """
    return sum(len(FIELD_KEYS & set(r)) for r in records.values())


def _fit(records: dict, codes: list, density: float) -> tuple:
    """How well a candidate header explains the page. Higher is better.

    Ranked by how many BONDS were priced, then how many fields, then how much
    of the line is issue code.

    The ratio this used to lead with — bonds priced divided by bonds named —
    was a trap, and a review caught it before it shipped. Dividing rewards
    naming fewer bonds, so a prose line mentioning one code beat the real
    header listing two whenever only one leg of an auction cleared:

        real header  TENOR FXD1/2022/03 FXD1/2019/15   1 of 2 = 0.50
        prose        "...FXD 1/2019/15 was cancelled"  1 of 1 = 1.00

    The prose won and the coupon landed on the CANCELLED bond — precisely the
    failure the ratio had been introduced to prevent, reintroduced in the
    variant where CBK keeps both legs in the header. The first fix and its test
    only covered the variant where the cancelled leg is omitted.

    Counting bonds priced makes those two tie at 1, and density then decides:
    a header row is almost entirely codes (0.67-0.79), a prose sentence is
    mostly words (0.13). Both known cases resolve to the real header, and
    nothing is rewarded for naming less.
    """
    return (len(records), _field_count(records), density)


def read_fields(lines: list, codes: list, centres: list,
                auction_date, source_url: str) -> dict:
    """Read every known field for one candidate column geometry."""
    # Values sit to the right of the row labels; anchor on the leftmost column
    # centre so label words are never mistaken for data. Computed from the
    # HEADER's leftmost column and not recomputed below, because the measured
    # value columns all sit right of it by construction — deriving the boundary
    # from them would let it drift rightwards over the labels it exists to
    # exclude.
    label_x = min(centres) - 40

    # Prefer the geometry the values themselves show, and only where it is
    # legible: exactly one column per bond, or one per bond plus a total the
    # document confirms by arithmetic. Anything else and the header's geometry
    # stands, which is the behaviour every file has had until now.
    measured = value_columns(lines, centres, label_x)
    total_idx = None
    if len(measured) == len(codes):
        centres = measured
    elif len(measured) == len(codes) + 1 and totals_confirmed(lines, measured, label_x):
        centres, total_idx = measured, len(measured) - 1

    records: dict = {}
    totals: dict = {}
    for key, pattern in FIELDS:
        for line in lines:
            text = " ".join(w["text"] for w in line)
            match = pattern.search(text)
            if not match:
                continue
            for idx, raw in assign_to_columns(
                line, centres, label_x, label_word_positions(line, match.span())
            ).items():
                if not NUMERIC_RE.match(raw):
                    continue
                value = float(raw)
                lo_hi = BANDS.get(key)
                if lo_hi and not (lo_hi[0] <= value <= lo_hi[1]):
                    who = codes[idx] if idx < len(codes) else "auction total"
                    print(f"[auctions] {who} {key}={value} outside "
                          f"{lo_hi} — dropping", file=sys.stderr)
                    continue
                if idx == total_idx:
                    totals[key] = value
                    continue
                if idx >= len(codes):
                    continue
                rec = records.setdefault(codes[idx], {
                    "id": f"res-{codes[idx].replace('/', '-').lower()}-{auction_date}",
                    "issueCode": codes[idx],
                    "auctionDate": auction_date,
                    "sourceUrl": source_url,
                    "parserVersion": PARSER_VERSION,
                })
                rec.setdefault(key, value)
                # Keep the words CBK actually used for the bids row.
                #
                # The pattern accepts "Total Bids Received" and "Bids Received"
                # as one field, which discards the only clue to what the number
                # covers. That matters: across the archive's multi-bond auctions
                # a lone bids figure divides into the amount offered at a normal
                # cover ratio 23 times out of 32 — reading as the whole
                # auction — while five auctions carry plainly different figures
                # per bond. Both forms exist in CBK's documents.
                #
                # Which reading "Total" signals is not settled here, and
                # guessing is how the withdrawn auction note came to report
                # oversubscribed auctions as undersubscribed. Recording the
                # label lets the answer be measured from accumulated data
                # instead of assumed.
                if key == "bidsReceivedKESM":
                    rec.setdefault("bidsLabel", " ".join(match.group(0).split()).lower())
            break

    # One field, and one only, may be taken from the total column.
    #
    # CBK advertises a single amount for an auction however many bonds it
    # covers, and on these layouts it is printed once — in the total column,
    # with the bond columns on that row left empty. The published record settles
    # that it is auction-wide: February's two legs were reported at 267.59% and
    # 159.89% performance, and both only reconcile against the SAME 50bn.
    #
    # Nothing else comes from there. Accepted amounts and bids are per bond —
    # the same reporting has the legs summing to the auction's total — so
    # spreading a total across bonds would manufacture figures. Reading a
    # partial numerator against a whole denominator is precisely what produced a
    # published claim that Kenyan auctions run undersubscribed when the record
    # says the opposite, and the rule that prevents a repeat is narrow by
    # design: a total is an auction fact only where a source outside this
    # repository says so.
    #
    # A per-bond figure always wins. If a bond's own column carried an offered
    # amount, the total is not consulted for it.
    offered = totals.get("amountOfferedKESM")
    if offered is not None:
        for rec in records.values():
            if not rec.get("amountOfferedKESM"):
                rec["amountOfferedKESM"] = offered
                rec["offeredScope"] = "auction"
    return records


def merge_page(records: dict, page: dict) -> dict:
    """Fold one page's records into the document's, first reading winning.

    The results table sits on the earliest page that has one; later pages repeat
    the issue in summaries, cash-flow schedules and footers, where a stray
    number can land in the same column. Merging with `.update()` gave those the
    LAST word — the weakest reading of a bond silently overwriting the table it
    was summarising. A later page may only fill a field that is still missing.
    """
    for code, rec in page.items():
        held = records.setdefault(code, {})
        for field, value in rec.items():
            held.setdefault(field, value)
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
        best_fit = (0, 0, -1.0)
        for codes, centres, density in header_candidates(lines, expected)[:MAX_HEADER_TRIES]:
            attempt = read_fields(lines, codes, centres, auction_date, source_url)
            fit = _fit(attempt, codes, density)
            if fit > best_fit:
                best_page, best_fit = attempt, fit
        merge_page(records, best_page)

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




def attribute_auction_level(records: list) -> tuple:
    """Give every bond in an auction the auction's own offered amount.

    CBK advertises ONE amount for an auction, however many bonds it covers.
    The table prints it once, so the column-assignment step hands it to
    whichever bond it happens to sit above and the other bonds in the same
    auction are left with nothing. That is not a gap in the data — the figure
    was read, it just landed on one row — and it accounted for most of the
    apparent incompleteness of this field: 59 of 130 records carried it while
    57 of 76 AUCTIONS had it available.

    So it is copied across the auction and marked `offeredScope: "auction"`,
    which is the important half. A reader who sums this column across a
    three-bond auction gets three times the government's borrowing target, and
    a silent copy would make that mistake easier rather than harder. The flag
    says, in the data itself, that these are not three facts but one.

    Never applied where an auction's rows disagree: one auction in the archive
    carries two different offered figures, and guessing which is the auction
    total would be inventing an answer.
    """
    by_auction: dict = {}
    for r in records:
        key = r.get("auctionDate")
        if key:
            by_auction.setdefault(key, []).append(r)

    filled = 0
    for rows in by_auction.values():
        values = {r["amountOfferedKESM"] for r in rows if r.get("amountOfferedKESM")}
        if len(values) != 1:
            continue  # nothing to copy, or the rows disagree — leave both alone
        total = values.pop()
        for r in rows:
            if not r.get("amountOfferedKESM"):
                r["amountOfferedKESM"] = total
                filled += 1
            r["offeredScope"] = "auction"
    return records, filled


def load_existing() -> tuple:
    """Every record already captured, and the PDFs that need no re-reading.

    A PARSER_VERSION bump means older records may be wrong, so their PDFs must
    be read again. It does NOT mean those records should be thrown away first.

    They used to be. Bumping to v5 discarded all 350 records up front, and
    because a run reads at most MAX_NEW_PER_RUN files within a time budget, the
    published archive fell to 130 — a 63% cut — and stayed there until several
    more runs refilled it. For hours the site served a fraction of its own data,
    and anything computed from it (coverage figures above all) described a
    half-finished rebuild rather than the archive.

    An asset that can shrink by two thirds without warning is not one anybody
    should build on, so now the old records stay and are REPLACED as each PDF is
    re-read. A stale record is superseded the moment its document is parsed
    again, and until then it is the best answer we have. The archive only ever
    improves, and a rebuild in progress is invisible to readers.

    Returns (records, seen) where `seen` holds only URLs whose every record is
    already at the current version — so stale documents queue for re-reading
    while their old rows keep serving.
    """
    path = DATA_DIR / "auction-results.json"
    if not path.exists():
        return [], set()
    try:
        records = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[auctions] existing file unreadable ({exc.__class__.__name__}) — "
              f"starting fresh", file=sys.stderr)
        return [], set()

    current, stale_urls = set(), set()
    for r in records:
        url = r.get("sourceUrl")
        if not url:
            continue
        (current if r.get("parserVersion") == PARSER_VERSION else stale_urls).add(url)

    n_stale = sum(1 for r in records if r.get("parserVersion") != PARSER_VERSION)
    if n_stale:
        print(f"[auctions] {n_stale} record(s) came from an older parser "
              f"(< v{PARSER_VERSION}) — keeping them and re-reading their "
              f"{len(stale_urls)} PDF(s); each is replaced as it is read",
              file=sys.stderr)

    records = repair_codes(repair_dates(records))
    # A URL with any stale record must be re-read, even if other rows from the
    # same document are already current.
    return records, current - stale_urls


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
    reparsed: set = set()
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
        if got:
            reparsed.add(url)
        records.extend(got)

    # A document that has just been read again supersedes what it produced
    # before. Dropping its old rows here is what stops a superseded record
    # outliving the parse that replaced it: if the new parser no longer emits a
    # code it used to, keeping the old row would preserve exactly the reading
    # the version bump was meant to correct.
    #
    # Only for documents actually re-read this run. Everything else keeps its
    # existing rows, which is the whole point — the archive never shrinks while
    # a rebuild is in progress.
    superseded = 0
    if reparsed:
        kept = []
        for r in records:
            if (r.get("sourceUrl") in reparsed
                    and r.get("parserVersion") != PARSER_VERSION):
                superseded += 1
                continue
            kept.append(r)
        records = kept

    # Deduplicate on the natural key. A PDF re-listed under a new URL must not
    # produce a second copy of the same auction. Later wins, and newly parsed
    # records are appended after the existing ones, so a re-read always beats
    # the copy it replaces.
    unique: dict = {}
    for r in records:
        unique[(r["issueCode"], r.get("auctionDate"))] = r

    final = sorted(unique.values(), key=lambda r: (r.get("auctionDate") or "", r["issueCode"]))
    final, filled = attribute_auction_level(final)
    if filled:
        print(f"[auctions] {filled} record(s) given their auction's offered amount "
              f"(marked offeredScope=auction — do not sum across a single auction)",
              file=sys.stderr)
    with_coupon = [r for r in final if "couponRate" in r]
    bonds = {r["issueCode"] for r in final}
    # Count what was actually read, not what we were allowed to read — the run
    # may have stopped on the clock well before the file cap.
    remaining = max(0, len(fresh) - read)
    at_current = sum(1 for r in final if r.get("parserVersion") == PARSER_VERSION)
    print(f"[auctions] {len(final)} record(s) across {len(bonds)} bond(s), "
          f"{len(with_coupon)} with a coupon rate, "
          f"{at_current} at parser v{PARSER_VERSION}", file=sys.stderr)
    if superseded:
        print(f"[auctions] {superseded} superseded record(s) replaced by a re-read",
              file=sys.stderr)
    if len(final) < len(records) - len(reparsed):
        print("[auctions] WARNING: the archive shrank this run — that should not "
              "happen and is worth investigating", file=sys.stderr)
    if remaining:
        print(f"[auctions] {remaining} PDF(s) still unread — the next run continues "
              f"where this one stopped", file=sys.stderr)
    write_dataset("auction-results", final)


if __name__ == "__main__":
    main()
