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
#
# RAISED FROM 120, because a count that bounds nothing still delays everything.
# TIME_BUDGET_SECONDS below is the real limit and says so in its own comment —
# "a count is not a time bound" — which leaves this cap doing no safety work
# while capping how fast a parser FIX reaches the archive.
#
# That is not theoretical. A version bump makes every file stale at once, so
# the run works newest-first through all of them; at 120 a bump took three days
# to propagate. The column-shift fix went out with 8 records carrying wrong
# published bids, the newest 120 files were re-read in FIFTY-TWO SECONDS
# against a 600-second budget, and the four 2017 files holding those wrong
# figures were not in the slice — so they stayed wrong and stayed live, waiting
# on a cap that existed to bound a runtime the budget already bounds.
#
# Raising it costs nothing that stopping early does not already cover: the
# budget still ends a slow run, whatever was read is kept, and the next run
# resumes at the next unread file. What it buys is that a fix for a wrong
# number reaches every record it corrects in the same run that ships it.
MAX_NEW_PER_RUN = int(os.environ.get("AUCTION_MAX_FILES", "500"))

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
# v14: the accepted-bids exclusion. Until this bump the fix in the code could
# not reach the 244 stored records that hold the market rate in both fields —
# the parser was correct and the archive was still wrong, which is the exact
# failure this constant exists to prevent and which I nearly walked past.
PARSER_VERSION = 14

RESULT_HREF_RE = re.compile(r"historical_treasury_bond_results|RESULTS", re.I)
# These PDFs carry TWO sections: "A." the auction just held, and "B. FORTHCOMING
# TREASURY BOND(S) ISSUE(S)" naming NEXT month's bonds. The second dry-run
# proved we were reading across the boundary and attaching an auctioned coupon
# to a forthcoming bond. Everything at or below this line is not a result.
SECTION_B_RE = re.compile(r"\bFORTHCOMING\b|^\s*B\.\s", re.I)
# Issue codes appear as FXD1-2021-005 in filenames and FXD1/2021/5 in the page.
# The tenor may carry a fraction: CBK issued IFB1/2023/6.5 and IFB1/2024/8.5.
#
# NOT `\b`, and this is the THIRD time that distinction has cost this project
# real data. `_` is a WORD character, so `\b` does not fire between it and a
# letter — and CBK prefixes almost every filename with an upload id and an
# underscore:
#
#     2010223716_FXD2-2014-5 AND FXD3-2013-5 DATED 27-03-2017.pdf
#                ^ no word boundary here, so the FIRST bond was invisible
#
# The consequence was quiet and specific. `codes_in_name` feeds `find_header`
# the codes it should expect to find, so on every "A AND B" filename the hint
# named only B. For 27-03-2017 that left the parser looking for one bond in a
# two-bond table; it settled on a single-column header and recorded the
# unlabelled auction total, 64,248.40, as FXD3/2013/005's bids. The bond that
# should have carried 31,331.63 was dropped entirely.
#
# Measured before changing: across every filename in the archive this gains 21
# issue codes and loses none.
#
# The same guard replaces the trailing `\b` for symmetry — a code followed by an
# underscore has the identical problem, and "RE-OPEN_FXD1-2013-10__FXD2-2013-15"
# is a real filename in this archive that hits both ends at once.
ISSUE_RE = re.compile(
    r"(?<![A-Za-z0-9])((?:FXD|IFB|SDB)\s?\d?)\s?[/-]\s?(\d{4})\s?[/-]\s?"
    r"(\d{1,3}(?:\.\d)?)(?![A-Za-z0-9])", re.I)
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
#
# A TAP SALE states the same six facts under entirely different labels, and that
# — not a missing figure — is why every one of the archive's 41 tap-sale records
# was incomplete. Not one of them scored above zero, and the reason was never
# that CBK withheld anything:
#
#     Total Advertised Amount (Kes Million)         9,720.00   amount offered
#     Total Bids Accepted at Cost (Kes Million)     9,750.51   amount accepted
#     Adjusted Average Price(Per Kes 100.00)         100.215   price per 100
#     Allocated average rate for accepted bids (%)   11.492%   weighted avg rate
#
# The parser found the file, found the columns, and walked past five of six rows
# looking for words that a tap sale does not use.
FIELDS = [
    ("couponRate", re.compile(r"coupon\s*rate", re.I)),
    ("weightedAverageRate",
     re.compile(r"weighted\s*average\s*(?:rate|yield)|allocated\s*average\s*rate", re.I)),
    ("marketWeightedAverageRate", re.compile(r"market\s*weighted\s*average", re.I)),
    # "Price per Kshs 100 at average yield" and "Adjusted Average
    # Price(Per KES 100.00)" — the bracket sits where the space used to.
    ("pricePer100", re.compile(r"price\s*\(?\s*per\s*(?:kes|kshs?\.?)?\s*100", re.I)),
    ("amountOfferedKESM", re.compile(r"amount\s*offered|advertised\s*amount", re.I)),
    # "Amount Accepted", "Total Amount Accepted at cost", "Total Bids Accepted
    # at Cost" — all the same fact.
    ("amountAcceptedKESM", re.compile(r"(?:amount|bids?)\s*accepted", re.I)),
    ("bidsReceivedKESM", re.compile(r"(?:total\s*)?bids?\s*received", re.I)),
]

