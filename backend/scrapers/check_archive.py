"""Contradictions inside the auction archive, checked against arithmetic.

WHY THIS EXISTS
---------------
Every other check in this repository asks whether a source is reachable, whether
data is fresh, or whether a value sits inside a plausible band. None of them
would have caught the worst bug found so far, because the bug produced values
that were individually plausible and collectively impossible:

    Total bids Received (Kshs. M)   31,331.63   32,916.78   64,248.41

    FXD2/2014/005  recorded 32,916.78   the other bond's bids
    FXD3/2013/005  recorded 64,248.40   the auction total

Two bonds, two believable figures, both inside every band, and the archive
agreed with itself perfectly. The only tell was arithmetic: one bond's number
was the sum of the other's and a figure that appeared nowhere. It went unnoticed
for as long as it did because nothing was looking for that shape, and it was
found by a human reading a row label that had accidentally kept the missing
number — an accident that a tidy-up was about to remove.

So this looks for CONTRADICTIONS rather than gaps. A gap is visible and honest;
a contradiction is a wrong answer wearing the clothes of a right one.

WHAT IT GATES ON, AND WHAT IT ONLY REPORTS
------------------------------------------
Failures are reported for the whole archive but only GATE on records at the
current PARSER_VERSION. Older rows are a queue, not a verdict: they were
produced by a parser since fixed and are waiting to be re-read, so failing the
build over them would block the very change that repairs them.
"""
import collections
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

from auction_results import PARSER_VERSION

ARCHIVE = Path(__file__).resolve().parents[2] / "public" / "data" / "auction-results.json"
FORTHCOMING = Path(__file__).resolve().parents[2] / "public" / "data" / "auctions.json"

# How close two figures must be to call one the sum of the others. CBK rounds to
# two decimals, and a three-bond sum can drift a cent.
SUM_TOLERANCE = 0.05

# A cover ratio outside this is arithmetic on a misparsed column, not a market
# event. Matches PLAUSIBLE_COVER in auction-review.ts.
COVER_BAND = (0.1, 10.0)

# Mirrors auctionKind() in src/lib/auction-review.ts, and must keep mirroring it.
# A switch is a debt exchange and a tap is a fixed-price top-up against the
# PARENT auction's offer; neither has a cover ratio, and computing one anyway
# produces a figure that looks like a failed auction when nothing failed. The
# 2024-07-08 tap sale reads 487.50 bid against the 20,000 its parent auction
# offered — 0.024x, and entirely correct.
#
# The lookbehind and lookahead are not decoration. `_` is a word character, so
# `\bTAP\b` never fires in "838376338_TAP SALE RESULTS", and CBK writes
# "TAPSALE" as one word often enough that a fix for the first spelling missed
# seven files and ten records. Both spellings, and neither swallowing a longer
# word that merely starts with TAP.
_TAP = re.compile(r"(?<![A-Z])TAP(?:SALE)?(?![A-Z])")


def auction_kind(url: str) -> str:
    upper = unquote(url or "").upper()
    if "SWITCH" in upper:
        return "switch"
    return "tap" if _TAP.search(upper) else "primary"


def load() -> list:
    try:
        return json.loads(ARCHIVE.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"archive unreadable: {exc.__class__.__name__}: {exc}", file=sys.stderr)
        return []


def _name(url: str) -> str:
    return unquote(url or "").rsplit("/", 1)[-1][:62]


def sum_identity(records: list) -> list:
    """A bond whose figure is the sum of its siblings' — the column-shift tell.

    When a value column is discarded, every bond takes its neighbour's number
    and the last one takes the auction total. The total is by definition the sum
    of the bonds, so it shows up as one row holding what the others add to.

    IT WOULD NOT HAVE CAUGHT THE 2017 FILES, and saying so matters more than the
    check does. Those auctions have TWO bonds, so the shift leaves (bond2, total)
    recorded and bond1 gone entirely — total minus bond2 is bond1, which is not
    a contradiction, just a subtraction. No arithmetic on the surviving records
    can reveal it. Only the leaked row label did, and only by accident.

    So this catches the three-bond-and-up case and is honest about the rest. The
    two-bond case is prevented at the root instead, by value_start_x measuring
    the boundary on the row rather than on the header.
    """
    out = []
    for field in ("bidsReceivedKESM", "amountAcceptedKESM", "amountOfferedKESM"):
        by_file = collections.defaultdict(list)
        for r in records:
            if r.get(field):
                by_file[r.get("sourceUrl")].append(r)
        for url, rows in by_file.items():
            if len(rows) < 3:
                continue  # two bonds cannot show this: a+b=b has no solution
            vals = [r[field] for r in rows]
            for i, total in enumerate(vals):
                others = [v for j, v in enumerate(vals) if j != i]
                if abs(sum(others) - total) <= SUM_TOLERANCE:
                    out.append(
                        f"{_name(url)}: {rows[i]['issueCode']} {field}={total:,.2f} "
                        f"is exactly the sum of the other {len(others)} bond(s) — "
                        f"a discarded value column shifts every figure by one")
                    break
    return out


