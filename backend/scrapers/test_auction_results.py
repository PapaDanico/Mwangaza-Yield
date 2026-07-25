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
    attribute_auction_level, FIELDS, NUMERIC_RE, header_candidates, _field_count, merge_page, label_word_positions,
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
          ["FXD1/2022/003"] in [c for c, _, _ in ranked], True)

    from auction_results import read_fields, _fit
    title_codes, title_centres, title_density = ranked[0]
    via_title = read_fields(titled, title_codes, title_centres, "2023-04-24", "u")
    hdr = [(c, ce, d) for c, ce, d in ranked if c == ["FXD1/2022/003"]][0]
    via_header = read_fields(titled, hdr[0], hdr[1], "2023-04-24", "u")

    # The danger is not that the title reads nothing — it reads the SAME number
    # of fields — but that it hangs the coupon on the cancelled bond.
    check("the title misattributes the coupon to the cancelled leg",
          "FXD1/2019/015" in via_title, True)
    check("a field count alone cannot tell them apart",
          _field_count(via_title) == _field_count(via_header), True)

    # Column coverage can: 1 of 2 columns filled versus 1 of 1.
    check("coverage ranks the real header above the title",
          _fit(via_header, hdr[0], hdr[2]) > _fit(via_title, title_codes, title_density), True)
    check("and it reads the split coupon onto the right bond",
          via_header["FXD1/2022/003"]["couponRate"], 11.766)

    print("a sentence must not be mistaken for a table header")
    # A real file reads "The auction for FXD 1/2019/15 was cancelled." That
    # prose names a code, so it scored as a header, its figures landed in its
    # single column, and it TIED with the real "TENOR FXD1/2022/03" row. The
    # tie went to whichever came first and the whole file was published under
    # the leg the sentence says was cancelled.
    cancelled = group_lines([
        w("The", 40, 100), w("auction", 62, 100), w("statistics", 110, 100),
        w("are", 175, 100), w("summarised", 200, 100), w("below.", 270, 100),
        w("The", 320, 100), w("auction", 345, 100), w("for", 395, 100),
        w("FXD", 415, 100), w("1/2019/15", 440, 100), w("was", 500, 100),
        w("cancelled.", 525, 100),
        w("TENOR", 40, 130), w("FXD1/2022/03", 170, 130),
        w("Coupon", 40, 150), w("Rate", 80, 150), w("(%)", 110, 150),
        w("1", 172, 150), w("1.766", 182, 150),
    ])
    ranked = header_candidates(cancelled, ["FXD1/2022/003", "FXD1/2019/015"])
    check("the real header now outranks the sentence",
          ranked[0][0], ["FXD1/2022/003"])
    check("the sentence is still a candidate, just a worse one",
          ["FXD1/2019/015"] in [c for c, _, _ in ranked], True)

    from auction_results import read_fields as _rf
    won = _rf(cancelled, ranked[0][0], ranked[0][1], "2023-04-24", "u")
    check("so the coupon lands on the bond that was actually sold",
          list(won), ["FXD1/2022/003"])
    check("and never on the cancelled leg", "FXD1/2019/015" in won, False)

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

    print("the total column — why the second bond of every auction was empty")
    # Reconstructed from the live probe's output for the 16 February 2026
    # auction, x-positions and all. The header names two bonds; the table has
    # THREE value columns, because the rightmost is the auction total and CBK
    # does not name it. With two centres the total fell to the nearest, which
    # was the second bond's, and cell_value glued it onto the figure already
    # there — "45748.83100535.55" — which failed NUMERIC_RE and was dropped.
    #
    # Published for this auction: 15y bids 133.8bn accepted 54.8bn, 25y bids
    # 79.9bn, 100.5bn raised in total. The second leg's figures were in the
    # document all along.
    def num(text, centre, top):
        """A right-aligned figure, positioned by its centre as the probe reports it."""
        half = 3 * len(text)
        return {"text": text, "x0": centre - half, "x1": centre + half, "top": top}

    feb = group_lines([
        w("TENOR", 40, 100), w("FXD3/2019/015", 240, 100), w("FXD1/2018/025", 355, 100),
        w("Total", 40, 130), w("Amount", 70, 130), w("Offered", 120, 130),
        w("(Kshs.", 165, 130), w("M)", 200, 130), num("50,000.00", 520.5, 130),
        w("Amount", 40, 160), w("Accepted", 80, 160), w("(Kshs.", 140, 160), w("M)", 175, 160),
        num("54,786.72", 321.2, 160), num("45,748.83", 433.8, 160), num("100,535.55", 518.4, 160),
        w("Total", 40, 190), w("bids", 70, 190), w("Received", 100, 190), w("at", 155, 190),
        w("cost", 172, 190), w("(Kshs.", 200, 190), w("M)", 235, 190),
        num("133,792.51", 319.1, 190), num("79,943.37", 433.8, 190), num("213,735.88", 518.4, 190),
    ])
    feb_codes, feb_centres = find_header(feb, ["FXD3/2019/015", "FXD1/2018/025"])
    check("the header still names two bonds", feb_codes,
          ["FXD3/2019/015", "FXD1/2018/025"])

    from auction_results import value_columns, totals_confirmed
    measured = value_columns(feb, feb_centres, min(feb_centres) - 40)
    check("but the values show three columns", len(measured), 3)
    check("and the document confirms the third is a total",
          totals_confirmed(feb, measured, min(feb_centres) - 40), True)

    got = _rf(feb, feb_codes, feb_centres, "2026-02-16", "u")
    check("the first leg is unchanged",
          (got["FXD3/2019/015"]["amountAcceptedKESM"],
           got["FXD3/2019/015"]["bidsReceivedKESM"]), (54786.72, 133792.51))
    # .get, not [] — before the fix these keys are ABSENT, and a test for a
    # silent gap should report the gap rather than crash on it.
    second = got.get("FXD1/2018/025", {})
    check("the second leg now carries its own figures",
          (second.get("amountAcceptedKESM"), second.get("bidsReceivedKESM")),
          (45748.83, 79943.37))
    check("published 25y bids 79.9bn — we read 79.94bn",
          round((second.get("bidsReceivedKESM") or 0) / 1000, 1), 79.9)
    check("published 100.5bn raised — our two legs sum to it",
          round((got["FXD3/2019/015"]["amountAcceptedKESM"]
                 + (second.get("amountAcceptedKESM") or 0)) / 1000, 1), 100.5)

    # The total itself must never become a bond's figure. 213,735.88 is the
    # auction's bids; hanging it on a leg is the arithmetic that produced a
    # published claim of undersubscription.
    check("the total is not attributed to any bond",
          213735.88 in [r.get("bidsReceivedKESM") for r in got.values()], False)

    # Offered is the one exception, and only because the published performance
    # rates — 267.59% and 159.89% — reconcile against the same 50bn.
    check("both bonds take the auction's offered amount",
          [r.get("amountOfferedKESM") for r in got.values()], [50000.0, 50000.0])
    check("and both say it is shared, not theirs",
          {r.get("offeredScope") for r in got.values()}, {"auction"})

    print("an unnamed extra column is not assumed to be a total")
    # Same shape, but the third column does not add up. It could be a bond the
    # header failed to name, and discarding real figures is worse than the
    # geometry we already had — so the header's reading stands.
    odd = group_lines([
        w("TENOR", 40, 100), w("FXD3/2019/015", 240, 100), w("FXD1/2018/025", 355, 100),
        w("Amount", 40, 160), w("Accepted", 80, 160), w("(Kshs.", 140, 160), w("M)", 175, 160),
        num("54,786.72", 321.2, 160), num("45,748.83", 433.8, 160), num("11,000.00", 518.4, 160),
        w("Total", 40, 190), w("bids", 70, 190), w("Received", 100, 190),
        w("(Kshs.", 200, 190), w("M)", 235, 190),
        num("133,792.51", 319.1, 190), num("79,943.37", 433.8, 190), num("22,000.00", 518.4, 190),
    ])
    odd_codes, odd_centres = find_header(odd, ["FXD3/2019/015", "FXD1/2018/025"])
    measured_odd = value_columns(odd, odd_centres, min(odd_centres) - 40)
    check("three columns are still measured", len(measured_odd), 3)
    check("but nothing confirms a total",
          totals_confirmed(odd, measured_odd, min(odd_centres) - 40), False)

    print("a two-bond table with no total column is read exactly as before")
    plain = group_lines([
        w("TENOR", 40, 100), w("FXD3/2019/015", 240, 100), w("FXD1/2018/025", 355, 100),
        w("Amount", 40, 160), w("Accepted", 80, 160), w("(Kshs.", 140, 160), w("M)", 175, 160),
        num("54,786.72", 321.2, 160), num("45,748.83", 433.8, 160),
    ])
    plain_codes, plain_centres = find_header(plain, ["FXD3/2019/015", "FXD1/2018/025"])
    plain_got = _rf(plain, plain_codes, plain_centres, "2026-02-16", "u")
    check("both bonds read, neither invented",
          [r.get("amountAcceptedKESM") for r in plain_got.values()], [54786.72, 45748.83])
    check("and no offered amount is conjured from a column that is not there",
          [r.get("amountOfferedKESM") for r in plain_got.values()], [None, None])

    print("a tap sale states the same six facts in different words")
    # Reconstructed from the live probe's output for
    # "383409132_Results Tap Sale FXD3-2019-5 DATED 23-12-2019.pdf". Every field
    # is printed; not one of the archive's 41 tap-sale records was complete,
    # because the parser was looking for a primary auction's wording.
    def row(label_words, value, top, vx=300):
        out, x = [], 40
        for t in label_words:
            out.append(w(t, x, top))
            x += 6 * len(t) + 4
        out.append(num(value, vx, top))
        return out

    tap = group_lines([
        w("Tenor", 40, 100), w("FXD3/2019/5", 280, 100),
        *row(["Total", "Advertised", "Amount", "(Kes", "Million)"], "9,720.00", 130),
        *row(["Total", "Bids", "Received", "at", "Cost", "(Kes", "Million)"], "9,750.51", 160),
        *row(["Total", "Bids", "Accepted", "at", "Cost", "(Kes", "Million)"], "9,750.51", 190),
        *row(["Allocated", "average", "rate", "for", "accepted", "bids", "(%)"], "11.492%", 220),
        *row(["Adjusted", "Average", "Price(Per", "Kes", "100.00)"], "100.215", 250),
        *row(["Coupon", "Rate(%)"], "11.492%", 280),
    ])
    tap_codes, tap_centres = find_header(tap, ["FXD3/2019/005"])
    got = _rf(tap, tap_codes, tap_centres, "2019-12-23", "u")
    rec = got.get("FXD3/2019/005", {})
    check("advertised amount is the amount offered", rec.get("amountOfferedKESM"), 9720.0)
    check("bids accepted at cost is the amount accepted",
          rec.get("amountAcceptedKESM"), 9750.51)
    check("bids received still reads", rec.get("bidsReceivedKESM"), 9750.51)
    check("adjusted average price is the price per 100", rec.get("pricePer100"), 100.215)
    check("allocated average rate is the weighted average",
          rec.get("weightedAverageRate"), 11.492)
    # The coupon was matched by label and then thrown away, every time, because
    # the cell kept its per-cent sign and failed NUMERIC_RE.
    check("a rate written with a per-cent sign survives", rec.get("couponRate"), 11.492)

    print("a sentence about bids must not outrank the table row")
    # CBK's tap-sale files open with a paragraph naming the same figures in
    # BILLIONS. The old code took the first matching line, so the archive
    # recorded 13.46 million where 13.46 billion was bid — wrong by a thousand,
    # from a line that is not a row at all.
    # The exact sentence from the 2014 two-bond tap file. It matters that this
    # one carries no "number of", so FIELD_EXCLUSIONS does NOT catch it and the
    # ordering rule is the only thing standing between us and reading 64 as the
    # bids received. A first draft of this fixture omitted the word "bids" and
    # so matched nothing, and the test passed for the wrong reason — mutating
    # the ordering back is what exposed that.
    prose = group_lines([
        w("below.", 40, 100), w("All", 82, 100), w("the", 105, 100),
        w("64", 130, 100), w("bids", 150, 100), w("received", 182, 100),
        w("were", 235, 100), w("accepted", 268, 100), w("and", 320, 100),
        w("fully", 345, 100), w("allotted.", 380, 100),
        w("TENOR", 40, 160), w("FXD4/2011/2", 280, 160),
        *row(["Total", "bids", "Received", "in", "Face", "Value", "(Kshs.", "M)"], "1,000.00", 190),
        *row(["Total", "Number", "of", "Bids", "Received"], "546", 220),
        *row(["Total", "bids", "Received", "at", "Cost", "(Kshs.", "M)"], "13,463.75", 250),
    ])
    p_codes, p_centres = find_header(prose, ["FXD4/2011/002"])
    p_got = _rf(prose, p_codes, p_centres, "2011-12-01", "u")
    p_rec = p_got.get("FXD4/2011/002", {})
    check("the table row wins over the sentence",
          p_rec.get("bidsReceivedKESM"), 13463.75)
    # Two near-miss rows sit directly above the real one. A face value is not a
    # cost and a count of bids is not an amount; no ordering rule makes them so.
    check("a face-value total is refused outright",
          p_rec.get("bidsReceivedKESM") != 1000.0, True)
    check("and a count of bids is never read as money",
          p_rec.get("bidsReceivedKESM") != 546.0, True)
    check("nor is a count mentioned in passing in a sentence",
          p_rec.get("bidsReceivedKESM") != 64.0, True)

    print("a primary auction is unchanged by any of this")
    primary = group_lines([
        w("TENOR", 40, 100), w("FXD1/2022/03", 280, 100),
        *row(["Total", "Amount", "Offered", "(Kshs.", "M)"], "30,000.00", 130),
        *row(["Total", "bids", "Received", "at", "cost", "(Kshs.", "M)"], "7,328.96", 160),
        *row(["Amount", "Accepted", "(Kshs.", "M)"], "1,757.09", 190),
        *row(["Weighted", "Average", "Rate", "of", "Accepted", "Bids", "(%)"], "13.471", 220),
        *row(["Price", "per", "Kshs", "100", "at", "average", "yield"], "97.583", 250),
    ])
    pr_codes, pr_centres = find_header(primary, ["FXD1/2022/003"])
    pr = _rf(primary, pr_codes, pr_centres, "2023-04-24", "u").get("FXD1/2022/003", {})
    check("offered still reads", pr.get("amountOfferedKESM"), 30000.0)
    check("accepted still reads", pr.get("amountAcceptedKESM"), 1757.09)
    check("bids still read", pr.get("bidsReceivedKESM"), 7328.96)
    check("the weighted average still reads", pr.get("weightedAverageRate"), 13.471)
    check("price per 100 still reads, bracket or no bracket", pr.get("pricePer100"), 97.583)

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

        from auction_results import PARSER_VERSION as _PV
        (_Path(tmp) / "auction-results.json").write_text(_json.dumps([
            {"issueCode": "FXD1/2021/005", "auctionDate": "2021-11-15",
             "couponRate": 11.277, "sourceUrl": "https://cbk/a.pdf",
             "parserVersion": _PV},
            {"issueCode": "FXD1/2019/020", "auctionDate": "2021-11-15",
             "couponRate": 12.873, "sourceUrl": "https://cbk/a.pdf",
             "parserVersion": _PV},
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

    print("the rate band must reject truncated digits")
    from auction_results import BANDS, RATE_FLOOR
    # Every value below 6 in the live archive is an artefact of CBK's
    # split-digit rendering — 1.0, 1.619, 1.855, 2.0, 2.5 and a 5.0 that was
    # the bond's TENOR read as its coupon. The lowest genuine figure anywhere
    # in the archive, back to 2014, is a 7.78% clearing rate.
    lo, hi = BANDS["couponRate"]
    for artefact in (1.0, 1.619, 1.855, 2.0, 2.5, 5.0):
        check(f"{artefact} is rejected as a truncation", lo <= artefact <= hi, False)
    for genuine in (7.78, 11.0, 12.873, 18.4607):
        check(f"{genuine} is accepted", lo <= genuine <= hi, True)
    check("the floor sits below the lowest genuine figure", RATE_FLOOR < 7.78, True)

    print("a parser change re-reads the old parser's PDFs without deleting its rows")
    from auction_results import PARSER_VERSION
    with tempfile.TemporaryDirectory() as tmp:
        mod.DATA_DIR = _Path(tmp)
        (_Path(tmp) / "auction-results.json").write_text(_json.dumps([
            {"issueCode": "FXD1/2021/005", "auctionDate": "2021-11-15",
             "couponRate": 11.277, "sourceUrl": "https://cbk/new.pdf",
             "parserVersion": PARSER_VERSION},
            # Written before the column-geometry fix: its coupon may be hung on
            # the wrong bond, and no later correctness revisits it.
            {"issueCode": "FXD1/2019/015", "auctionDate": "2023-04-24",
             "couponRate": 11.766, "sourceUrl": "https://cbk/old.pdf"},
        ]))
        recs, seen = mod.load_existing()
        # These two assertions used to require the stale row to be DELETED at
        # load. That is what turned a version bump into a 63% cut in the
        # published archive: 350 records discarded up front, only 130 re-read
        # before the run's file cap and time budget stopped it. The contract is
        # now "re-read the document, keep the row until it is replaced".
        check("every record survives the bump", len(recs), 2)
        check("including the one from the older parser",
              sorted(r["issueCode"] for r in recs),
              ["FXD1/2019/015", "FXD1/2021/005"])
        check("but its PDF is queued to be read again",
              seen, {"https://cbk/new.pdf"})
    mod.DATA_DIR = original

    print("a later page fills gaps but never overwrites the results table")
    doc = {}
    merge_page(doc, {"FXD1/2021/005": {"couponRate": 11.277, "weightedAverageRate": 13.4}})
    # A later page — a repayment schedule, say — mentions the same issue and a
    # stray figure lands in the coupon column. It must not win.
    merge_page(doc, {"FXD1/2021/005": {"couponRate": 1.277, "tenorYears": 5}})
    check("the first page keeps the coupon", doc["FXD1/2021/005"]["couponRate"], 11.277)
    check("the first page keeps the clearing rate",
          doc["FXD1/2021/005"]["weightedAverageRate"], 13.4)
    check("a field only the later page had is still added",
          doc["FXD1/2021/005"]["tenorYears"], 5)
    merge_page(doc, {"IFB1/2022/019": {"couponRate": 12.9}})
    check("a bond first seen on a later page is added",
          doc["IFB1/2022/019"]["couponRate"], 12.9)

    print("a number inside a row LABEL is never read as a value")
    # Straight from a CI run: pricePer100 came out as 10097.583 for
    # FXD1/2019/015 and was dropped by the plausibility band — a real figure
    # lost to a guard meant for corrupt ones. The line reads
    #   "Price per Kshs 100 at average yield 97.583"
    # and the 100 belongs to the label. No content rule can help: 100 is
    # exactly as number-like as 97.583.
    price_pat = dict(FIELDS)["pricePer100"]
    cramped = [w("Price", 66, 200), w("per", 92, 200), w("Kshs", 112, 200), w("100", 148, 200),
               w("at", 166, 200), w("average", 172, 200), w("yield", 176, 200),
               w("97.583", 180, 200)]
    centres, label_x = [105, 184], 64.6
    span = price_pat.search(" ".join(x["text"] for x in cramped)).span()
    skip = label_word_positions(cramped, span)
    check("the label's own 100 is excluded",
          assign_to_columns(cramped, centres, label_x, skip), {1: "97.583"})
    check("without the fix it concatenates, as CI showed",
          assign_to_columns(cramped, centres, label_x), {1: "10097.583"})

    # The other way it fails, and the more dangerous one: when the label's 100
    # falls nearest a DIFFERENT column it is recorded as a phantom price of
    # exactly 100 — which sits inside the band and is never questioned.
    spread = [w("Price", 66, 200), w("per", 92, 200), w("Kshs", 108, 200), w("100", 132, 200),
              w("at", 150, 200), w("average", 160, 200), w("yield", 172, 200),
              w("97.583", 180, 200)]
    span2 = price_pat.search(" ".join(x["text"] for x in spread)).span()
    check("a phantom 100 in the neighbouring column is excluded too",
          assign_to_columns(spread, centres, label_x, label_word_positions(spread, span2)),
          {1: "97.583"})
    check("without the fix it silently passes the band",
          assign_to_columns(spread, centres, label_x), {0: "100", 1: "97.583"})

    print("label_word_positions")
    simple = [w("Coupon", 40, 200), w("Rate", 80, 200), w("(%)", 110, 200), w("13.4", 300, 200)]
    sp = dict(FIELDS)["couponRate"].search(" ".join(x["text"] for x in simple)).span()
    check("covers only the matched label words",
          sorted(simple[i]["text"] for i in label_word_positions(simple, sp)),
          ["Coupon", "Rate"])
    check("never excludes the value", 3 in label_word_positions(simple, sp), False)

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

    # ------------------------------------------------------------------
    # A PARSER_VERSION bump must not empty the published archive.
    #
    # Bumping to v5 discarded all 350 records up front so their PDFs would be
    # re-read. Because a run reads at most MAX_NEW_PER_RUN files inside a time
    # budget, the shipped file fell to 130 — a 63% cut — and the site served a
    # fraction of its own data until later runs refilled it. Coverage figures
    # computed in that window described a rebuild, not the archive.
    #
    # Stale rows must now survive until the document that produced them is
    # actually read again.
    import json as _json, tempfile as _tempfile, pathlib as _pathlib
    import auction_results as _ar

    _tmp = _pathlib.Path(_tempfile.mkdtemp())
    (_tmp / "auction-results.json").write_text(_json.dumps([
        {"id": "a", "issueCode": "FXD1/2020/010", "auctionDate": "2020-01-06",
         "sourceUrl": "u1", "parserVersion": _ar.PARSER_VERSION - 1, "couponRate": 12.0},
        {"id": "b", "issueCode": "FXD1/2021/020", "auctionDate": "2021-02-08",
         "sourceUrl": "u2", "parserVersion": _ar.PARSER_VERSION, "couponRate": 13.0},
        {"id": "c", "issueCode": "FXD1/2019/015", "auctionDate": "2019-03-04",
         "sourceUrl": "u3", "parserVersion": _ar.PARSER_VERSION - 1, "couponRate": 11.0},
    ]))
    _orig = _ar.DATA_DIR
    _ar.DATA_DIR = _tmp
    try:
        _records, _seen = _ar.load_existing()
    finally:
        _ar.DATA_DIR = _orig

    check("a version bump keeps every existing record", len(_records), 3)
    check("only fully-current documents are skipped", sorted(_seen), ["u2"])
    check("stale documents queue for re-reading",
          sorted({"u1", "u2", "u3"} - set(_seen)), ["u1", "u3"])

    print("an auction's offered amount belongs to every bond in it")
    rows = [
        {"issueCode": "FXD1/2022/010", "auctionDate": "2026-07-13", "amountOfferedKESM": 70000.0},
        {"issueCode": "FXD1/2021/020", "auctionDate": "2026-07-13"},
        {"issueCode": "FXD1/2026/030", "auctionDate": "2026-07-13"},
    ]
    out, filled = attribute_auction_level(rows)
    check("the other bonds receive it", filled, 2)
    check("every row now carries the auction total",
          [r.get("amountOfferedKESM") for r in out], [70000.0] * 3)
    check("and every row is marked auction-scoped",
          {r.get("offeredScope") for r in out}, {"auction"})

    # The flag is the point. Summing this column across one auction reports the
    # government seeking 210bn when it sought 70bn — the exact error that made
    # the withdrawn auction note wrong. Copying the figure without saying it is
    # shared would make that mistake easier, not harder.
    print("rows that disagree are left alone rather than guessed at")
    conflicting = [
        {"issueCode": "A", "auctionDate": "2026-01-05", "amountOfferedKESM": 30000.0},
        {"issueCode": "B", "auctionDate": "2026-01-05", "amountOfferedKESM": 12000.0},
        {"issueCode": "C", "auctionDate": "2026-01-05"},
    ]
    out2, filled2 = attribute_auction_level(conflicting)
    check("nothing is filled in", filled2, 0)
    check("the empty row stays empty", out2[2].get("amountOfferedKESM"), None)
    check("and no scope claim is made", out2[2].get("offeredScope"), None)

    print("an auction with no offered figure gains nothing from thin air")
    none_rows = [{"issueCode": "A", "auctionDate": "2026-02-02"},
                 {"issueCode": "B", "auctionDate": "2026-02-02"}]
    _, filled3 = attribute_auction_level(none_rows)
    check("still empty", filled3, 0)

    print("undated records are never grouped together")
    undated = [{"issueCode": "A", "auctionDate": None, "amountOfferedKESM": 5000.0},
               {"issueCode": "B", "auctionDate": None}]
    _, filled4 = attribute_auction_level(undated)
    check("two unrelated auctions are not merged by a shared null", filled4, 0)

    print("a date separated by underscores is still a date")
    # CBK writes DATED_21_03_2016 as often as DATED 21-03-2016. The old pattern
    # anchored on \b, and `_` is a word character, so no boundary ever existed
    # beside it — widening the separator class alone gained nothing.
    check("underscore-separated filename date",
          auction_date_from_name("RE-OPEN_FXD1-2013-10__FXD2-2013-15_DATED_21_03_2016.pdf"),
          "2016-03-21")
    check("hyphens still work", auction_date_from_name("X DATED 15-11-2021.pdf"), "2021-11-15")
    check("dots still work", auction_date_from_name("X DATED 21.09.2020.pdf"), "2020-09-21")
    # An issue code is not a date. FXD_1_2008_20 must not parse as one.
    check("an issue code is not read as a date",
          auction_date_from_name("FXD_1_2008_20.pdf"), None)
    check("a bare year is not a date",
          auction_date_from_name("Results_15_year_Re-open_dated_February_2014.pdf"), None)

    # CBK's older filenames carry spaces, so the listing's hrefs arrive
    # percent-encoded — and %20 puts a DIGIT immediately before the date. The
    # pattern refuses a date that runs on from a digit, which is what keeps a
    # tenor like FXD1-2012-020 from being read as one, so these were rejected
    # for an encoding artefact rather than for anything in the name.
    check("a percent-encoded name still yields its date",
          auction_date_from_name("results%20fxd1-2014-5%20dated%2028.04.2014.pdf"),
          "2014-04-28")
    check("and again where the encoding runs together",
          auction_date_from_name(
              "results%205-%20year%20%2020year%20re-open%20dated%2023.06.2014.pdf"),
          "2014-06-23")
    check("hyphenated dates survive decoding too",
          auction_date_from_name("results%2012-year%20ifb1-2014-12%20dated%2027-10-2014.pdf"),
          "2014-10-27")
    # Decoding must not INVENT a date. %20 is a space, not a separator, so a
    # name with no date in it still has none after decoding.
    check("decoding does not manufacture a date",
          auction_date_from_name("Results%2012%20yr%20tap%20sales.pdf"), None)

    print("a spelled-out month is a date; a month with no day is not")
    check("month before day", auction_date_from_name("RESULTS Sept 3, 2019.pdf"),
          "2019-09-03")
    check("day before month", auction_date_from_name("RESULTS dated 15 March 2021.pdf"),
          "2021-03-15")
    check("full month name, ordinal day",
          auction_date_from_name("results 5 year dated november 25th 2013.pdf"),
          "2013-11-25")
    check("september is not consumed as sep with a dangling tember",
          auction_date_from_name("RESULTS September 3 2019.pdf"), "2019-09-03")
    # Sixteen files in the archive name a month and a year and no day. Writing
    # the first of the month would put a day in the field that no document
    # anywhere claims, and every consumer would read it as one we had read.
    check("a month and a year is still not a date",
          auction_date_from_name("Results 15 year re-open dated november 2014.pdf"), None)
    check("nor is a month sitting after a tenor",
          auction_date_from_name("Results 2 year AUGUST 2012.pdf"), None)

    # The trap this pattern exists inside. An issue code ends in its TENOR, so
    # "FXD1-2019-15 March 2021" reads as a fifteen-year bond auctioned in March,
    # not an auction held on the 15th. The day must not run on from a digit or a
    # separator — which costs one real date in today's archive
    # ("fxd 4-2013-2 december 2013") and is still the right trade: a missing
    # date is visible and a wrong one is not.
    check("a tenor is never read as the day of the month",
          auction_date_from_name("RESULTS FXD1-2019-15 March 2021.pdf"), None)
    check("and the cost of that guard is accepted, not hidden",
          auction_date_from_name("results 2 year fxd 4-2013-2 december 2013.pdf"), None)
    check("an impossible spelled-out date is refused like a numeric one",
          auction_date_from_name("RESULTS FEB 31 2020.pdf"), None)

    if failures:
        print(f"\n{len(failures)} FAILURE(S):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll auction results parser tests passed.")


if __name__ == "__main__":
    main()
