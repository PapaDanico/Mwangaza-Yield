"""Tests for the freshness check's handling of deliberately-absent sources.

The refresh job opens a GitHub issue whenever healthcheck.py exits non-zero.
That makes the difference between "missing because broken" and "missing
because we chose not to publish it" an operational one, not a cosmetic one:
getting it wrong raises a daily alarm nobody can ever clear, and an alarm
people learn to ignore is worse than no alarm at all.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
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


def fixture_dir(tmp: Path, **overrides) -> Path:
    """Copy the live dataset, replacing named files with test payloads."""
    d = tmp / "data"
    d.mkdir()
    for src in DATA.glob("*.json"):
        (d / src.name).write_text(src.read_text())
    for name, payload in overrides.items():
        (d / f"{name}.json").write_text(json.dumps(payload))
    return d


def test_empty_secondary_is_not_a_problem():
    """The shipped state: no NSE licence, so no trades. Must not alarm."""
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