def accepted_within_bids(records: list) -> list:
    """You cannot accept more than was bid.

    Skipped where the two figures are on different bases: a tap sale may report
    bids at FACE VALUE and acceptance at cost, and those are 1-2% apart on a
    discount bond without either being wrong. `bidsLabel` records which, so the
    check knows when to stay quiet rather than guessing.
    """
    out = []
    for r in records:
        a, b = r.get("amountAcceptedKESM"), r.get("bidsReceivedKESM")
        if not a or not b or a <= b * 1.001:
            continue
        if "face value" in (r.get("bidsLabel") or ""):
            continue  # different bases, not a contradiction
        out.append(f"{_name(r.get('sourceUrl'))}: {r['issueCode']} accepted "
                   f"{a:,.2f} exceeds bids {b:,.2f} ({a / b:.2f}x)")
    return out


def label_kept_its_value(records: list) -> list:
    """A row label containing a figure means the value boundary is wrong.

    Harmless in itself, and the ONLY thing that revealed the two-bond column
    shift — the label had kept the value the parser threw away. Worth surfacing
    rather than tidying away, and worth remembering that it was an accident: no
    check was looking for it, and a routine clean-up nearly removed it before
    anyone read it.

    After the value_start_x fix a correct parse cannot produce one of these, so
    a hit here means the boundary is wrong again.
    """
    num = re.compile(r"[\d,]+\.\d\d")
    return [f"{_name(r.get('sourceUrl'))}: {r['issueCode']} bidsLabel carries a "
            f"figure — {r['bidsLabel']!r}"
            for r in records if r.get("bidsLabel") and num.search(r["bidsLabel"])]


def duplicate_keys(records: list) -> list:
    """(issue code, value date) is the deduplication key; it must be unique.

    Two records sharing one means an auction was counted twice or two auctions
    were collapsed into one.
    """
    seen = collections.Counter(
        (r.get("issueCode"), r.get("auctionDate")) for r in records
        if r.get("issueCode") and r.get("auctionDate"))
    return [f"{code} on {date} appears {n} times" for (code, date), n in seen.items() if n > 1]


def implausible_cover(records: list) -> list:
    """A bid-to-cover outside the plausible band, computed per auction.

    Primary auctions only — see auction_kind. Offered is taken ONCE per date
    because it is stored per auction, not per bond; summing it across rows
    multiplies the government's borrowing target by the number of bonds.
    """
    out = []
    by_date = collections.defaultdict(list)
    for r in records:
        if r.get("auctionDate") and auction_kind(r.get("sourceUrl")) == "primary":
            by_date[r["auctionDate"]].append(r)
    for date, rows in by_date.items():
        offered = {r["amountOfferedKESM"] for r in rows if r.get("amountOfferedKESM")}
        if len(offered) != 1 or not all(r.get("bidsReceivedKESM") for r in rows):
            continue
        cover = sum(r["bidsReceivedKESM"] for r in rows) / offered.copy().pop()
        if not (COVER_BAND[0] <= cover <= COVER_BAND[1]):
            out.append(f"{date}: cover {cover:.3f}x is outside {COVER_BAND} — "
                       f"a misread column, not a market event")
    return out


