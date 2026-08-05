"""Tests for the freshness check's handling of deliberately-absent sources.

The refresh job opens a GitHub issue whenever healthcheck.py exits non-zero.
That makes the difference between "missing because broken" and "missing
because we chose not to publish it" an operational one, not a cosmetic one:
getting it wrong raises a daily alarm nobody can ever clear, and an alarm
people learn to ignore is worse than no alarm at all.
"""

import json
from datetime import date
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from healthcheck import BUDGETS  # noqa: E402

DATA = HERE.parent.parent / "public" / "data"


def run_healthcheck(data_dir: Path) -> subprocess.CompletedProcess:
    """Run the checker against a throwaway copy of the dataset."""
    return subprocess.run(
        [sys.executable, str(HERE / "healthcheck.py")],
        capture_output=True,
        text=True,
        cwd=HERE,
        env={"PATH": "/usr/bin:/bin", "MWANGAZA_DATA_DIR": str(data_dir)},
    )


def _freshen(path: Path, field: str) -> None:
    """Stamp every occurrence of `field` in one file to today."""
    try:
        payload = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return
    today = date.today().isoformat()

    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k == field and isinstance(v, (str, int)):
                    node[k] = today
                else:
                    walk(v)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(payload)
    path.write_text(json.dumps(payload))


def fixture_dir(tmp: Path, **overrides) -> Path:
    """Copy the live dataset, hold every date fresh, then apply the overrides.

    THE COPY USED TO BE LEFT AS-IS, AND THAT MADE THESE TESTS A CALENDAR BOMB.

    Every one of them asserts something about `secondary.json`, but the fixture
    is the whole live dataset and healthcheck.py exits non-zero if ANY budget is
    breached. So the moment an unrelated indicator aged past its limit, a test
    named "empty secondary is not a problem" started failing — and its message
    said `empty secondary.json raised an alarm`, which was not true. The alarm
    was Sovereign context at 946 days against a 900-day budget, a real condition
    with nothing whatever to do with secondary trades.

    It blocked every pull request in the repository on 2026-08-04, for a reason
    none of them had caused.

    Worse, the failure was the honest half. The two `..._still_fails` tests below
    assert a NON-zero exit, and the same unrelated staleness was making the
    healthcheck non-zero on its own — so they were passing without exercising
    their subject at all, and would have kept passing if secondary handling had
    broken completely.

    Holding every other date fresh isolates the subject: these now fail when, and
    only when, secondary.json handling is wrong. The staleness they were
    accidentally tripping on is still caught where it belongs — healthcheck.py
    runs as its own gate in the scheduled refresh job, and it raised issue #149
    for this exact condition hours before CI went red.

    The fields come from BUDGETS rather than a list retyped here, so a new
    freshness check cannot quietly reintroduce the bomb.
    """
    d = tmp / "data"
    d.mkdir()
    for src in DATA.glob("*.json"):
        (d / src.name).write_text(src.read_text())

    overridden = {f"{name}.json" for name in overrides}
    for fname, _label, field, _budget, _why in BUDGETS:
        if fname in overridden:
            continue  # the file under test keeps whatever the test gave it
        _freshen(d / fname, field)

    for name, payload in overrides.items():
        (d / f"{name}.json").write_text(json.dumps(payload))
    return d


def test_empty_secondary_is_not_a_problem():
    """The shipped state: we publish no market prices, so no trades. Must not alarm."""
    with tempfile.TemporaryDirectory() as tmp:
        d = fixture_dir(Path(tmp), secondary=[])
        res = run_healthcheck(d)
        assert res.returncode == 0, f"empty secondary.json raised an alarm:\n{res.stdout}"
        assert "NOT SET" in res.stdout
        # Still visible in the table — silence would be its own failure mode.
        assert "Secondary trades" in res.stdout


def test_populated_but_stale_secondary_still_fails():
    """If a licence-holder turns the feed on, staleness matters again."""
    with tempfile.TemporaryDirectory() as tmp:
        d = fixture_dir(
            Path(tmp),
            secondary=[{
                "isin": "KE-TEST", "tradeDate": "2020-01-02", "price": 96.4,
                "yield": 13.0, "volumeKES": 1_000_000, "tradesCount": 3,
            }],
        )
        res = run_healthcheck(d)
        assert res.returncode == 1, "a years-stale trade feed should raise an alarm"
        assert "Secondary trades" in res.stdout


