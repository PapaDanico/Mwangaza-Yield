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
