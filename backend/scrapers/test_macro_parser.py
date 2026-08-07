"""Tests for the two functions that decide what a macro row MEANS.

`date_by_observation` and `carry_forward` between them own every freshness
claim the app makes about CBR, CPI and USD/KES — and neither had a single test
until the seventeen-day FX outage went unnoticed. That is not a coincidence.
The bug was not in fetching; fetching failed loudly on stderr every morning.
The bug was that the row these functions produced for a failure was
indistinguishable from the row they produce for success.

No pytest, matching the other scraper tests. Every case runs offline.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from macro_parser import carry_forward, date_by_observation, today_iso  # noqa: E402
from sources import Attempt, Resolution  # noqa: E402

FAILURES: list = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def row(indicator: str, value: float, date: str, **extra) -> dict:
    r = {"id": f"{indicator.lower()}-{date}", "indicator": indicator,
         "value": value, "date": date, "source": "CBK"}
    r.update(extra)
    return r


def failed(indicator: str, *reasons: str) -> Resolution:
    return Resolution(
        indicator=indicator, value=None, via=None,
        attempts=[Attempt(route=f"r{i}", url=f"https://{i}/", ok=False, reason=x)
                  for i, x in enumerate(reasons)],
    )


def succeeded(indicator: str, value: float) -> Resolution:
    return Resolution(indicator=indicator, value=value, via="r0",
                      attempts=[Attempt("r0", "https://0/", True, "ok", value)])


# --------------------------------------------------------------------------
# carry_forward
# --------------------------------------------------------------------------

def test_a_failed_indicator_is_marked_as_attempted() -> None:
    """THE SEVENTEEN-DAY BUG. FX failed every run and the row never said so."""
    existing = [row("FX_USD_KES", 129.5, "2026-07-20")]
    out = carry_forward([], existing, (failed("FX_USD_KES", "no match", "fetch failed"),))
    check(len(out) == 1, f"expected the row to be kept, got {len(out)}")
    fx = out[0]
    check(fx.get("lastAttempt") == today_iso(),
          f"a failed attempt must be dated, got {fx.get('lastAttempt')}")
    check("no match" in fx.get("attemptFailed", ""),
          f"the reason must name what went wrong, got {fx.get('attemptFailed')}")
    check("r0" in fx.get("attemptFailed", ""),
          "the reason must name the route, not just the failure")
    # Both routes, not merely the first.
    check("fetch failed" in fx.get("attemptFailed", ""),
          "every attempted route should be reported, not only the first")


def test_a_failure_does_NOT_stamp_lastChecked() -> None:
    """The whole point. `lastChecked` means confirmed; a failure confirms nothing.

    If this ever goes green in reverse, a broken indicator renders as freshly
    verified every morning — the exact false-freshness `date_by_observation`
    was written to remove.
    """
    existing = [row("FX_USD_KES", 129.5, "2026-07-20")]
    out = carry_forward([], existing, (failed("FX_USD_KES", "no match"),))
    check("lastChecked" not in out[0],
          "a failed attempt must not claim the figure was checked")
    check(out[0]["date"] == "2026-07-20",
          "a failure must not advance the observation date")
    check(out[0]["value"] == 129.5, "a failure must not alter the value")


def test_an_unattempted_indicator_is_not_blamed() -> None:
    """Carrying forward something we never tried is not a failure to report."""
    existing = [row("GDP", 5.1, "2026-03-31")]
    out = carry_forward([], existing, (failed("FX_USD_KES", "no match"),))
    check("attemptFailed" not in out[0],
          "an indicator nobody attempted must not be marked as failing")
    check("lastAttempt" not in out[0],
          "an indicator nobody attempted has no attempt to date")


def test_a_successful_indicator_is_not_carried_forward() -> None:
    fresh = [row("CPI", 6.49, today_iso(), lastChecked=today_iso())]
    existing = [row("CPI", 6.41, "2026-07-05")]
    out = carry_forward(list(fresh), existing, (succeeded("CPI", 6.49),))
    check(len(out) == 1, f"the stale CPI row was duplicated: {len(out)} rows")
    check(out[0]["value"] == 6.49, "the fresh value should win")


def test_carrying_forward_does_not_mutate_the_existing_row() -> None:
    """`existing` is read from disk; scribbling on it corrupts any later read."""
    existing = [row("FX_USD_KES", 129.5, "2026-07-20")]
    carry_forward([], existing, (failed("FX_USD_KES", "no match"),))
    check("lastAttempt" not in existing[0],
          "carry_forward mutated the caller's record in place")


def test_a_resolution_with_no_routes_still_reports_something() -> None:
    empty = Resolution(indicator="FX_USD_KES", value=None, via=None, attempts=[])
    out = carry_forward([], [row("FX_USD_KES", 129.5, "2026-07-20")], (empty,))
    check(out[0].get("attemptFailed") == "no routes configured",
          f"an empty route list needs a reason too, got {out[0].get('attemptFailed')}")


def test_no_resolutions_argument_behaves_as_before() -> None:
    """The old two-argument call must keep working — other callers exist."""
    out = carry_forward([], [row("FX_USD_KES", 129.5, "2026-07-20")])
    check(len(out) == 1, "the row should still be carried")
    check("attemptFailed" not in out[0],
          "with no resolutions passed, nothing can be called a failure")


# --------------------------------------------------------------------------
# date_by_observation — untested until now
# --------------------------------------------------------------------------

def test_an_unchanged_value_keeps_its_original_date() -> None:
    fresh = [row("CPI", 6.41, today_iso())]
    existing = [row("CPI", 6.41, "2026-07-05")]
    out = date_by_observation(fresh, existing)
    check(out[0]["date"] == "2026-07-05",
          f"an unchanged figure must keep its date, got {out[0]['date']}")
    check(out[0]["lastChecked"] == today_iso(),
          "an unchanged figure must still record that we looked")
    check(out[0]["id"] == "cpi-2026-07-05",
          f"an unchanged figure must keep its identity, got {out[0]['id']}")


def test_a_changed_value_takes_today() -> None:
    out = date_by_observation([row("CPI", 6.49, today_iso())],
                              [row("CPI", 6.41, "2026-07-05")])
    check(out[0]["date"] == today_iso(),
          f"a moved figure must be dated today, got {out[0]['date']}")


def test_a_changed_SOURCE_counts_as_a_new_observation() -> None:
    """Same number from a different source is a different fact about the world."""
    fresh = [row("CPI", 6.41, today_iso())]
    fresh[0]["source"] = "KNBS"
    out = date_by_observation(fresh, [row("CPI", 6.41, "2026-07-05")])
    check(out[0]["date"] == today_iso(),
          "a figure re-sourced elsewhere should be dated as newly observed")


def test_an_indicator_with_no_history_keeps_todays_date() -> None:
    out = date_by_observation([row("CPI", 6.49, today_iso())], [])
    check(out[0]["date"] == today_iso(), "a first observation is dated today")
    check(out[0]["lastChecked"] == today_iso(), "a first observation was checked")


# --------------------------------------------------------------------------
# The runner. Kept at the BOTTOM so a test defined below it cannot be skipped
# silently — test_healthcheck.py shipped with that exact hole.
# --------------------------------------------------------------------------

def test_every_test_in_this_file_actually_runs() -> None:
    defined = {
        n for n, v in globals().items()
        if n.startswith("test_") and callable(v)
    }
    missing = defined - {t.__name__ for t in TESTS}
    check(not missing, f"defined but never run: {sorted(missing)}")


TESTS = [v for n, v in list(globals().items()) if n.startswith("test_") and callable(v)]


def main() -> int:
    for t in TESTS:
        try:
            t()
        except Exception as exc:  # a throwing test is a failing test
            FAILURES.append(f"{t.__name__} raised {type(exc).__name__}: {exc}")
    for f in FAILURES:
        print(f"FAIL: {f}", file=sys.stderr)
    print(f"{len(TESTS)} tests, {len(FAILURES)} failures")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
