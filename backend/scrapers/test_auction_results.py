"""Tests for the auction results parser. Run with: python test_auction_results.py

The fixture reproduces the exact hazard the live probe found: pdfplumber
renders CBK's coupon row as

    Coupon Rate (%)   1 1.277   1 2.873

which is TWO coupons, 11.277% and 12.873%, each split by an injected space.
Any parser that reads the text linearly finds four numbers and gets all four
wrong. These tests exist to keep that from ever shipping.
"""
import sys

from auction_results import (
    assign_to_columns, cell_value, codes_in_name, find_header, group_lines,
    normalise_code, results_section,
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

    if failures:
        print(f"\n{len(failures)} FAILURE(S):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll auction results parser tests passed.")


if __name__ == "__main__":
    main()
