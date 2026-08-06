"""Tests for cpi_history_parser.

No pytest dependency — this runs anywhere the scrapers run, matching
test_cbr_history.py. The scrapers' requirements.txt deliberately carries no
test framework so a parser can be checked on any machine that can run it.

THE FIXTURE REPRODUCES THE REAL PAGE'S TRAPS, not a tidy table:

  * the header row appears TWICE (rows 0 and 1 on centralbank.go.ke)
  * the decoy column, `Annual Average Inflation`, sits BEFORE the one we want
    and holds equally plausible percentages
  * a footer row with no year
  * a summary row whose month IS a real month, which only the year check can
    reject
  * the same month twice, as a revised print would appear

The last two are there because of what mutation testing found. With the first
version of this fixture, deleting the year guard and deleting the dedupe both
left every test green — the suite was protecting neither. A fixture without a
trap cannot catch the code that would fall for it.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from cpi_history_parser import (  # noqa: E402
    parse, corroborates, latest_month, WANTED_COL, DECOY_COL,
)

HEADER = ("<tr><th>Year</th><th>Month</th><th>Annual Average Inflation</th>"
          "<th>12-Month Inflation</th></tr>")

PAGE = f"""
<html><body>
  <table class="menu"><tr><td>Home</td><td>About</td></tr></table>
  <table class="display responsive nowrap data-t wpDataTable">
    {HEADER}
    {HEADER}
    <tr><td>2026</td><td>July</td><td>5.08</td><td>6.49</td></tr>
    <tr><td>2026</td><td>June</td><td>4.88</td><td>6.41</td></tr>
    <tr><td>2026</td><td>May</td><td>4.66</td><td>6.68</td></tr>
    <tr><td>2005</td><td>January</td><td>12.27</td><td>14.87</td></tr>
    <tr><td>Source: KNBS</td><td></td><td></td><td></td></tr>
    <tr><td>Average</td><td>July</td><td>7.77</td><td>8.88</td></tr>
    <tr><td>2026</td><td>May</td><td>9.99</td><td>9.99</td></tr>
  </table>
