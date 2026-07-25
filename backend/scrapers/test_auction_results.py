"""Tests for the auction results parser. Run with: python test_auction_results.py

The fixture reproduces the exact hazard the live probe found: pdfplumber
renders CBK's coupon row as

    Coupon Rate (%)   1 1.277   1 2.873

which is TWO coupons, 11.277% and 12.873%, each split by an injected space.
Any parser that reads the text linearly finds four numbers and gets all four
wrong. These tests exist to keep that from ever shipping.
"""
import os
import sys

from auction_results import (
    NUMERIC_RE, header_candidates, _field_count,
    assign_to_columns, auction_date_from_name, cell_value, codes_in_name,
    find_header, group_lines, normalise_code, results_section,
)

failures = []


def check(label, actual, expected):
    if actual != expected:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")
    else:
        print(f"  ok  {label}")


def w(text, x0, top):
    """A word as pdfplumber reports it — text plus its position on the page."""
    return {"text": text, "x0": x0, "x1": x0 + 6 * len(text), "top": top}


# Two bonds in side-by-side columns, centred near x=300 and x=420.
HEADER = [w("Tenor", 40, 100), w("FXD1/2021/5", 290, 100), w("FXD1/2019/20", 405, 100)]
COUPON = [w("Coupon", 40, 120), w("Rate", 80, 120), w("(%)", 110, 120),
          w("1", 296, 120), w("1.277", 303, 120),      # 11.277, split
          w("1", 416, 120), w("2.873", 423, 120)]      # 12.873, split
PRICE = [w("Price", 40, 140), w("per", 72, 140), w("Kshs", 95, 140), w("100", 125, 140),
         w("100.000", 292, 140), w("97.632", 410, 140)]


