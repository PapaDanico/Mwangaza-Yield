"""The QEBR parser must read the three it can, and refuse the fourth.

FIXTURES ARE VERBATIM, NOT INVENTED

Every string below is copied from probe_qebr.py's output against the real Q3
and Q2 FY2025/26 documents on a CI runner. Writing plausible-looking fixtures
would test the regex against my own idea of the document, which is exactly the
mistake that put a bank-discount formula in this repository marked "verified".

THE REFUSAL IS THE POINT

`Interest / government revenue` is the panel's oldest figure at 1,314 days, so
it is the one most worth replacing — which is precisely why it is the one most
likely to be forced. The two figures a keyword match finds are:

    "foreign interest payments amounted to ksh. 104.7 billion"
    "shortfall recorded in ordinary revenue of ksh. 110.6 billion"

FOREIGN interest, not total. And a SHORTFALL against target, not the revenue
level. 104.7 / 110.6 = 94.7%, against a real figure nearer a third — a wrong
number that reads as a fiscal emergency and carries the Treasury's name.

So this file asserts the parser stays silent on BOTH halves even when a text
containing both is handed to it. A test that only checked the happy path would
pass just as well against a parser that had quietly started dividing them.
"""
import sys

from qebr_parser import (INDICATORS, current_account_pct_gdp, extract,
                         gdp_growth, import_cover, interest_over_revenue,
                         reporting_period)

# Verbatim from the runner, Q3 FY2025/26.
Q3 = """
1 economic growth 1. in 2025, the economy registered a real gdp growth rate of
4.6 percent compared with 4.7 percent recorded in 2024 with all the sectors
registering positive growth. 4. foreign exchange reserves stood at us$ 12,013.9
million in march 2025. this level of reserves represented 5.7 months of import
cover, compared to 4.7 months over the same period in 2025, and continues to
provide an adequate buffer against short term shocks. third quarter fy 2025/2026
"""

# Verbatim from the runner, Q2 FY2025/26 — carries the current account figure
# AND both halves of the ratio that must NOT be computed.
Q2 = """
5. current account the current account deficit stood at us$ 3,298.9 million
(2.4 percent of gdp) in december 2025, compared with a deficit of us$ 2,714.2
million in december 2024. *provisional source of data: national treasury 36.
foreign interest payments amounted to ksh. 104.7 billion, an increase from ksh.
101.7 billion paid over the same period in the fy 2024/25. this performance is
attributed to shortfall recorded in ordinary revenue of ksh. 110.6 billion and a
shortfall in collection of the ministerial a-i-a. second quarter fy 2025/2026
"""

failures = []


def check(cond, msg):
    if not cond:
        failures.append(msg)


def main() -> int:
    # --- the three it takes -------------------------------------------------
    check(gdp_growth(Q3) == 4.6, f"gdp_growth = {gdp_growth(Q3)}, expected 4.6")
    check(import_cover(Q3) == 5.7, f"import_cover = {import_cover(Q3)}, expected 5.7")
    # NEGATIVE: the document says deficit, and a deficit published as a
    # positive number reads as a surplus — the one error here that flips the
    # meaning rather than shifting the value.
    check(current_account_pct_gdp(Q2) == -2.4,
          f"current account = {current_account_pct_gdp(Q2)}, expected -2.4")

    # --- the refusal, asserted against a text containing BOTH halves --------
    check(interest_over_revenue(Q2) is None,
          "interest_over_revenue returned a value — the only figures available "
          "are FOREIGN interest and a revenue SHORTFALL, and their quotient is "
          "94.7% against a real figure nearer a third")
    check(not any(i[0] == "qebr-interest-revenue" for i in INDICATORS),
          "Interest / government revenue is wired into INDICATORS, so it would "
          "be published from figures that do not mean what the label says")
    for rec in extract(Q2):
        check("interest" not in rec["id"],
              f"extract() emitted {rec['id']} — the refused ratio reached output")

    # --- each extractor must be able to say NO ------------------------------
    # A parser that always returns a number is not reading; it is asserting.
    empty = "the minister presented the report to the national assembly."
    check(gdp_growth(empty) is None, "gdp_growth invented a figure from prose")
    check(import_cover(empty) is None, "import_cover invented a figure")
    check(current_account_pct_gdp(empty) is None, "current account invented a figure")
    check(extract(empty) == [], "extract() produced records from a text with no figures")

    # --- the label must belong to the number --------------------------------
    # Anchoring matters: the documents quote several growth rates. A pattern
    # keyed on "growth rate of N" alone would take a sectoral figure.
    # PHRASED SO A LOOSENED PATTERN WOULD ACTUALLY TAKE IT.
    #
    # The first version of this fixture read "sub-sector grew by 5.2 percent",
    # which no version of the pattern matches — tight or loose. It therefore
    # passed against a deliberately broken parser and proved nothing: a guard
    # that cannot fire in the case it exists to detect, which is the defect
    # this repository keeps finding in itself.
    #
    # "recorded a growth rate of" is the shape a pattern keyed on
    # "growth rate of N percent" WOULD swallow, and the documents are full of
    # sectoral figures written that way. Verified by mutation: loosening
    # gdp_growth to drop the "real gdp" anchor now turns this red.
    sectoral = ("the primary sector recorded a growth rate of 5.2 percent in the "
                "third quarter, while services expanded more slowly")
    check(gdp_growth(sectoral) is None,
          "gdp_growth matched a SECTORAL growth rate as though it were the "
          "headline real GDP figure — the documents quote several, and they "
          "are different numbers for different things")
    # The reserves sentence carries a comparison in the same clause.
    check(import_cover(Q3) != 4.7,
          "import_cover took the prior-year comparison instead of the current "
          "figure — both are 'months' in the same sentence")

    # --- period comes from the document ------------------------------------
    check(reporting_period(Q3) == "Third Quarter FY 2025/2026",
          f"period = {reporting_period(Q3)!r}")
    check(reporting_period(Q2) == "Second Quarter FY 2025/2026",
          f"period = {reporting_period(Q2)!r}")

    # --- records are shaped like the ones already in context.json -----------
    recs = extract(Q3)
    check(len(recs) == 2, f"expected GDP growth and import cover from Q3, got {len(recs)}")
    for rec in recs:
        for field in ("id", "label", "value", "unit", "asOf", "source", "sourceUrl", "note"):
            check(field in rec and rec[field] not in (None, ""),
                  f"{rec.get('label')} missing {field}")
        check("Treasury" in rec["source"], "source must name the Treasury")

    # --- the cross-check that makes the GDP figure believable ---------------
    # The World Bank puts 2025 GDP growth at 4.63; the QEBR says 4.6. Two
    # independent sources agreeing to a rounding is worth more than the regex.
    check(abs(gdp_growth(Q3) - 4.63) < 0.1,
          "the QEBR GDP growth figure no longer agrees with the World Bank's "
          "4.63 for 2025 — check which changed before trusting either")

    for f in failures:
        print(f"FAIL: {f}", file=sys.stderr)
    print(f"{len(extract(Q3)) + len(extract(Q2))} records from two real "
          f"documents, 1 ratio refused, {len(failures)} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