</body></html>
"""

FAILURES: list = []


def check(condition: bool, message: str) -> None:
    if not condition:
        FAILURES.append(message)


def rows_for(rows: list, when: str) -> list:
    return [r for r in rows if r["date"] == when]


def main() -> int:
    rows = parse(PAGE)

    # THE WHOLE POINT. Both columns are plausible; only one is the rate.
    july = rows_for(rows, "2026-07-01")
    check(len(july) == 1, f"expected one July 2026 row, got {len(july)}")
    if july:
        check(july[0]["value"] == 6.49,
              f"July 2026 should be 6.49 (12-Month Inflation), got {july[0]['value']}")
        # Stated separately so a failure says WHICH mistake was made.
        check(july[0]["value"] != 5.08,
              "read the Annual Average column instead of 12-Month Inflation")

    # Guards the assertion above from becoming vacuous. If the fixture ever
    # loses its decoy column, `!= 5.08` would pass against a parser with
    # nothing to fall for, and the real protection would be gone silently.
    check(DECOY_COL == "annual average inflation", "DECOY_COL drifted")
    check(WANTED_COL == "12-month inflation", "WANTED_COL drifted")
    check("Annual Average Inflation" in PAGE, "fixture lost its decoy column")
    check("5.08" in PAGE, "fixture lost its decoy value")

    # The duplicated header row. A positional parser reading from row 1 takes
    # 'Month' as a year and drops it on a ValueError, which looks like nothing
    # happening at all.
    check(len(rows) == 4, f"expected 4 data rows, got {len(rows)}: {rows}")
    check(all(r["value"] > 0 for r in rows), "a header row was ingested as data")

    # The footer.
    check(not any("Source" in r["id"] for r in rows), "ingested the footer row")

    # The case ONLY the year check can catch: 'Average / July / 7.77 / 8.88'
    # passes the month lookup cleanly.
    check(not any(r["value"] == 8.88 for r in rows), "ingested a summary row")
    check(all(r["date"][:4].isdigit() for r in rows), "a row has a non-numeric year")

    # A repeated month. The page lists newest first, so the first occurrence is
    # the current print and must win.
    may = rows_for(rows, "2026-05-01")
    check(len(may) == 1, f"duplicate month survived: {may}")
    if may:
        check(may[0]["value"] == 6.68,
              f"kept the later duplicate ({may[0]['value']}) instead of the first")

    check([r["date"] for r in rows] == ["2005-01-01", "2026-05-01", "2026-06-01", "2026-07-01"],
          f"dates wrong or unsorted: {[r['date'] for r in rows]}")

    # A reader auditing the JSON must see WHICH of the two published series
    # this is, without opening the scraper.
    check(all(r["series"] == "12-Month Inflation" for r in rows), "series not named in the data")
    check(all(r["indicator"] == "CPI" for r in rows), "found the navigation table")

    # A renamed heading must STOP the parser, not make it guess. Taking "the
    # third column" when the header no longer matches is how a rolling average
    # gets published as a rate.
    try:
        parse(PAGE.replace("12-Month Inflation", "Headline Rate"))
        FAILURES.append("parsed a page whose value column it does not recognise")
    except ValueError as exc:
        check("refusing to guess" in str(exc), f"unhelpful refusal message: {exc}")

    # The corroboration against the figure macro_parser scrapes independently.
    check(corroborates(rows, 6.49, "2026-07"), "corroboration rejected the true value")
    check(not corroborates(rows, 5.08, "2026-07"),
          "corroboration accepted the DECOY value — it is not checking anything")
    check(not corroborates(rows, 6.49, "2019-03"),
          "corroboration returned true for a month that is not present")

    # THE ASSERTION THIS SUITE DID NOT HAVE, AND THE BUG IT WOULD HAVE CAUGHT.
    #
    # Every test above checked that corroboration REJECTS wrong things. None
    # checked that the caller feeds it a month that exists. So main() passed
    # today's month, CBK's table lags by one, and a completely correct series
    # printed "DISAGREES — one of the two reads the wrong column" on every run.
    #
    # A guard that fires on every healthy run is as useless as one that cannot
    # fire: the reader learns to skip it, and it is silent-by-habit on the day
    # it matters. So the healthy path is now asserted as explicitly as the
    # failing ones.
    newest = latest_month(rows)
    check(newest == "2026-07", f"latest_month should be 2026-07, got {newest}")
    check(corroborates(rows, 6.49, newest),
          "a correct series reports disagreement against its own newest month")

    # And the specific trap: the month AFTER the newest must not be what we ask
    # about. This is the state that shipped.
    check(not corroborates(rows, 6.49, "2026-08"),
          "fixture unexpectedly contains 2026-08 — this trap no longer tests anything")

    check(latest_month([]) is None, "latest_month should be None for an empty series")

    # fetchedAt: the field that separates "CBK published nothing newer" from
    # "our scraper stopped". Both are a series whose newest row is last month.
    check(all(r.get("fetchedAt") for r in rows), "a row carries no fetchedAt")
    # A date that can never be today. The first version of this assertion used
    # 2026-08-06 — which WAS the day it was written, so it passed whether or not
    # the argument was honoured, and mutation testing caught it passing against
    # a parser that ignored the parameter entirely. A fixture value that
    # coincides with the environment tests the environment, not the code.
    stamped = parse(PAGE, fetched_at="1999-01-01")
    check(all(r["fetchedAt"] == "1999-01-01" for r in stamped),
          "fetched_at argument was ignored")
    check(stamped[-1]["date"] == "2026-07-01",
          "fetchedAt must not be confused with the month the figure describes")

    if FAILURES:
        print(f"\n{len(FAILURES)} CPI history parser test(s) FAILED:", file=sys.stderr)
        for f in FAILURES:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print("\nAll CPI history parser tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