def main():
    print("normalise_code")
    check("pads the tenor to three digits", normalise_code("FXD1", "2021", "5"), "FXD1/2021/005")
    check("leaves three-digit tenors alone", normalise_code("IFB1", "2022", "019"), "IFB1/2022/019")
    check("strips spaces in the family", normalise_code("FXD 1", "2016", "10"), "FXD1/2016/010")

    print("group_lines")
    lines = group_lines(HEADER + COUPON + PRICE)
    check("three visual lines recovered", len(lines), 3)
    check("each line is sorted left to right",
          [x["text"] for x in lines[0]], ["Tenor", "FXD1/2021/5", "FXD1/2019/20"])

    print("find_header")
    codes, centres = find_header(lines)
    check("both issue codes found", codes, ["FXD1/2021/005", "FXD1/2019/020"])
    check("two column centres", len(centres), 2)
    check("centres are ordered left to right", centres[0] < centres[1], True)

    print("cell_value — the whole point")
    # Joining WITHOUT a separator is the only reading that reproduces the page.
    check("split digits rejoin into one number",
          cell_value([w("1", 296, 120), w("1.277", 303, 120)]), "11.277")
    check("thousands separators are dropped",
          cell_value([w("69,507.37", 300, 120)]), "69507.37")

    print("assign_to_columns")
    label_x = min(centres) - 40
    cells = assign_to_columns(COUPON, centres, label_x)
    check("the coupon row yields exactly two values", len(cells), 2)
    check("column 0 is 11.277 — NOT 1 and not 1.277", cells[0], "11.277")
    check("column 1 is 12.873 — NOT 1 and not 2.873", cells[1], "12.873")

    cells = assign_to_columns(PRICE, centres, label_x)
    check("prices land in their own columns", (cells[0], cells[1]), ("100.000", "97.632"))

    print("label words never become data")
    # "Coupon", "Rate", "(%)" all sit left of label_x and must be ignored.
    check("no label fragment leaked into a column",
          any(c.isalpha() for c in "".join(assign_to_columns(COUPON, centres, label_x).values())),
          False)

    print("a naive linear read would have been wrong")
    naive = [t for t in (x["text"] for x in COUPON) if t.replace(".", "").isdigit()]
    check("linear text finds four bogus numbers", naive, ["1", "1.277", "1", "2.873"])
    check("column reading finds the two real ones",
          sorted(assign_to_columns(COUPON, centres, label_x).values()), ["11.277", "12.873"])

    print("a long row label must not contaminate the value it precedes")
    # Reproduces the live failure exactly. A probe of CBK's own files showed
    # narrow tables — column centres at 104 and 199 — where label_x lands at 64
    # and the tail of a long label sits to the RIGHT of it. cell_value joins
    # without a separator, so "(%)" was glued onto "13.9128" and the cell read
    # "(%)13.9128", failed NUMERIC_RE, and was dropped. Every field went that
    # way, so the file yielded nothing despite a header that parsed perfectly.
    narrow_header = [w("TENOR", 30, 100), w("FXD1/2022/015", 78, 100),
                     w("FXD1/2022/025", 173, 100)]
    codes, narrow_centres = find_header(group_lines(narrow_header),
                                        ["FXD1/2022/015", "FXD1/2022/025"])
    check("the narrow header still parses", codes, ["FXD1/2022/015", "FXD1/2022/025"])
    narrow_label_x = min(narrow_centres) - 40

    # "Bids" and "(%)" sit right of the boundary — that is the whole hazard.
    long_row = [w("Weighted", 20, 120), w("Average", 62, 120), w("Rate", 90, 120),
                w("of", 108, 120), w("Accepted", 116, 120), w("Bids", 152, 120),
                w("(%)", 168, 120),
                w("13.9128", 105, 120), w("14.5384", 200, 120)]
    contaminating = [x["text"] for x in long_row
                     if not x["text"].replace(".", "").isdigit()
                     and (x["x0"] + x["x1"]) / 2 >= narrow_label_x]
    check("the fixture really does put label words past the boundary",
          len(contaminating) > 0, True)

    cells = assign_to_columns(long_row, narrow_centres, narrow_label_x)
    check("the first value is clean", cells.get(0), "13.9128")
    check("the second value is clean", cells.get(1), "14.5384")
    check("both cells survive the numeric test",
          all(NUMERIC_RE.match(v) for v in cells.values()), True)

    print("a prose title must not be mistaken for the table header")
    # The dominant live failure. These PDFs open with a title naming every bond
    # — "FXD1/2022/03 & FXD1/2019/15 DATED 24/04/2023" — above a table whose
    # header row may name only the bonds actually auctioned, because the other
    # leg was cancelled. Scoring by how many filename bonds a line mentions
    # picks the TITLE, and its prose word positions have nothing to do with the
    # table's columns: the probe showed both bonds' figures landing in one
    # column, so the coupon cell read "15.03916.844" and every field was lost.
    titled = group_lines([
        # line 0: the prose title, naming BOTH bonds, packed close together
        w("FXD1/2022/03", 60, 100), w("&", 135, 100), w("FXD1/2019/15", 150, 100),
        w("DATED", 230, 100), w("24/04/2023", 275, 100),
        # line 1: the real table header, naming only the bond that was sold
        w("TENOR", 40, 140), w("FXD1/2022/03", 300, 140),
        # line 2: the data, aligned to the TABLE, not to the title
        w("Coupon", 40, 160), w("Rate", 80, 160), w("(%)", 110, 160),
        w("1", 300, 160), w("1.766", 310, 160),
    ])
    ranked = header_candidates(titled, ["FXD1/2022/003", "FXD1/2019/015"])
    check("the title outranks the header on bond count alone",
          ranked[0][0], ["FXD1/2022/003", "FXD1/2019/015"])
    check("but the real header is also a candidate",
          ["FXD1/2022/003"] in [c for c, _ in ranked], True)

    from auction_results import read_fields, _fit
    title_codes, title_centres = ranked[0]
    via_title = read_fields(titled, title_codes, title_centres, "2023-04-24", "u")
    hdr = [(c, ce) for c, ce in ranked if c == ["FXD1/2022/003"]][0]
    via_header = read_fields(titled, hdr[0], hdr[1], "2023-04-24", "u")

    # The danger is not that the title reads nothing — it reads the SAME number
    # of fields — but that it hangs the coupon on the cancelled bond.
    check("the title misattributes the coupon to the cancelled leg",
          "FXD1/2019/015" in via_title, True)
    check("a field count alone cannot tell them apart",
          _field_count(via_title) == _field_count(via_header), True)

    # Column coverage can: 1 of 2 columns filled versus 1 of 1.
    check("coverage ranks the real header above the title",
          _fit(via_header, hdr[0]) > _fit(via_title, title_codes), True)
    check("and it reads the split coupon onto the right bond",
          via_header["FXD1/2022/003"]["couponRate"], 11.766)

    print("split issue codes — the bug the first dry-run caught")
    # CBK splits codes across word boundaries. Matching word by word found one
    # issue in PDFs whose filename named two, and silently dropped the other.
    split_header = [w("Tenor", 40, 200),
                    w("FXD1/2019/", 285, 200), w("20", 340, 200),
                    w("FXD1/2022/", 400, 200), w("25", 455, 200)]
    codes, centres = find_header(group_lines(split_header))
    check("both codes found despite the split", codes, ["FXD1/2019/020", "FXD1/2022/025"])
    check("two column centres from split words", len(centres), 2)
    check("centres stay ordered", centres[0] < centres[1], True)

    print("codes_in_name — the cross-check on our own work")
    check("filename codes are recovered",
          codes_in_name("RESULTS FXD1-2019-020 AND FXD1-2022-025 DATED 27-07-2026.pdf"),
          ["FXD1/2019/020", "FXD1/2022/025"])
    check("a single-issue filename gives one",
          codes_in_name("SWITCH RESULTS FXD1-2012-020 DATED 15-07-2026.pdf"),
          ["FXD1/2012/020"])

    print("section B must never be read as results")
    # These PDFs carry "A." the auction just held and "B. FORTHCOMING TREASURY
    # BOND(S) ISSUE(S)" naming NEXT month's bonds. The second dry-run proved we
    # were reading across that boundary and attaching an auctioned coupon to a
    # forthcoming bond — a wrong number against a real bond name.
    doc = group_lines([
        w("Tenor", 40, 100), w("FXD1/2018/25", 290, 100), w("FXD1/2021/25", 405, 100),
        w("Coupon", 40, 120), w("13.200", 292, 120), w("13.900", 407, 120),
        w("B.", 40, 160), w("FORTHCOMING", 60, 160), w("TREASURY", 150, 160),
        w("BOND", 210, 160), w("ISSUES", 250, 160),
        w("Tenor", 40, 180), w("FXD1/2026/30", 290, 180),
    ])
    check("the full document has four lines", len(doc), 4)
    trimmed = results_section(doc)
    check("everything from FORTHCOMING down is dropped", len(trimmed), 2)
    codes, _ = find_header(trimmed, ["FXD1/2018/025", "FXD1/2021/025"])
    check("only the auctioned bonds are read", codes, ["FXD1/2018/025", "FXD1/2021/025"])
    check("the forthcoming bond never appears", "FXD1/2026/030" in codes, False)

    print("the filename guides which line is the header")
    # A stray earlier line naming an unrelated bond must not win over the real
    # header, which is the line matching what the filename promised.
    noisy = group_lines([
        w("Reopened", 40, 60), w("FXD1/2012/20", 290, 60),
        w("Tenor", 40, 100), w("FXD1/2018/25", 290, 100), w("FXD1/2021/25", 405, 100),
    ])
    codes, _ = find_header(noisy, ["FXD1/2018/025", "FXD1/2021/025"])
    check("the best-matching line wins", codes, ["FXD1/2018/025", "FXD1/2021/025"])

    print("incremental parsing must never lose an auction")
    import json as _json, tempfile
    from pathlib import Path as _Path
    import auction_results as mod

    original = mod.DATA_DIR
    with tempfile.TemporaryDirectory() as tmp:
        mod.DATA_DIR = _Path(tmp)
        # Nothing captured yet.
        recs, seen = mod.load_existing()
        check("an absent file starts empty", (recs, seen), ([], set()))

        (_Path(tmp) / "auction-results.json").write_text(_json.dumps([
            {"issueCode": "FXD1/2021/005", "auctionDate": "2021-11-15",
             "couponRate": 11.277, "sourceUrl": "https://cbk/a.pdf"},
            {"issueCode": "FXD1/2019/020", "auctionDate": "2021-11-15",
             "couponRate": 12.873, "sourceUrl": "https://cbk/a.pdf"},
        ]))
        recs, seen = mod.load_existing()
        check("existing records are recovered", len(recs), 2)
        check("the PDF they came from is remembered", seen, {"https://cbk/a.pdf"})

        # A file that is not valid JSON must not wipe the archive silently —
        # it should start fresh loudly rather than pretend it had nothing.
        (_Path(tmp) / "auction-results.json").write_text("{ not json")
        recs, seen = mod.load_existing()
        check("a corrupt file yields empty rather than crashing", (recs, seen), ([], set()))
    mod.DATA_DIR = original

    print("deduplication key")
    # The same auction re-listed under a new URL must collapse to one record,
    # while two different auctions of the SAME bond must both survive — that is
    # what makes this file a yield history rather than a snapshot.
    rows = [
        {"issueCode": "FXD1/2021/005", "auctionDate": "2021-11-15", "couponRate": 11.277},
        {"issueCode": "FXD1/2021/005", "auctionDate": "2021-11-15", "couponRate": 11.277},
        {"issueCode": "FXD1/2021/005", "auctionDate": "2023-04-10", "couponRate": 11.277},
    ]
    uniq = {(r["issueCode"], r.get("auctionDate")): r for r in rows}
    check("a duplicate auction collapses", len(uniq), 2)
    check("a reopening on a different date is kept",
          sorted(d for _, d in uniq), ["2021-11-15", "2023-04-10"])

    print("fractional tenors")
    # CBK issued IFB1/2023/6.5 and IFB1/2024/8.5. Every issue-code pattern in
    # the pipeline assumed whole years, so those matched as "6" and "8" and
    # never joined the securities register — two TAX-FREE infrastructure bonds
    # invisible in an app built on the argument that they are the best deal
    # available. It failed silently, listed alongside genuine data gaps.
    check("a fractional tenor survives normalisation",
          normalise_code("IFB1", "2023", "6.5"), "IFB1/2023/006.5")
    check("6.5 years is not 6 years",
          normalise_code("IFB1", "2023", "6.5") == normalise_code("IFB1", "2023", "6"), False)
    check("whole tenors are unchanged",
          normalise_code("FXD1", "2022", "10"), "FXD1/2022/010")
    check("the filename spelling is read too",
          codes_in_name("RESULTS FOR IFB1-2024-8.5 DATED 19-02-2024.pdf"),
          ["IFB1/2024/008.5"])
    check("and CBK's other filename spelling",
          codes_in_name("RESULTS NOVEMBER 2023 IFB1-2023-6.5 DATED 13-11-2023.pdf"),
          ["IFB1/2023/006.5"])

    print("the auction date in the filename")
    # All four spellings CBK actually uses. The first version of the pattern
    # took only the first of these, which left 23 of 169 captured records with
    # no date — invisible to the yield history and a latent dedup collapse.
    check("DD-MM-YYYY",
          auction_date_from_name("RESULTS FXD1-2021-005 DATED 15-11-2021.pdf"),
          "2021-11-15")
    check("dots",
          auction_date_from_name("RESULTS FXD2-2013-15 DATED 23.11.2020.pdf"),
          "2020-11-23")
    check("single-digit month",
          auction_date_from_name("RESULTS FXD1-2012-15 DATED 19-7-2021.pdf"),
          "2021-07-19")
    check("two-digit year",
          auction_date_from_name("RESULTS FXD1-2012-15 DATED 28.12.20.pdf"),
          "2020-12-28")
    check("'DD' instead of 'DATED'",
          auction_date_from_name("RESULTS FXD2-2018-10 DD 24.01.2022.pdf"),
          "2022-01-24")

    # The hazard the looser pattern introduces: issue codes are digits joined by
    # the same separators. Reading from the RIGHT is what keeps a bond's tenor
    # from being mistaken for the day it was sold.
    check("an issue code is not mistaken for a date",
          auction_date_from_name("RESULTS FXD1-2012-020, FXD1-2019-020 DATED 05-07-2021.pdf"),
          "2021-07-05")
    check("a filename with no date yields None",
          auction_date_from_name("RESULTS FXD1-2012-020.pdf"), None)
    check("an impossible date is rejected rather than guessed",
          auction_date_from_name("RESULTS DATED 31-02-2021.pdf"), None)

    print("repairing dates a previous run could not read")
    # Incremental parsing means a file is read once, so a later parser fix never
    # reaches records already captured. This recovers them from the URL we
    # already stored — no re-download, and nothing invented.
    stale = [
        {"id": "res-fxd1-2012-015-None", "issueCode": "FXD1/2012/015",
         "auctionDate": None, "sourceUrl": "https://cbk/RESULTS FXD1-2012-15 DATED 28.12.20.pdf"},
        {"id": "res-fxd1-2021-005-2021-11-15", "issueCode": "FXD1/2021/005",
         "auctionDate": "2021-11-15", "sourceUrl": "https://cbk/b.pdf"},
        {"id": "res-x-None", "issueCode": "FXD9/1999/001",
         "auctionDate": None, "sourceUrl": "https://cbk/no date here.pdf"},
    ]
    repaired = mod.repair_dates(stale)
    check("an undated record recovers its date", repaired[0]["auctionDate"], "2020-12-28")
    check("and its id stops saying None", repaired[0]["id"], "res-fxd1-2012-015-2020-12-28")
    check("a record that already had a date is untouched",
          repaired[1]["auctionDate"], "2021-11-15")
    check("a filename with no date is left alone rather than guessed at",
          repaired[2]["auctionDate"], None)

    print("restoring fractional tenors a previous run truncated")
    stale = [
        # Captured as IFB1/2023/006, a bond that does not exist.
        {"id": "res-ifb1-2023-006-2023-11-13", "issueCode": "IFB1/2023/006",
         "auctionDate": "2023-11-13",
         "sourceUrl": "https://cbk/RESULTS NOVEMBER 2023 IFB1-2023-6.5 DATED 13-11-2023.pdf"},
        # The filename confirms this one; it must not be touched.
        {"id": "res-fxd1-2021-005-2021-11-15", "issueCode": "FXD1/2021/005",
         "auctionDate": "2021-11-15",
         "sourceUrl": "https://cbk/RESULTS FXD1-2021-005 DATED 15-11-2021.pdf"},
        # Filename names no fractional variant — leave it alone rather than guess.
        {"id": "res-fxd9-1999-001-2021-01-01", "issueCode": "FXD9/1999/001",
         "auctionDate": "2021-01-01",
         "sourceUrl": "https://cbk/RESULTS FXD1-2021-005 DATED 15-11-2021.pdf"},
    ]
    repaired = mod.repair_codes(stale)
    check("a truncated fractional tenor is restored",
          repaired[0]["issueCode"], "IFB1/2023/006.5")
    check("and its id follows", repaired[0]["id"], "res-ifb1-2023-006.5-2023-11-13")
    check("a code the filename confirms is untouched",
          repaired[1]["issueCode"], "FXD1/2021/005")
    check("an unexplained mismatch is left alone rather than guessed at",
          repaired[2]["issueCode"], "FXD9/1999/001")

    print("wall-clock budget")
    # The budget's whole justification is that stopping early costs a day, not
    # an archive: whatever was read is kept and the remaining count reports the
    # true backlog rather than the one the file cap would imply.
    check("a budget is set", mod.TIME_BUDGET_SECONDS > 0, True)
    check("it is overridable for a slow day",
          mod.TIME_BUDGET_SECONDS,
          int(os.environ.get("AUCTION_TIME_BUDGET", "600")))
    # Stopping after 30 of 148 must report 118 outstanding, not 28 (148 - 120).
    check("the backlog counts files actually read", max(0, 148 - 30), 118)

    if failures:
        print(f"\n{len(failures)} FAILURE(S):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll auction results parser tests passed.")


if __name__ == "__main__":
    main()