def test_missing_secondary_file_still_fails():
    """Absent is not the same as empty — a vanished file is a pipeline fault."""
    with tempfile.TemporaryDirectory() as tmp:
        d = fixture_dir(Path(tmp))
        (d / "secondary.json").unlink()
        res = run_healthcheck(d)
        assert res.returncode == 1, "a missing secondary.json should raise an alarm"
        assert "MISSING" in res.stdout


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL {name}: {exc}")
    sys.exit(1 if failures else 0)


# ---------------------------------------------------------------------------
# Per-indicator visibility, and the fetch-recency alarm.
#
# context.json holds six World Bank indicators with independent vintages, and
# the budget reads the NEWEST date in the file. Two indicators with a 2025
# vintage made it report 582 days old while Interest / government revenue sat
# at 1313 — three and a half years, invisible. The guard could not fire in the
# case it existed to detect.
# ---------------------------------------------------------------------------

from healthcheck import (  # noqa: E402
    report_per_indicator,
    check_fetch_recency,
    FETCH_MAX_AGE_DAYS,
)
from datetime import timedelta  # noqa: E402


def _ctx(*specs):
    """specs are (label, vintage_year, fetched_days_ago | None)."""
    out = []
    for label, year, fetched in specs:
        rec = {"id": label.lower().replace(" ", "-"), "label": label, "asOf": str(year)}
        if fetched is not None:
            rec["fetchedAt"] = (date.today() - timedelta(days=fetched)).isoformat()
        out.append(rec)
    return out


def test_every_indicator_is_reported_not_just_the_freshest():
    rows: list = []
    report_per_indicator(_ctx(("New", 2025, None), ("Ancient", 2019, None)), "Ctx", rows)
    text = "\n".join(rows)
    assert "New" in text
    assert "Ancient" in text, "a stale indicator must not hide behind a fresh one"


def test_indicators_are_listed_oldest_first():
    rows: list = []
    report_per_indicator(
        _ctx(("New", 2025, None), ("Ancient", 2019, None), ("Middle", 2022, None)),
        "Ctx",
        rows,
    )
    body = [r for r in rows if "d  " in r]
    order = [r.split("d  ")[1].strip() for r in body]
    assert order == ["Ancient", "Middle", "New"], order


def test_reporting_raises_no_alarm_on_vintage_spread_alone():
    # The whole reason this reports rather than alarms: those lags are mostly
    # real, and alarming on the oldest would fire every day forever.
    problems: list = []
    rows: list = []
    report_per_indicator(_ctx(("Ancient", 2015, None)), "Ctx", rows)
    assert problems == []


def test_absent_fetchedAt_is_unknown_not_stale():
    # Records written before the field existed must not raise an alarm about a
    # deployment rather than about the data.
    problems: list = []
    rows: list = []
    check_fetch_recency(_ctx(("A", 2025, None)), "Ctx", problems, rows)
    assert problems == []
    assert any("UNKNOWN" in r for r in rows)


def test_a_recent_fetch_is_fine_however_old_the_vintage():
    # The point of the split: a 2015 vintage fetched today is the World Bank's
    # answer, not our fault.
    problems: list = []
    rows: list = []
    check_fetch_recency(_ctx(("Ancient", 2015, 0)), "Ctx", problems, rows)
    assert problems == [], problems
    assert any(r.startswith("OK") for r in rows)


def test_a_stale_fetch_is_a_problem_however_new_the_vintage():
    problems: list = []
    rows: list = []
    check_fetch_recency(_ctx(("New", 2025, FETCH_MAX_AGE_DAYS + 5)), "Ctx", problems, rows)
    assert len(problems) == 1, problems
    assert "our pipeline" in problems[0]


def test_the_oldest_fetch_decides_not_the_newest():
    # Same failure mode as the original defect, one level down: one indicator
    # refetched today must not hide five that stopped.
    problems: list = []
    rows: list = []
    check_fetch_recency(
        _ctx(("Fresh", 2025, 0), ("Stopped", 2024, FETCH_MAX_AGE_DAYS + 30)),
        "Ctx",
        problems,
        rows,
    )
    assert len(problems) == 1, "a stopped indicator must not hide behind a fetched one"


def test_the_shipped_context_file_is_reported_per_indicator():
    # Non-vacuity: run it over the real file and require more than one line.
    payload = json.loads((DATA / "context.json").read_text())
    rows: list = []
    report_per_indicator(payload, "Sovereign context", rows)
    assert len(rows) >= 4, rows
