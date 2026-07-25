"""Tests for the universe expansion. Run with: python test_expand_universe.py

The rule under test is the one that matters: a bond with no coupon rate is
NOT added. Without a coupon there is no cash-flow schedule, so no yield, no
accrued interest and no settlement cost — every number the app exists to
produce. Listing such a bond would put an uncalculable row in front of
someone, or invite a placeholder coupon that looks real.
"""
import sys

from expand_universe import coupon_for, build_bond, display_code, normalise

failures = []


def check(label, actual, expected):
    if actual != expected:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")
    else:
        print(f"  ok  {label}")


REG = {"isin": "KE7000009436", "issueDate": "2022-05-16", "maturityDate": "2032-05-03"}


def main():
    print("code normalisation")
    check("register padding is applied", normalise("FXD1/2022/10"), "FXD1/2022/010")
    check("already-padded codes are stable", normalise("IFB1/2022/019"), "IFB1/2022/019")
    check("humans see the unpadded form", display_code("FXD1/2022/010"), "FXD1/2022/10")

    print("no coupon, no listing — the whole rule")
    check("a bond with no coupon is refused",
          build_bond("FXD1/2022/010", REG, {"auctionDate": "2026-07-13"}), None)
    check("an empty auction record is refused",
          build_bond("FXD1/2022/010", REG, {}), None)

    print("a priceable bond is built correctly")
    b = build_bond("FXD1/2022/010", REG, {
        "couponRate": 13.49, "weightedAverageRate": 14.02,
        "auctionDate": "2026-07-13", "sourceUrl": "https://example/RESULTS.pdf",
    })
    check("identity comes from the register", b["isin"], "KE7000009436")
    check("dates come from the register", b["maturityDate"], "2032-05-03")
    check("the issue code is shown the way CBK writes it", b["issueCode"], "FXD1/2022/10")
    # The register's dates make this span 9.97 years. Deriving tenor from them
    # would move the bond from the 10% withholding band to 15%.
    check("tenor is the ISSUED tenor, from the code", b["tenorYears"], 10)
    check("the coupon comes from the auction", b["couponRate"], 13.49)
    check("the yield is what the auction cleared at", b["ytmGross"], 14.02)
    check("the yield carries its date", b["ytmAsOf"], "2026-07-13")
    check("a fixed-coupon bond is taxable", b["taxExempt"], False)

    print("infrastructure bonds are tax-exempt")
    ifb = build_bond("IFB1/2022/019", REG, {"couponRate": 12.0, "auctionDate": "2026-01-01"})
    check("IFB is flagged tax-exempt", ifb["taxExempt"], True)
    check("IFB category is set", ifb["category"], "IFB")
    check("its name says infrastructure", "Infrastructure" in ifb["name"], True)

    print("yield falls back to the coupon only when no clearing rate exists")
    par = build_bond("FXD1/2022/010", REG, {"couponRate": 13.49, "auctionDate": "2026-07-13"})
    check("ytm falls back to the coupon", par["ytmGross"], 13.49)

    print("the coupon belongs to the BOND, not to the latest auction")
    # The wrong number that reached production. FXD1/2012/15 reported 11.0 in
    # June 2019 and 1.0 in December 2020 — the latter being "11.000" with its
    # leading digit lost to CBK's split-digit rendering. Taking the newest
    # record published a 1% coupon on a fifteen-year Kenyan government bond.
    history = [
        {"couponRate": 11.0, "auctionDate": "2019-06-17"},
        {"couponRate": 1.0, "auctionDate": "2020-12-14"},
        {"auctionDate": "2020-12-28"},
    ]
    check("a disagreement resolves toward the larger, never the truncated",
          coupon_for("FXD1/2012/015", history), 11.0)
    check("agreement is left alone",
          coupon_for("X", [{"couponRate": 12.5}, {"couponRate": 12.5}]), 12.5)
    check("the most-reported value wins over a lone outlier",
          coupon_for("X", [{"couponRate": 13.0}, {"couponRate": 13.0},
                           {"couponRate": 14.0}]), 13.0)
    check("no coupon anywhere stays None", coupon_for("X", [{"auctionDate": "2020-01-01"}]), None)

    # And the bond still refuses to be listed when nothing reported a coupon.
    check("a bond with no coupon is not built",
          build_bond("FXD1/2012/015", REG, {"auctionDate": "2020-12-28"}, None), None)

    if failures:
        print(f"\n{len(failures)} FAILURE(S):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll universe expansion tests passed.")


if __name__ == "__main__":
    main()
