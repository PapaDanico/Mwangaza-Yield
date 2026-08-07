"""The register reconciler, which had no tests and decides a tax band.

WHY THIS MODULE IS WORTH TESTING MORE THAN ITS SIZE SUGGESTS

registry.py rewrites bonds.json from CBK's own securities register — ISIN,
issue date, maturity date. Maturity drives the cash-flow schedule, so it moves
yield to maturity, the coupon calendar, ladder rungs and every goal projection
built on them. Our dates were previously off by up to 119 days.

What makes it delicate is not what it writes but what it REFUSES to write, and
those refusals are exactly the kind of thing that survives review and dies in a
refactor:

  tenorYears is not recomputed from the dates. FXD1/2022/10 spans 9.97 years,
  which would flip it from the 10% withholding band to the 15% band and
  understate its net yield for every user. The bond is issued as a ten-year
  bond and taxed as one.

  minInvestmentKES is not taken from the register. The "Individual Nominal
  Value" column reads 50,000 for most securities and 1 for a handful. Writing
  that through would tell a reader they can buy IFB1/2018/15 for one shilling.

  A bond whose register span disagrees with its coded tenor by more than a
  year is SKIPPED, not corrected — that is the signature of having matched the
  wrong security, and a confident wrong date is worse than a known-missing one.

Each of those is asserted below against a mutation that would undo it.
"""
import csv
import sys
import tempfile
from pathlib import Path

from registry import load_register, reconcile

failures: list = []


def check(cond, msg):
    if not cond:
        failures.append(msg)


# Verbatim column names from backend/reference/dhowcsd-securities.csv. Inventing
# them would test the parser against my idea of the file, which is the mistake
# the QEBR fixtures already made once.
COLUMNS = ["Issue Number", "ISIN", "Issuer", "Issue date", "Maturity date",
           "Type", "Individual Nominal Value", "Currency"]


def write_csv(rows) -> Path:
    tmp = Path(tempfile.mkdtemp()) / "register.csv"
    with tmp.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    return tmp


def row(code, isin="KE1000001493", issue="30 Jun 2018", maturity="25 Jun 2028",
        nominal="50,000"):
    return {"Issue Number": code, "ISIN": isin, "Issuer": "GOVERNMENT OF KENYA",
            "Issue date": issue, "Maturity date": maturity,
            "Type": "Treasury Bonds", "Individual Nominal Value": nominal,
            "Currency": "KES"}


def test_load_register():
    path = write_csv([
        row("FXD1/2018/010"),
        row("IFB1/2023/6.5", isin="KE2000000001", issue="20 Feb 2023",
            maturity="14 Aug 2029", nominal="50,000"),
        # A row with no ISIN is not a security we can key on; it must be
        # dropped rather than stored under an empty string.
        row("JUNK/2020/005", isin="   "),
    ])
    reg = load_register(path)

    check("FXD1/2018/010" in reg, f"ten-year code missing from register: {list(reg)}")
    # The fractional tenor must survive: 6.5-year and 6-year bonds are
    # different instruments with different maturities.
    check("IFB1/2023/006.5" in reg,
          f"fractional code was lost or rounded: {list(reg)}")
    check(len(reg) == 2, f"the ISIN-less row was not dropped: {list(reg)}")

    entry = reg["FXD1/2018/010"]
    check(entry["issueDate"] == "2018-06-30", f"issue date parsed as {entry['issueDate']}")
    check(entry["maturityDate"] == "2028-06-25", f"maturity parsed as {entry['maturityDate']}")
    check(entry["minInvestmentKES"] == 50000,
          f"nominal value parsed as {entry['minInvestmentKES']} — the comma was not stripped")


def test_reconcile_applies_the_register():
    reg = load_register(write_csv([row("FXD1/2018/010")]))
    bonds = [{"issueCode": "FXD1/2018/10", "tenorYears": 10,
              "isin": None, "issueDate": "2018-01-01", "maturityDate": "2028-01-01",
              "minInvestmentKES": 50000, "couponRate": 12.5}]

    out, changes, unmatched = reconcile(bonds, reg)

    # The unpadded code in bonds.json must match the padded one in the register.
    check(unmatched == [], f"a code that should match was reported unmatched: {unmatched}")
    check(out[0]["isin"] == "KE1000001493", "ISIN was not applied")
    check(out[0]["maturityDate"] == "2028-06-25",
          f"maturity was not corrected: {out[0]['maturityDate']}")
    check(len(changes) == 3, f"expected 3 field changes, got {changes}")
    # couponRate is not in the register and must be left alone.
    check(out[0]["couponRate"] == 12.5, "couponRate was touched")


def test_tenor_is_never_recomputed():
    """THE TAX BAND. 9.97 years is still a ten-year bond.

    Recomputing tenorYears from (maturity - issue) would flip FXD1/2018/010
    across the 10%/15% withholding boundary and understate its net yield for
    every user. The register is authoritative for dates and NOT for tenor.
    """
    reg = load_register(write_csv([row("FXD1/2018/010")]))
    bonds = [{"issueCode": "FXD1/2018/10", "tenorYears": 10, "isin": None,
              "issueDate": "x", "maturityDate": "y", "minInvestmentKES": 50000}]
    out, _, _ = reconcile(bonds, reg)
    check(out[0]["tenorYears"] == 10,
          f"tenorYears was recomputed to {out[0]['tenorYears']} — that is a tax band change")


