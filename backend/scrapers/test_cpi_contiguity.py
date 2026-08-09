"""A CPI history with a hole in it must not be written.

WHY MIN_ROWS IS NOT ENOUGH, WHICH IS THE WHOLE POINT

cpi_history_parser already refuses a short read: MIN_ROWS = 200 against the 259
rows CBK serves. That guard exists because a client-rendered or restructured
table collapses to a handful of rows, and writing that over a good history
would destroy the series quietly.

It is a VOLUME floor. It does not look at SHAPE, and the two fail differently.

The probe that surveyed CBK's inflation page recorded `dataTable`, `paginate`
and `ajax` in the page source. Every row is in the served DOM today — 259
records spanning 2005-01 to 2026-07, which is exactly 259 months, verified by
arithmetic. But if CBK ever turns on server-side paging and serves 250 of them,
MIN_ROWS clears comfortably while nine months vanish.

A hole is worse than a short series. `realSeries` pairs each reading with its
CONTEMPORANEOUS CPI, so a missing month does not surface as missing — it simply
stops answering for the readings that needed it, on a page that looks complete
either way. Nothing downstream would report an error.

WHY THIS FILE IS A SCRIPT AND NOT A PYTEST MODULE

The first draft used pytest fixtures and parametrize. CI runs these files as
`python test_x.py`, so that version would have exited 0 having executed
NOTHING — a test suite that passes vacuously, which is the failure it exists to
prevent. It follows the house harness instead, and is listed in ci.yml beside
its neighbours.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from cpi_history_parser import missing_months  # noqa: E402

FAILURES: list = []


def check(condition: bool, message: str) -> None:
    if not condition:
        FAILURES.append(message)


def month_rows(start_year: int, start_month: int, count: int) -> list:
    """A contiguous run of monthly records, shaped like the real ones."""
    out, y, m = [], start_year, start_month
    for _ in range(count):
        out.append({"date": f"{y}-{m:02d}-01", "value": 5.0})
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return out


def main() -> int:
    check(missing_months(month_rows(2005, 1, 259)) == [],
          "a contiguous 259-month series must report no gaps")

    # THE CASE MIN_ROWS CANNOT SEE. 250 rows out of 259 clears a floor of 200
    # without complaint; this is the server-side-paging failure.
    holed = month_rows(2005, 1, 259)
    del holed[100:109]
    check(len(holed) == 250, "fixture should sit comfortably above MIN_ROWS")
    gaps = missing_months(holed)
    check(len(gaps) == 9,
          f"nine dropped months must be found, got {len(gaps)}")
    check(gaps and gaps[0] == "2013-05",
          f"the gap must be located, not just counted (got {gaps[:1]})")

    check(missing_months([r for i, r in enumerate(month_rows(2005, 1, 259)) if i != 42])
          == ["2008-07"],
          "a single dropped month must be found")

    # A network failure upstream hands this an empty list. Refusing that is
    # MIN_ROWS's job, not this one's — but it must not raise on the way there.
    check(missing_months([]) == [], "an empty read must not raise")

    # The parser does not promise sorted output, and a shape check that
    # depended on ordering would report holes that are not there.
    reversed_rows = list(reversed(month_rows(2005, 1, 24)))
    check(missing_months(reversed_rows) == [],
          "out-of-order rows must not be mistaken for gaps")

    for count in (1, 2, 12, 13):
        check(missing_months(month_rows(2020, 11, count)) == [],
              f"a short but whole {count}-month series must report no gaps")

    # THE PREMISE. If this fails, the shipped dataset already has a hole and
    # every assertion above is about a situation we are already in.
    published = json.loads(
        (Path(__file__).resolve().parents[2] / "public" / "data" / "cpi-history.json").read_text()
    )
    check(len(published) > 250,
          f"the published series shrank to {len(published)} rows — check for truncation")
    real_gaps = missing_months(published)
    check(real_gaps == [],
          f"the SHIPPED cpi-history.json has gaps: {real_gaps[:12]}")

    if FAILURES:
        print(f"\n{len(FAILURES)} CPI contiguity test(s) FAILED:", file=sys.stderr)
        for f in FAILURES:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print("\nAll CPI contiguity tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
