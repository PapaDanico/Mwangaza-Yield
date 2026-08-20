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

from macro_parser import (  # noqa: E402
    MAX_MOVE, carry_forward, date_by_observation, implausible_move,
    one_row_per_indicator, reference_period, reject_implausible, today_iso,
)
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
# implausible_move / reject_implausible — the wrong-but-in-band trap
#
# The live probe on 2026-08-07 resolved FX_USD_KES to 85.1625 off CBK's forex
# page while the real rate was ~129.5, almost certainly matching a historical
# row. Everything we had passed it: page reachable, regex matched, number
# parsed, and 85.1625 sits inside the 50-500 band. A 34% error was one
# scheduled run away from being published as current.
# --------------------------------------------------------------------------

PREV = [row("FX_USD_KES", 129.5, "2026-07-20"), row("CBR", 8.75, "2026-06-09")]


def test_the_85_point_16_rate_is_refused() -> None:
    why = implausible_move("FX_USD_KES", 85.1625, PREV)
    check(why is not None, "the 34% jump was accepted")
    check("85.1625" in why and "129.5" in why,
          f"the reason must name both values, got {why}")


def test_an_ordinary_days_move_is_accepted() -> None:
    # The mirror. A guard that fires in every case is as useless as one that
    # never fires, and this one sits in front of the only FX figure we have.
    for v in (129.5, 130.2, 127.0, 135.0, 124.0):
        check(implausible_move("FX_USD_KES", v, PREV) is None,
              f"a normal rate {v} was refused")


def test_the_limit_is_applied_at_its_edge() -> None:
    limit = MAX_MOVE["FX_USD_KES"]
    check(implausible_move("FX_USD_KES", 129.5 * (1 + limit), PREV) is None,
          "a move exactly at the limit must pass")
    check(implausible_move("FX_USD_KES", 129.5 * (1 + limit) + 0.1, PREV) is not None,
          "a move past the limit must be refused")


def test_a_first_observation_is_never_refused() -> None:
    # Nothing to compare against. Refusing here would mean never accepting any
    # figure at all — a guard that fires in every case.
    check(implausible_move("FX_USD_KES", 129.5, []) is None,
          "a first observation must be accepted")
    check(implausible_move("GDP", 5.1, PREV) is None,
          "an indicator with no prior value must be accepted")


def test_an_indicator_keeps_its_OWN_tolerance() -> None:
    # Inflation genuinely can move by half its own value; USD/KES cannot.
    check(implausible_move("CPI", 9.0, [row("CPI", 6.49, "2026-08-05")]) is None,
          "CPI's wider tolerance was not applied")
    check(implausible_move("FX_USD_KES", 9.0, PREV) is not None,
          "FX must not inherit CPI's tolerance")


def test_a_rejected_resolution_becomes_a_FAILED_one() -> None:
    res = reject_implausible(succeeded("FX_USD_KES", 85.1625), PREV)
    check(not res.ok, "an implausible value must not resolve")
    check(res.value is None, "the bad value must not survive as the answer")
    check(any(a.value == 85.1625 for a in res.attempts),
          "the rejected value must be kept for whoever reads the log")


def test_a_plausible_resolution_passes_through_untouched() -> None:
    ok = succeeded("FX_USD_KES", 130.2)
    res = reject_implausible(ok, PREV)
    check(res is ok, "a good resolution should not be rebuilt")
    check(res.ok and res.value == 130.2, "a good value was altered")


def test_an_already_failed_resolution_is_left_alone() -> None:
    f = failed("FX_USD_KES", "no match")
    check(reject_implausible(f, PREV) is f, "a failed resolution was rebuilt")


def test_a_zero_or_missing_prior_does_not_divide_by_zero() -> None:
    check(implausible_move("X", 5.0, [row("X", 0, "2026-01-01")]) is None,
          "a zero prior must not blow up or refuse")
    check(implausible_move("X", None, PREV) is None, "no value, nothing to judge")


def test_a_rejected_value_is_carried_forward_and_reported() -> None:
    """End to end: the bad rate must leave the old one in place, and say why."""
    res = reject_implausible(succeeded("FX_USD_KES", 85.1625), PREV)
    out = carry_forward([], PREV, (res,))
    fx = next(r for r in out if r["indicator"] == "FX_USD_KES")
    check(fx["value"] == 129.5, f"the good value was lost, got {fx['value']}")
    check("85.1625" in fx.get("attemptFailed", ""),
          "the data must record what was refused")
    check("lastChecked" not in fx, "a refused value must not count as confirmed")