# Lines that match a field's label and must still be refused, because they state
# a DIFFERENT quantity in nearly the same words. Both of these are real rows
# sitting directly above the one we want, in the same tap-sale tables:
#
#     Total bids Received in Face Value (Kshs. M)   5,838.75   <- not at cost
#     Total Number of Bids Received                      273   <- a COUNT
#
# Without this the second reads as 273 million shillings of demand, and the
# first as a fifth more money than was actually bid. Neither is a rounding
# error; both are a different column entirely.
#
# The third is the one that had gone unnoticed longest, because it produced a
# number that was plausible, in range, and wrong:
#
#     Market Weighted Average Rate (%)             13.839   <- across ALL bids
#     Weighted Average Rate of Accepted Bids (%)   13.471   <- what buyers got
#
# "Market Weighted Average Rate" CONTAINS "Weighted Average Rate", so the
# weightedAverageRate pattern matched the market row, and it is listed first.
# Both fields ended up holding the market figure — identical in all 244 records
# that carry both, which is not something a market does.
#
# The consequence reached the reader. clearingRate() returns weightedAverageRate
# and the app calls it the rate buyers received; it was the average across every
# bid including the rejected ones, which sits higher. 37 basis points apart on
# the auction above. That figure feeds the yield histories, the bid assistant
# and the public prediction ledger.
FIELD_EXCLUSIONS = {
    "bidsReceivedKESM": re.compile(r"number\s*of\s*bids", re.I),
    "amountAcceptedKESM": re.compile(r"number\s*of\s*bids", re.I),
    "weightedAverageRate": re.compile(r"market\s*weighted", re.I),
}

# Rows to reach for FIRST when a document offers more than one that fits.
#
# A tap sale states its bids twice, in two different currencies of meaning:
#
#     Total bids Received in Face Value (Kshs. M)   5,838.75
#     Total bids Received at Cost (Kshs. M)         4,822.69
#
# Both are real; they are 21% apart on a discount bond. "At cost" is the money
# actually put up, it is what every primary auction reports, and it is what a
# bid-to-cover ratio needs — so it wins wherever it exists.
#
# Face value is NOT excluded, and that distinction was learned the expensive
# way. Excluding it outright removed the only bids row from 32 tap records that
# had one, in a change that shipped. Where a document offers face value alone,
# recording it beats recording nothing — and `bidsLabel` already stores the
# wording CBK used, so a reader can see which of the two they have rather than
# being told they are the same thing.
FIELD_PREFERENCE = {
    "bidsReceivedKESM": re.compile(r"at\s*cost", re.I),
}

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
    # The trailing per-cent sign goes with the comma. Tap sales print their rates
    # as "11.492%" where a primary auction prints "11.492", and a cell that keeps
    # the sign fails NUMERIC_RE and is dropped — silently, after being read
    # correctly. Every coupon and every clearing rate in the tap-sale files was
    # lost this way.
    joined = "".join(f["text"] for f in fragments).replace(",", "").replace("%", "").strip()
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
#
# A trailing "%" is allowed for the same reason it is stripped in cell_value: a
# tap sale writes "11.492%" where a primary auction writes "11.492", and the
# fragment is otherwise identical.
VALUE_FRAGMENT_RE = re.compile(r"^(?=[\d,.]*\d)[\d,]*\.?\d*%?$")


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