def filename_names_a_bond_we_lost(records: list) -> list:
    """CBK's filename names a bond, and we recorded no row for it.

    REPORTED, NEVER GATED, and the distinction is the whole point. This is the
    only check here that cannot tell whose fault a discrepancy is.

    It exists because 27-03-2017 slipped past everything else. That file names
    two bonds and we record one, holding the unlabelled auction total 64,248.40
    where FXD3/2013/005 should read 32,916.78. Not one other check fires on it:
    sum_identity needs three rows and there is one, the row label that exposed
    the original column shift is gone because the parser stopped leaking labels,
    and a single plausible figure has nothing to contradict. A wrong number sat
    in the published archive with every green tick intact.

    Why it must not gate. Three of the seven files it currently reports are
    CBK's own filename disagreeing with CBK's own table — "FXD1-2015-018" in the
    name against FXD1/2018/015 in the document, digits transposed. The document
    is the better source and the parser is right to follow it. Failing the build
    on those would punish a correct parse for someone else's typo, and a check
    that cries wolf gets switched off in a week.

    So it reports and stays out of the way. What it buys is that this class of
    failure is VISIBLE — which is more than was true when a wrong figure went
    out under a clean bill of health.
    """
    from auction_results import codes_in_name

    by_file = collections.defaultdict(list)
    for r in records:
        if r.get("sourceUrl"):
            by_file[r["sourceUrl"]].append(r)

    out = []
    for url, rows in by_file.items():
        named = set(codes_in_name(unquote(url).rsplit("/", 1)[-1]))
        if not named:
            continue
        missing = named - {r["issueCode"] for r in rows}
        if missing:
            out.append(f"{_name(url)}: names {sorted(missing)} but no row was "
                       f"recorded for it — either a bond was dropped, or CBK's "
                       f"filename disagrees with CBK's table")
    return out


