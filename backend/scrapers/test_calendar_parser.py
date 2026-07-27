"""Tests for calendar_parser, built from lines probe_calendar.py actually printed.

Every fixture below is verbatim from the live CBK listing on 27 July 2026 —
including the malformed "25-Jun 2026", which is CBK's own missing hyphen and
not a typo here. A fixture written from memory of an older layout is precisely
what let cbk_parser.py go stale without anything failing.
"""
import sys

from calendar_parser import (
    all_dmy,
    normalise_code,
    parse_dmy,
    parse_prospectus_text,
)

failures = []


def check(label, actual, expected):
    if actual != expected:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")
    else:
        print(f"  ok  {label}")


# Verbatim from the probe output for
# "PROSPECTUS FOR RE-OPENED 10,20 AND 30-YEARS FIXED COUPON".
THREE_BOND = """
PROSPECTUS FOR RE-OPENED 10,20 AND 30-YEARS FIXED COUPON
ISSUE NUMBER (S) FXD1/2022/010 FXD1/2021/020 FXD1/2026/030
COUPON RATES (%) 13.4900 13.4440 12.5000
WITHHOLDING TAX (%) 10 10 10
MATURITY DATES 03-May-2032 22-Jul-2041 13-Mar-2056
PERIOD OF SALE 25-Jun 2026 to 08-Jul-2026
BID SUBMISSION DEADLINE Wednesday, 08-Jul-2026, by 10.00 am
AUCTION DATE Wednesday, 08-Jul-2026
SETTLEMENT DATE Monday, 13-Jul-2026
Secondary trading in multiples of KES 50,000.00 commence on Monday, 13/07/2026
"""

# Verbatim from the probe output for the June tap sale.
TAP = """
TAP SALE OF TREASURY BONDS ISSUE Nos. FXD1/2018/020 AND FXD1/2021/025 DATED 29/06/2026
in the prospectus issued value date 22/06/2026. The Tap Sale will be offered on a
first- come -first- served basis.
Average Yield FXD1/2018/020 -13.9885%
FXD1/2021/025- 14.8636%
Coupon Rate FXD1/2018/020 - 13.2000%
FXD1/2021/025- 13.9240%
"""


def main():
    print("date reading")
    check("hyphenated", parse_dmy("03-May-2032"), "2032-05-03")
    # CBK's own missing hyphen. A pattern requiring two hyphens reads no open
    # date at all on the live July prospectus.
    check("CBK's malformed '25-Jun 2026'", parse_dmy("25-Jun 2026"), "2026-06-25")
    check("with a weekday in front", parse_dmy("Wednesday, 08-Jul-2026"), "2026-07-08")
    check("unreadable is None", parse_dmy("sometime in July"), None)
    check("impossible date is None", parse_dmy("31-Feb-2026"), None)
    check("both ends of PERIOD OF SALE",
          all_dmy("PERIOD OF SALE 25-Jun 2026 to 08-Jul-2026"),
          ["2026-06-25", "2026-07-08"])

    print("\ncode normalisation")
    check("pads the tenor", normalise_code("FXD1/2022/10"), "FXD1/2022/010")
    check("leaves a padded code alone", normalise_code("FXD1/2022/010"), "FXD1/2022/010")
    check("keeps a fractional tenor", normalise_code("IFB1/2023/6.5"), "IFB1/2023/006.5")

    print("\nthe three-bond prospectus")
    out = parse_prospectus_text(THREE_BOND)
    recs = out["records"]
    check("one record per BOND, not per document", len(recs), 3)
    check("codes in order",
          [r["issueCode"] for r in recs],
          ["FXD1/2022/010", "FXD1/2021/020", "FXD1/2026/030"])
    # The whole point of reading the row positionally: coupon n belongs to code n.
    check("coupons align with their own bonds",
          [r["couponRate"] for r in recs], [13.49, 13.444, 12.5])
    check("maturities align too",
          [r["maturityDate"] for r in recs],
          ["2032-05-03", "2041-07-22", "2056-03-13"])
    check("offer opens, read from PERIOD OF SALE", recs[0]["offerOpenDate"], "2026-06-25")
    check("offer closes, the tail of the same line", recs[0]["offerCloseDate"], "2026-07-08")
    check("auction date", recs[0]["auctionDate"], "2026-07-08")
    check("settlement date", recs[0]["settlementDate"], "2026-07-13")
    # cbk_parser.py writes 0 here. Zero offered is a claim; absent is the truth.
    check("no amount is None, not zero", recs[0]["amountOfferedKES"], None)
    check("ids are distinct so two bonds cannot collide",
          len({r["id"] for r in recs}), 3)
    check("tenor from the code", [r["tenorYears"] for r in recs], [10.0, 20.0, 30.0])

    print("\nrefusals")
    tap = parse_prospectus_text(TAP)
    check("a tap sale yields no records", tap["records"], [])
    check("and says why", "tap sale" in (tap["skipped"] or ""), True)

    no_auction = parse_prospectus_text(
        "ISSUE NUMBER (S) FXD1/2022/010\nPERIOD OF SALE 25-Jun 2026 to 08-Jul-2026\n")
    check("no auction date means no record", no_auction["records"], [])
    check("and says why", "AUCTION DATE" in (no_auction["skipped"] or ""), True)

    check("empty input does not raise", parse_prospectus_text("")["records"], [])

    # A wrapped or mis-read row leaves the counts unequal. Guessing which coupon
    # belongs to which bond is how a reader ends up with the wrong cash flows,
    # so the figure is dropped and the record still carries its dates.
    mismatch = parse_prospectus_text("""
ISSUE NUMBER (S) FXD1/2022/010 FXD1/2021/020 FXD1/2026/030
COUPON RATES (%) 13.4900 13.4440
AUCTION DATE Wednesday, 08-Jul-2026
""")
    check("three bonds still parsed", len(mismatch["records"]), 3)
    check("but a short coupon row is refused, not guessed at",
          [r["couponRate"] for r in mismatch["records"]], [None, None, None])
    check("the dates survive the refusal",
          mismatch["records"][0]["auctionDate"], "2026-07-08")

    if failures:
        print(f"\n{len(failures)} FAILURE(S):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll calendar parser tests passed.")


if __name__ == "__main__":
    main()