def value_start_x(line: list, skip: set | None = None) -> float | None:
    """Where this row's values begin — measured on the row, not on the header.

    THE BUG THIS EXISTS TO FIX
    --------------------------
    `label_x` was one number for the whole page: min(header centres) - 40. That
    assumes the issue codes in the header sit LEFT of the figures beneath them.
    On four files in the archive they do not, and the consequence is not a
    missing value but a wrong one:

        Total bids Received (Kshs. M)   31,331.63   32,916.78   64,248.41

    The first figure fell left of the page-wide boundary and was discarded, so
    only two columns were measured where three exist. Two columns matched two
    issue codes exactly, the geometry was accepted as correct, and every bond
    took its neighbour's number — the last one taking the auction total:

        FXD2/2014/005   recorded 32,916.78   (the other bond's bids)
        FXD3/2013/005   recorded 64,248.40   (the auction total)

    31,331.63 + 32,916.78 = 64,248.41. The same identity holds for three more
    files. Nothing in the data contradicted it: two bonds, two plausible
    figures, a total that never appeared. It was found only because the row
    label had accidentally kept the discarded number.

    WHY PER LINE
    ------------
    Where the label ends is a fact about the ROW. A row reads LABEL then VALUES,
    so the boundary is the first word that could be a figure and is not inside
    the label's own matched span. That cannot be pushed right by a header whose
    codes happen to be indented, because it never looks at the header.

    Scanned from the RIGHT, as a trailing run. Taking the first value-looking
    word from the left would take the "100" out of "Price per Kshs 100 at
    average yield 100.000 97.632" and admit it as a figure — the exact hazard
    the page-wide boundary was introduced to prevent. Values in a row are the
    words AFTER the last word, so the run that ends the line is the run that
    matters:

        Price per Kshs 100 at average yield  100.000  97.632
                                             ^ run starts here, after "yield"
        Total bids Received (Kshs. M)  31,331.63  32,916.78  64,248.41
                                       ^ run starts here, after "M)"

    That holds without help from `skip`, so the boundary is safe even where a
    caller has none to give.

    Returns None when the line does not end in values at all, and the caller
    keeps its existing boundary — nothing to protect means nothing to move.

    A word inside the label's own matched span ends the run too. Where a label
    finishes on a number with nothing between it and the figures —
    "Price per Kshs 100 100.000" — no amount of scanning separates them, and
    `skip` is the caller's knowledge of which words its pattern consumed. That
    is the same reasoning assign_to_columns already relies on.
    """
    start = None
    for pos in range(len(line) - 1, -1, -1):
        w = line[pos]
        if skip and pos in skip:
            break
        if VALUE_FRAGMENT_RE.match(w["text"]):
            start = w
        elif any(c.isalpha() for c in w["text"]):
            break
    return None if start is None else start["x0"] - 1


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
    # The row's own boundary wins where it sits further LEFT than the page-wide
    # one, and only then. Moving left can admit a label word, which the content
    # filter and `skip` below already handle; leaving the page-wide boundary in
    # place where it is looser costs nothing. Moving RIGHT is what discarded a
    # whole value column on four files, so it is never allowed.
    own = value_start_x(line, skip)
    if own is not None:
        label_x = min(label_x, own)

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
        # Same per-row boundary as assign_to_columns, for the same reason: a
        # column measured here is a column a value can land in, and a column
        # missed here is one that silently shifts every bond's figure.
        own = value_start_x(line, skip)
        bound = min(label_x, own) if own is not None else label_x
        for pos, w in enumerate(line):
            if pos in skip:
                continue
            mid = (w["x0"] + w["x1"]) / 2
            if mid >= bound and VALUE_FRAGMENT_RE.match(w["text"]):
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