# --------------------------------------------------------------------------
# reference_period — which MONTH a CPI print describes
# --------------------------------------------------------------------------

HISTORY = [
    {"date": "2026-05-01", "value": 6.68},
    {"date": "2026-06-01", "value": 6.41},
    {"date": "2026-07-01", "value": 6.49},
]


def test_a_july_print_read_in_august_is_dated_july() -> None:
    """THE SHIPPED BUG. macro.json dated July's 6.49 to 2026-08-05, and the
    dashboard printed that date under a figure describing July."""
    check(reference_period(6.49, HISTORY) == "2026-07",
          f"got {reference_period(6.49, HISTORY)}")


def test_an_earlier_month_resolves_to_its_own_month() -> None:
    check(reference_period(6.41, HISTORY) == "2026-06",
          f"got {reference_period(6.41, HISTORY)}")


def test_an_unmatched_value_returns_None_rather_than_guessing() -> None:
    # Falling back to the observation date is honest. Deriving "last month"
    # from the calendar would be right most of the time and silently wrong
    # exactly when a release is late — when a reader most needs to know.
    check(reference_period(7.77, HISTORY) is None,
          "an unmatched value must not be given a month")


def test_a_repeated_value_takes_the_NEWEST_month() -> None:
    # Inflation revisits the same rate often. An older match would date
    # today's print to last year.
    hist = HISTORY + [{"date": "2025-03-01", "value": 6.49}]
    check(reference_period(6.49, hist) == "2026-07",
          f"an older duplicate won: {reference_period(6.49, hist)}")


def test_a_missing_or_unreadable_history_is_not_fatal() -> None:
    check(reference_period(6.49, []) is None, "empty history should yield None")
    check(reference_period(None, HISTORY) is None, "no value, no period")
    check(reference_period(6.49, "not a list") is None, "a non-list must not throw")


def test_malformed_history_rows_are_skipped_not_crashed_on() -> None:
    hist = [None, "x", {}, {"value": 6.49}, {"date": "2026-07-01", "value": 6.49}]
    check(reference_period(6.49, hist) == "2026-07",
          f"got {reference_period(6.49, hist)}")


def test_duplicate_indicators_collapse_to_one_row() -> None:
    # The shipped defect: carry_forward re-appends every context row and
    # load_macro_context appends the same rows again, so each came back twice.
    rows = [
        {"id": "cbr-2026-08-11", "indicator": "CBR", "value": 8.75},
        {"id": "debt-gdp-2026", "indicator": "DEBT_TO_GDP", "value": 67.2},
        {"id": "debt-gdp-2026", "indicator": "DEBT_TO_GDP", "value": 67.2},
    ]
    out = one_row_per_indicator(rows)
    check(len(out) == 2, f"expected 2 rows, got {len(out)}")
    check([r["indicator"] for r in out] == ["CBR", "DEBT_TO_GDP"],
          f"order not preserved: {[r['indicator'] for r in out]}")


def test_first_row_wins_so_fresh_beats_carried_forward() -> None:
    # Order is precedence. A fresh scrape is appended before the carried-forward
    # copy, so keeping the LAST row would republish yesterday's value as today's.
    rows = [
        {"id": "fx-2026-08-19", "indicator": "FX_USD_KES", "value": 129.54},
        {"id": "fx-2026-08-18", "indicator": "FX_USD_KES", "value": 129.48},
    ]
    out = one_row_per_indicator(rows)
    check(len(out) == 1, f"expected 1 row, got {len(out)}")
    check(out[0]["value"] == 129.54, f"kept the stale value: {out[0]['value']}")


def test_merge_is_idempotent_so_a_refresh_cannot_grow_the_file() -> None:
    # Feeding the output back in is exactly what the daily pipeline does: this
    # run's file is next run's `existing`. Doubling is what made 14 rows 22.
    rows = [
        {"id": "cbr-2026-08-11", "indicator": "CBR", "value": 8.75},
        {"id": "us10y-2026-08-18", "indicator": "US10Y", "value": 4.18},
    ]
    once = one_row_per_indicator(rows)
    twice = one_row_per_indicator(once + once)
    check(once == twice, f"not idempotent: {len(once)} then {len(twice)}")


def test_malformed_rows_are_dropped_not_crashed_on() -> None:
    rows = [None, "x", {"value": 1}, {"indicator": "CBR", "value": 8.75}]
    out = one_row_per_indicator(rows)
    check([r["indicator"] for r in out] == ["CBR"], f"got {out}")


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
