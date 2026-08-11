"""A freshness budget must be wider than the widest gap the data has ever shown.

WHY THIS EXISTS

`cbr-history.json` carries a 130-day budget beside the comment "MPC meets
~every 2 months". Those two numbers look contradictory: two months is 62 days,
so 130 reads like somebody doubled a figure and moved on. It is the single most
tightenable-looking constant in the healthcheck.

It is also correct, and tightening it would be a regression. Measured across
the 119 decisions actually in the file:

    median gap since 2023   62 days
    max gap since 2023      68 days
    MAX GAP ALL-TIME       119 days

130 sits just above the worst gap the MPC has ever produced. A "sensible"
tightening to 85 or 90 would have raised a false alarm on real history — and a
freshness alarm that cries wolf is one people learn to ignore, which is the
failure mode the context.json comment in healthcheck.py already warns about.

WHY A TEST RATHER THAN A LONGER COMMENT

There was already a comment explaining the cadence, and it did not stop this
from being picked up as a defect during an audit; the reasoning was read and
the number still looked wrong. A comment cannot fail a build. This can: it
recomputes the worst historical gap from the shipped data on every CI run and
asserts the budget still clears it.

That also makes it self-updating in the direction that matters. If the MPC ever
skips a meeting and produces a gap wider than 130, this goes red — which is the
correct moment to widen the budget deliberately rather than discover it through
a silent missed alarm.

NOTE ON THE OTHER 130

PER_INDICATOR_BUDGETS["CBR"] is also 130, and it is a DIFFERENT claim with a
different justification: it measures the age of the CBR *value* in macro.json,
where "the rate often does not move" is the reason. A hold is still a decision
with its own date, so the history file gains a row every meeting regardless of
whether the rate changes. Do not merge the two numbers on the grounds that they
happen to match today.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[1] / "public" / "data" / "cbr-history.json"
HEALTHCHECK = HERE / "healthcheck.py"

FAILURES: list = []


def check(condition: bool, message: str) -> None:
    if not condition:
        FAILURES.append(message)


def file_budget(filename: str) -> int | None:
    """Read a file-level budget out of healthcheck.py's BUDGETS table.

    Parsed from source rather than imported: healthcheck imports scraper
    dependencies and runs work at import time in some paths, and a test that
    needs the whole pipeline healthy to read one integer is a test that fails
    for reasons unrelated to what it checks.
    """
    text = HEALTHCHECK.read_text()
    match = re.search(
        rf'\(\s*"{re.escape(filename)}"\s*,\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*(\d+)', text
    )
    return int(match.group(1)) if match else None


def widest_gap(dates: list) -> tuple:
    """The largest interval between consecutive decisions, and where it fell."""
    ordered = sorted(dates)
    worst, span = 0, ("", "")
    for older, newer in zip(ordered, ordered[1:]):
        days = (date.fromisoformat(newer) - date.fromisoformat(older)).days
        if days > worst:
            worst, span = days, (older, newer)
    return worst, span


def main() -> int:
    records = json.loads(DATA.read_text())
    dates = [r["date"] for r in records if r.get("date")]

    # The premise. An empty or tiny file would make every assertion below pass
    # against nothing, which is how a guard gets quietly disabled.
    check(len(dates) > 100, f"expected the full MPC history, got {len(dates)} dated rows")

    budget = file_budget("cbr-history.json")
    check(budget is not None, "could not find the cbr-history budget in healthcheck.py BUDGETS")
    if budget is None or len(dates) <= 100:
        report()
        return 1 if FAILURES else 0

    worst, (older, newer) = widest_gap(dates)
    check(
        budget > worst,
        f"cbr-history budget is {budget} days but the MPC has produced a "
        f"{worst}-day gap ({older} to {newer}). A budget below the worst "
        f"observed gap raises a false alarm on real history.",
    )

    # Not unbounded either: a budget far above the worst gap stops being a
    # guard. Three times the worst observed is generous and still finite.
    check(
        budget <= worst * 3,
        f"cbr-history budget is {budget} days against a worst gap of {worst} — "
        f"so wide it would not notice the feed stopping.",
    )

    print(f"cbr-history: budget {budget}d vs worst observed gap {worst}d "
          f"({older} to {newer}), across {len(dates)} decisions")
    report()
    return 1 if FAILURES else 0


def report() -> None:
    if FAILURES:
        print(f"\n{len(FAILURES)} freshness-budget test(s) FAILED:", file=sys.stderr)
        for f in FAILURES:
            print(f"  - {f}", file=sys.stderr)
    else:
        print("\nAll freshness-budget tests passed.")


if __name__ == "__main__":
    sys.exit(main())