def _looks_like_row(line: list) -> bool:
    """Whether a line is a table ROW rather than a sentence that mentions one.

    A row ends with its value. A sentence keeps talking:

        Total Advertised Amount (Kes Million) 9,720.00          <- row
        Total bids Received at Cost (Kshs. M) 13,463.75         <- row
        the number of bids received was 877 amounting to
            kshs 30.5 billion                                   <- sentence
        below. All the 64 bids received were accepted and
            fully allotted.                                     <- sentence

    An earlier version asked instead how far into the line the LABEL began, on
    the theory that a row starts with its own name. That is true of the row and
    false of the regex: the bids pattern consumes "Total bids Received" from
    position 0, but the offered pattern matches only "Advertised Amount" and so
    starts at six, and the price pattern starts at eighteen inside "Adjusted
    Average Price(Per KES 100.00)". Real rows were being filed as prose and
    survived only because prose was still being read. The moment prose was
    dropped, five fields went with it.

    Where the label starts depends on how the pattern happens to be written.
    Where the values sit is a fact about the document, so that is what this
    asks.
    """
    last_value = last_word = -1
    for i, w in enumerate(line):
        text = w["text"]
        if VALUE_FRAGMENT_RE.match(text):
            last_value = i
        elif any(c.isalpha() for c in text):
            last_word = i
    return last_value > last_word


def _row_label(line: list, label_x: float) -> str:
    """A row's label — every word before its first value.

    Recorded so that a reading can be judged later rather than trusted now. Two
    rows can satisfy the same pattern and mean different things, and the only
    thing that separates them is the wording CBK chose:

        total bids received in face value (kshs. m)
        total bids received at cost (kshs. m)

    Stops at the first word that could be a figure, so the label never carries
    the number it labels. The stop does NOT depend on `label_x`: a narrow table
    puts that boundary well to the right, and twelve labels in the archive
    swallowed their own value because of it — "total bids received (kshs. m)
    31,331.63". Position decides what is a VALUE; it has no business deciding
    where a label ends.

    Only used for the bids row, where no legitimate label contains a bare
    number. "Price per Kshs 100" would truncate at the 100, which is why this
    is not applied to every field.
    """
    out = []
    for w in line:
        if VALUE_FRAGMENT_RE.match(w["text"]):
            break
        out.append(w["text"])
    return " ".join(" ".join(out).split()).lower()