def test_minimum_investment_is_never_taken_from_the_register():
    """THE ONE-SHILLING BOND.

    The register's "Individual Nominal Value" reads 1 for a handful of
    securities, including IFB1/2018/15. That is the unit denomination, not the
    smallest permitted subscription, and writing it through would tell a reader
    they can buy the bond for one shilling.
    """
    # THE DATES MUST MATCH A 15-YEAR TENOR, or the span gate skips the bond
    # and this test passes because nothing was applied at all.
    #
    # That is what the first version did: it used the default 2018-2028 dates
    # against a coded 15-year tenor, the gate fired at "9.99y vs 15y", the bond
    # was skipped, and minInvestmentKES stayed 50000 for a reason that had
    # nothing to do with the refusal being tested. Caught by reading the
    # stderr, not the exit code — the suite was green either way.
    reg = load_register(write_csv([
        row("IFB1/2018/015", issue="19 Feb 2018", maturity="03 Feb 2033", nominal="1")]))
    check(reg["IFB1/2018/015"]["minInvestmentKES"] == 1,
          "the fixture no longer reproduces the 1-shilling column, so the "
          "assertion below cannot fail and proves nothing")

    bonds = [{"issueCode": "IFB1/2018/15", "tenorYears": 15, "isin": None,
              "issueDate": "x", "maturityDate": "y", "minInvestmentKES": 50000}]
    out, changes, unmatched = reconcile(bonds, reg)
    # The bond must actually have been RECONCILED, or the assertion below is
    # about a bond nothing touched.
    check(unmatched == [], f"the bond was skipped, so this test proves nothing: {unmatched}")
    check(any(c[1] == "isin" for c in changes),
          f"the register was not applied at all, so the refusal is untested: {changes}")
    check(out[0]["minInvestmentKES"] == 50000,
          f"minInvestmentKES was overwritten with {out[0]['minInvestmentKES']} — "
          f"the register's nominal value reached a user-facing figure")


def test_a_wild_span_mismatch_is_skipped_not_applied():
    """Matching the WRONG security is the failure this gate exists for.

    A register entry whose span disagrees with the coded tenor by more than a
    year means the codes collided, not that the bond is shorter. Applying it
    would write a confident wrong maturity, which is worse than leaving a
    known-missing one.
    """
    # Coded as a 10-year bond; the register entry spans about 2 years.
    reg = load_register(write_csv([
        row("FXD1/2018/010", issue="30 Jun 2018", maturity="25 Jun 2020")]))
    bonds = [{"issueCode": "FXD1/2018/10", "tenorYears": 10, "isin": None,
              "issueDate": "2018-01-01", "maturityDate": "2028-01-01",
              "minInvestmentKES": 50000}]

    out, changes, unmatched = reconcile(bonds, reg)

    check(unmatched == ["FXD1/2018/10"],
          f"the mismatched bond was not reported unmatched: {unmatched}")
    check(changes == [], f"a mismatched register entry was applied: {changes}")
    check(out[0]["maturityDate"] == "2028-01-01",
          f"the bond's maturity was overwritten from a wrong match: {out[0]['maturityDate']}")


def test_within_a_year_is_still_applied():
    """The gate must not be so tight that it rejects normal bonds.

    FXD1/2022/10 spans 9.97 years — settlement and business-day conventions,
    not a shorter loan. A gate that refused that would silently stop the
    reconciler doing its job, and every date would stay wrong while the run
    looked clean. This is the other half of the guard, and it is the half a
    tightened threshold would break.
    """
    reg = load_register(write_csv([
        row("FXD1/2022/010", issue="27 Jun 2022", maturity="10 Jun 2032")]))
    bonds = [{"issueCode": "FXD1/2022/10", "tenorYears": 10, "isin": None,
              "issueDate": "x", "maturityDate": "y", "minInvestmentKES": 50000}]
    out, changes, unmatched = reconcile(bonds, reg)
    check(unmatched == [], f"a normal ten-year bond was rejected by the span gate: {unmatched}")
    check(out[0]["maturityDate"] == "2032-06-10", "a valid correction was not applied")


def test_an_unknown_code_is_reported_not_invented():
    reg = load_register(write_csv([row("FXD1/2018/010")]))
    bonds = [{"issueCode": "FXD9/1999/003", "tenorYears": 3, "isin": None,
              "issueDate": "x", "maturityDate": "y", "minInvestmentKES": 50000}]
    out, changes, unmatched = reconcile(bonds, reg)
    check(unmatched == ["FXD9/1999/003"], f"unmatched not reported: {unmatched}")
    check(out[0]["isin"] is None, "an ISIN was invented for an unmatched bond")


def main() -> int:
    test_load_register()
    test_reconcile_applies_the_register()
    test_tenor_is_never_recomputed()
    test_minimum_investment_is_never_taken_from_the_register()
    test_a_wild_span_mismatch_is_skipped_not_applied()
    test_within_a_year_is_still_applied()
    test_an_unknown_code_is_reported_not_invented()

    for f in failures:
        print(f"FAIL: {f}", file=sys.stderr)
    print(f"registry.py: parsing, reconciliation, and the three refusals "
          f"(tenor, minimum, wild span) — {len(failures)} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
