"""Fail loudly when the data pipeline goes stale.

Two things can go wrong and only one of them is obvious:

  1. A scraper crashes — the CI step exits non-zero and we know.
  2. A scraper "succeeds" while extracting nothing. Since carry_forward()
     preserves previous values rather than deleting them, the output still
     looks healthy and the app keeps serving numbers that quietly age. This is
     the dangerous one: the app would present a two-month-old CBR as current.

This check catches (2). Exits non-zero on any breach so CI turns red and the
alert step fires.

Freshness is read from NAMED date fields, never by scanning the whole
document — ids like "fx-2026-07" embed dates that do not track when the value
was actually refreshed, and trusting them makes the check silently useless.
"""
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path

from common import DATA_DIR

# Alert self-test. With HEALTHCHECK_STRICT=1 every budget becomes 0 days, so
# any dataset older than today trips the real staleness path — same report
# file, same exit code, same downstream alert. This exists so the alarm can be
# proven to still work after anyone edits it, rather than being discovered
# broken on the day it was needed.
STRICT = os.environ.get("HEALTHCHECK_STRICT") == "1"

# (filename, human name, date field, max age in days, why that budget)
BUDGETS = [
    ("meta.json", "Pipeline last ran", "generatedAt", 7, "refresh runs every weekday"),
    ("macro.json", "Macro (CBR, CPI, FX)", "date", 40, "CPI is monthly"),
    ("tbills.json", "Treasury bills", "auctionDate", 21, "auctioned weekly"),
    ("secondary.json", "Secondary trades", "tradeDate", 30, "NSE publishes daily"),
    ("context.json", "Sovereign context", "asOf", 400, "annual indicators"),
    # The MPC meets roughly every two months, so a genuinely current history can
    # still be ~70 days old. A broken capture is caught earlier and harder by the
    # parser's own MIN_DECISIONS guard; this is the backstop for a capture that
    # keeps succeeding while silently missing new meetings.
    ("cbr-history.json", "CBR decision history", "date", 130, "MPC meets ~every 2 months"),
]


def parse_day(raw) -> date | None:
    """Accept YYYY-MM-DD, YYYY-MM, YYYY, and ISO timestamps (truncated to the day)."""
    text = str(raw).strip()
    for fmt, width in (("%Y-%m-%d", 10), ("%Y-%m", 7), ("%Y", 4)):
        if len(text) >= width:
            try:
                return datetime.strptime(text[:width], fmt).date()
            except ValueError:
                continue
    return None


def newest_in_field(payload, field: str) -> date | None:
    """Newest non-future value of `field`, across a list or a single object."""
    records = payload if isinstance(payload, list) else [payload]
    today = date.today()
    best: date | None = None
    for rec in records:
        if not isinstance(rec, dict) or field not in rec:
            continue
        parsed = parse_day(rec[field])
        if parsed is None or parsed > today:
            continue  # auction calendars legitimately hold future dates
        if best is None or parsed > best:
            best = parsed
    return best


def main() -> None:
    today = date.today()
    problems: list[str] = []
    rows: list[str] = []

    if STRICT:
        print("HEALTHCHECK_STRICT=1 — all freshness budgets forced to 0 days (alert self-test)\n")

    for filename, label, field, max_age, rationale in BUDGETS:
        if STRICT:
            max_age = 0
        path = Path(DATA_DIR) / filename
        if not path.exists():
            problems.append(f"{label}: {filename} is MISSING")
            rows.append(f"{'MISSING':<9} {label}")
            continue
        try:
            payload = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError) as exc:
            problems.append(f"{label}: {filename} unreadable ({exc.__class__.__name__})")
            rows.append(f"{'CORRUPT':<9} {label}")
            continue

        newest = newest_in_field(payload, field)
        if newest is None:
            problems.append(f"{label}: no usable '{field}' in {filename}")
            rows.append(f"{'NO DATE':<9} {label}")
            continue

        age = (today - newest).days
        status = "STALE" if age > max_age else "OK"
        rows.append(f"{status:<9} {label}  {age}d old (max {max_age}d)")
        if age > max_age:
            problems.append(
                f"{label}: newest '{field}' is {age} days old, budget {max_age}d ({rationale})"
            )

    print("=== DATA FRESHNESS ===")
    for row in rows:
        print(row)

    if problems:
        print("\n=== PROBLEMS ===", file=sys.stderr)
        for p in problems:
            print(f"- {p}", file=sys.stderr)
        Path("healthcheck-report.txt").write_text("\n".join(f"- {p}" for p in problems))
        sys.exit(1)

    print("\nAll datasets within their freshness budgets.")


if __name__ == "__main__":
    main()