def _field_lines(lines: list, key: str, pattern) -> list:
    """Candidate lines for one field, table rows first, prose last.

    A field's label can appear in a SENTENCE as easily as in a table, and CBK's
    tap-sale files open with a paragraph that does exactly that:

        The Central Bank of Kenya offered tap sales for 2-year Treasury Bond in
        the month of December. The number of bids received was 546 amounting to
        Kshs 13.46 Billion.

    That contains "bids received", it appears above the table, and the old code
    took the first line that matched — so the archive recorded 13.46 million
    shillings of demand for an auction that drew 13.46 BILLION. Wrong by a
    factor of a thousand, from a line that is not a row at all, and it looked
    entirely plausible next to its neighbours.

    A table row ends with its value; a sentence keeps talking. `_looks_like_row`
    decides which is which, and prose is DISCARDED rather than kept as a
    fallback — see the note below on why a sentence read by column geometry is a
    coincidence rather than a reading.

    FIELD_EXCLUSIONS then drops the near-miss rows outright: a face-value total
    and a count of bids are not amounts, and no ordering makes them so.
    """
    reject = FIELD_EXCLUSIONS.get(key)
    prefer = FIELD_PREFERENCE.get(key)
    # Two tiers: the preferred row, then any other row. Both must be ROWS —
    # their label starts the line.
    #
    # Prose is not a third tier any more, and keeping it as one was a mistake I
    # argued for on the grounds that "some genuinely old layouts have nothing
    # else". The archive disagrees. Four records took their bids from a sentence
    # and every one is nonsense: 7.64, 191.0, 18.6 and 19.06 million shillings,
    # off lines reading "bids received was 877 amounting to kshs 30.5 billion".
    #
    # The reason is structural, not bad luck. This parser reads values by
    # assigning words to COLUMN CENTRES taken from a header. A sentence has no
    # columns, so whichever word happens to fall nearest a centre becomes the
    # value — that is a coincidence with the shape of an answer, not a reading.
    # There is no case in the archive where prose produced a right figure.
    #
    # So a document that states a number only in a sentence yields nothing for
    # that field, and says so. A gap is visible and a coincidence is not.
    best, ordinary, dropped = [], [], 0
    for line in lines:
        text = " ".join(w["text"] for w in line)
        m = pattern.search(text)
        if not m:
            continue
        if reject and reject.search(text):
            continue
        if not _looks_like_row(line):
            dropped += 1
            continue
        if prefer and prefer.search(text):
            best.append(line)
        else:
            ordinary.append(line)
    # No warning here, deliberately. This runs once per field, per header
    # CANDIDATE, per page — up to four times a page for a document that read the
    # field perfectly on page 1 and merely mentions it in prose on page 2. A
    # message that fires on success is indistinguishable from one that fires on
    # loss, which makes it worse than silence. probe_gaps.py reports what is
    # actually missing, once, against the finished archive.
    return best + ordinary


# The heading of section A, which states the date the bond is dated from:
#
#     A.RESULTS OF TREASURY BOND ISSUE NO. FXD 1/2009/15 YEAR VALUE DATED 26/10/2009
#     A.RESULTS OF FIFTEEN YEAR TREASURY BOND ISSUE NO. FXD 1/2010/15 (RE-OPEN) DATED 24/11/2014
#
# "DATED" and "VALUE DATED" are the same thing, and that was established rather
# than assumed. Eight files carrying BOTH a filename date and this heading agree
# exactly, 8 for 8, with no gap in either direction; and every date of either
# form falls on a Monday, as does the filename date on 297 of the archive's 303
# dated records. See the note on parse_pdf for what that Monday actually is.
HEADING_DATE_RE = re.compile(
    r"RESULTS\s+OF\b.{0,120}?\b(?:VALUE\s+)?DATED\s+(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})",
    re.I | re.S)