def forthcoming_disagrees_with_archive(records: list) -> list:
    """auctions.json says one thing about an auction; the archive says another.

    The forthcoming-auction feed is the only dataset here that nothing checked,
    and it is hand-maintained while everything around it is machine-parsed. Both
    of the figures it carries are rendered on /auctions/ — `amountOfferedKES` as
    "Amount offered", `bondName` as the subtitle — so an error in it is a wrong
    number in front of a reader, not an internal untidiness.

    It had drifted, and not subtly:

        switch 15-07-2026   said KES 754M offered   archive: 10,000M
                            said 754M accepted      archive:  7,954.71M

    An order of magnitude, and the "754" looks like 7,954.71 with digits lost.
    The three-way on 13-07-2026 claimed 63.28B accepted where the three legs sum
    to 70.60B.

    Only `amountOfferedKES` is checked, because it is the one figure both files
    hold in a comparable form. It is compared against the archive's
    `amountOfferedKESM` for the same auction date, which is stored per auction
    rather than per bond — so every leg carries the same value and any one of
    them settles it.

    Skipped where the archive has nothing for that date: a genuinely forthcoming
    auction has not been read yet, and absence there is expected rather than
    suspicious. Gating on it would fail the build for the feed doing its job.
    """
    try:
        feed = json.loads(FORTHCOMING.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        return [f"auctions.json unreadable: {exc.__class__.__name__}: {exc}"]

    offered_by_date = collections.defaultdict(set)
    for r in records:
        if r.get("auctionDate") and r.get("amountOfferedKESM"):
            offered_by_date[r["auctionDate"]].add(round(r["amountOfferedKESM"], 2))

    out = []
    for entry in feed:
        claimed = entry.get("amountOfferedKES")
        if not claimed:
            continue
        # Try BOTH dates, and require only that ONE of them lines up.
        #
        # The first draft keyed on settlementDate alone, reasoning that the
        # archive stores the value date and the feed calls that settlement. It
        # is true of the ordinary auctions and false often enough to matter: a
        # SWITCH is dated from the day it is held, so the feed's auctionDate is
        # what the archive holds. Keying on one field reported a real auction as
        # wrong because its settlement date happened to be the value date of a
        # DIFFERENT auction — the tap sale a week later, offering 15bn against
        # the 40bn this entry describes.
        #
        # A check whose first finding is its own false positive teaches the
        # reader to skip it. So this asks the weaker, true question: does the
        # offered amount agree with the archive on EITHER of the dates this
        # entry claims? A mismatch then means the figure is wrong, not that the
        # calendar convention differs.
        candidates = [entry.get("auctionDate"), entry.get("settlementDate")]
        archived = {v for d in candidates if d for v in offered_by_date.get(d, ())}
        if not archived:
            continue
        if round(claimed / 1_000_000, 2) not in archived:
            out.append(
                f"{entry.get('id')}: says {claimed / 1e9:,.2f}B offered, archive has "
                f"{sorted(f'{v / 1000:,.2f}B' for v in archived)} on "
                f"{[d for d in candidates if d]}")
    return out


CHECKS = [
    ("one bond holding the sum of the others", sum_identity),
    ("accepted exceeding bids received", accepted_within_bids),
    ("a row label carrying its own figure", label_kept_its_value),
    ("a duplicated (issue code, value date)", duplicate_keys),
    ("an implausible bid-to-cover", implausible_cover),
    ("auctions.json disagreeing with the archive", forthcoming_disagrees_with_archive),
]


def main() -> None:
    records = load()
    if not records:
        sys.exit(1)
    current = [r for r in records if r.get("parserVersion") == PARSER_VERSION]
    print(f"=== ARCHIVE INTEGRITY: {len(records)} record(s), "
          f"{len(current)} at parser v{PARSER_VERSION} ===\n")

    if not current:
        # Said out loud because a green tick that cannot go red is worse than no
        # tick: it reads as "checked and clean" when it means "nothing to check".
        # This is the normal state for the first commit after a version bump —
        # the parser changed, no file has been re-read yet, so the gate has no
        # records to gate on. It resolves itself on the next refresh run.
        print("NOTE  No record carries this parser version yet, so nothing below\n"
              "      can fail the build. This is a version bump awaiting its\n"
              "      re-read, not a clean bill of health.\n")

    gating = 0
    for label, fn in CHECKS:
        everywhere = fn(records)
        at_current = fn(current)
        if not everywhere:
            print(f"OK    {label}")
            continue
        stale = len(everywhere) - len(at_current)
        print(f"{'FAIL' if at_current else 'warn'}  {label}: {len(everywhere)} "
              f"({len(at_current)} at v{PARSER_VERSION}"
              f"{f', {stale} awaiting re-read' if stale else ''})")
        for line in everywhere[:6]:
            print(f"        {line}")
        if len(everywhere) > 6:
            print(f"        ... and {len(everywhere) - 6} more")
        gating += len(at_current)

    # Reported below the gating block and never added to `gating`, so it cannot
    # fail a build. Kept visibly separate rather than folded in with a flag,
    # because "this check does not gate, and here is why" is a fact about the
    # check that a reader should not have to infer from a boolean.
    # UNDATED OUTCOME RECORDS.
    #
    # Thirteen records carry a weighted average rate, a price and an amount
    # accepted, and no auctionDate at all — most from a file CBK named
    # "Tap sale advert.pdf". An advert announces a sale; a weighted average
    # rate and an amount accepted are outcomes. Either the filename misleads or
    # the parser read the wrong document, and from here it cannot tell which.
    #
    # They are inert TODAY, which was measured rather than assumed: dropping
    # all thirteen leaves the published rates feed byte-identical, the yield
    # curve identical, and bid guidance identical across twelve tenor-by-tax
    # combinations. Every consumer already filters on auctionDate.
    #
    # So this reports and does not gate. The risk is not what reads them now,
    # it is the next consumer that forgets to filter and silently ingests
    # outcome figures belonging to no date. A count that is visible is a count
    # somebody notices growing.
    undated = [
        r for r in records
        if not r.get("auctionDate")
        and any(r.get(k) is not None for k in
                ("weightedAverageRate", "pricePer100", "amountAcceptedKESM"))
    ]
    print("\n--- reported, not gated: outcome figures with no auction date")
    if not undated:
        print("OK    every record carrying an outcome also carries a date")
    else:
        print(f"note  {len(undated)} record(s) hold a rate, price or amount but no "
              f"auctionDate.\n      Inert while every consumer filters on the date; "
              f"a new consumer that does not\n      would ingest figures belonging to "
              f"no point in time.")
        for r in undated[:6]:
            src = str(r.get("sourceUrl") or "").rsplit("/", 1)[-1][:52]
            print(f"        {r.get('issueCode')}  war={r.get('weightedAverageRate')}  <{src}>")
        if len(undated) > 6:
            print(f"        ... and {len(undated) - 6} more")

    advisory = filename_names_a_bond_we_lost(records)
    print(f"\n--- reported, not gated: a bond named in the filename with no row")
    if not advisory:
        print("OK    every bond CBK names in a filename has a row")
    else:
        print(f"note  {len(advisory)} file(s). Some of these are CBK's filename "
              f"disagreeing with CBK's own table,\n      which the parser is "
              f"right to resolve in favour of the document. Read before acting.")
        for line in advisory[:8]:
            print(f"        {line}")
        if len(advisory) > 8:
            print(f"        ... and {len(advisory) - 8} more")

    print()
    if gating:
        print(f"{gating} contradiction(s) in records the CURRENT parser produced.",
              file=sys.stderr)
        print("These are not gaps. Each one is a value that is wrong while looking "
              "right.", file=sys.stderr)
        sys.exit(1)
    print("No contradictions in what the current parser produced.")


if __name__ == "__main__":
    main()