def auction_date_from_lines(lines: list):
    """The date CBK printed inside the document, or None.

    Only ever consulted when the FILENAME carries no date — 51 records, a sixth
    of the archive, which were invisible to the year table and shared a
    deduplication key of (issue code, None) with every other undated print of
    the same bond.

    The decoy this must not take is in every one of those files:

        (i) The forthcoming issue(s) will be dated 25th January 2010.

    That is NEXT month's bond. Reading from the right, which is what the
    filename reader does and rightly so, would take it every single time. It is
    excluded here because `lines` has already been through `results_section`,
    which stops at the FORTHCOMING heading — a rule written for a different
    purpose that happens to guard this one. Stated explicitly because a change
    to that rule would silently re-admit the decoy.
    """
    for line in lines:
        m = HEADING_DATE_RE.search(" ".join(w["text"] for w in line))
        if not m:
            continue
        d, mo, y = (int(g) for g in m.groups())
        if not (2000 <= y <= date.today().year + 1):
            continue
        try:
            return datetime(y, mo, d).date().isoformat()
        except ValueError:
            continue
    return None


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
        for line in _field_lines(lines, key, pattern):
            text = " ".join(w["text"] for w in line)
            match = pattern.search(text)
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
                #
                # The label is the ROW's, not the pattern's. It used to store
                # `match.group(0)`, which is only the words the regex itself
                # consumed — "total bids received" — and so could not tell
                # "Total bids Received at Cost" from "Total bids Received in
                # Face Value". Those are different quantities, 21% apart on a
                # discount bond, and a comment in this file claimed the label
                # distinguished them when it could not. It does now.
                if key == "bidsReceivedKESM":
                    rec.setdefault("bidsLabel", _row_label(line, label_x))
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

    expected = codes_in_name(source_url)
    per_page = [results_section(group_lines(words)) for words in pages if words]

    # The filename first, because it is unambiguous where it exists. Where it
    # does not — 51 records, a sixth of the archive — the document states the
    # same date on its own section-A heading, and that heading is now read.
    #
    # WHAT THIS DATE ACTUALLY IS, which the field name gets wrong
    # ----------------------------------------------------------
    # It is the VALUE date: the Monday the bond is dated from, not the day
    # bidding closed. 297 of the archive's 303 dated records fall on a Monday,
    # and the six that do not are switch auctions and a buyback. One tap-sale
    # file says so in its own words — "Settlement ... remains Monday 30th, June
    # 2014 as earlier advised", under a filename reading "Dated 30.06.2014" —
    # and CBK writes the heading "VALUE DATED" as readily as "DATED".
    #
    # Kenyan bonds are auctioned on a Wednesday and value the following Monday,
    # so `auctionDate` is out by about five days from what its name promises.
    # The VALUES are right and are CBK's own; the NAME is what is wrong, and
    # renaming a published key would break anyone already reading it. So it is
    # documented here, on /sources/ and in the CSV header instead. Nothing in
    # the app dates an auction window from it — those come from the forthcoming
    # -auction feed, which carries offer-close and settlement separately.
    auction_date = auction_date_from_name(source_url)
    if auction_date is None:
        for lines in per_page:
            auction_date = auction_date_from_lines(lines)
            if auction_date:
                break

    records: dict = {}
    for lines in per_page:
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
    return [_refuse_contradictions(r, source_url) for r in records.values()]


def _refuse_contradictions(rec: dict, source_url: str) -> dict:
    """Drop figures this document cannot support, rather than publish them.

    Both rules here delete data, which is the point. A gap is visible and
    honest; a contradiction is a wrong answer wearing the clothes of a right
    one, and this project has already shipped one of those to readers.

    1. A BIDS FIGURE WHOSE ROW LABEL NEVER SAYS "BID" came from prose, not from
       a bids row. The archive's one instance reads

           bidsReceivedKESM  95.80
           bidsLabel         "which was first issued on 25th august"

       against 10,007.55 accepted — a sentence about an issue date, mined for a
       number. Measured rather than assumed: 356 of 357 labelled records say
       "bid", and the one that does not is exactly this. The guard is that
       specific because a broader one would start deleting good data.

    2. ACCEPTANCE ABOVE BIDS ON THE SAME BASIS is impossible, and we cannot
       tell WHICH of the two is misread. So both go. Keeping the pair would
       publish a contradiction; keeping the one that looks nicer would be a
       guess wearing the clothes of a fact. Different bases are left alone —
       a tap sale may report bids at face value and acceptance at cost, and
       `bidsLabel` is what says so.
    """
    label = (rec.get("bidsLabel") or "").lower()
    if rec.get("bidsReceivedKESM") is not None and label and "bid" not in label:
        print(f"[auctions] {source_url[-52:]}: {rec.get('issueCode')} bids "
              f"{rec['bidsReceivedKESM']} came from a row labelled {label!r}, "
              f"which is prose — dropping it", file=sys.stderr)
        rec.pop("bidsReceivedKESM", None)
        rec.pop("bidsLabel", None)

    a, b = rec.get("amountAcceptedKESM"), rec.get("bidsReceivedKESM")
    if a and b and a > b * 1.001 and "face value" not in label:
        print(f"[auctions] {source_url[-52:]}: {rec.get('issueCode')} accepted "
              f"{a} exceeds bids {b} on one basis — dropping both, since the "
              f"document cannot say which is misread", file=sys.stderr)
        rec.pop("amountAcceptedKESM", None)
        rec.pop("bidsReceivedKESM", None)
    return rec


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
