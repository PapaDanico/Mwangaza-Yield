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

# Sources whose ABSENCE is a deliberate product decision rather than a fault.
# An empty file here is fine; a populated one is held to its budget as normal.
OPTIONAL_IF_EMPTY = {"secondary.json"}

# (filename, human name, date field, max age in days, why that budget)
BUDGETS = [
    ("meta.json", "Pipeline last ran", "generatedAt", 7, "refresh runs every weekday"),
    # The file-level budget is the BACKSTOP now, not the check. See
    # PER_INDICATOR_BUDGETS below: macro.json holds five indicators on wholly
    # different cadences and a single number cannot police them.
    ("macro.json", "Macro (CBR, CPI, FX)", "date", 40, "CPI is monthly"),
    ("tbills.json", "Treasury bills", "auctionDate", 21, "auctioned weekly"),
    # Secondary trades are OPTIONAL_IF_EMPTY (see below). This file is empty
    # and stays empty: exchange price data is licensed, and we publish none of
    # it. Nothing in this repository fetches it any more. Held as an ordinary
    # budget, this line failed on every single run — and because the refresh
    # job opens a GitHub issue on failure, it would have raised a daily alarm
    # about a condition that cannot be fixed. That is precisely the wolf-crying
    # the context.json budget below was widened to avoid, except permanent.
    #
    # The slot is kept, not the source: a deployer who lawfully holds priced
    # data of their own can drop it in, and then going stale is a real fault
    # and is reported as one.
    ("secondary.json", "Secondary trades", "tradeDate", 30, "a supplied feed should be current"),
    # World Bank annual indicators are dated by VINTAGE, not by fetch date: the
    # newest Kenya figure on 2026-07-25 is "2025", which reads as 570 days old
    # and is nonetheless the freshest that exists. National accounts are
    # typically published 12-24 months after their reference year, so a budget
    # tighter than that alarms on normal behaviour — and an alarm that cries
    # wolf is one people learn to ignore. 900 days still catches a feed that
    # has genuinely stopped, which is the only thing worth waking someone for.
    ("context.json", "Sovereign context", "asOf", 900, "annual data lags its reference year"),
    # The MPC meets roughly every two months, so a genuinely current history can
    # still be ~70 days old. A broken capture is caught earlier and harder by the
    # parser's own MIN_DECISIONS guard; this is the backstop for a capture that
    # keeps succeeding while silently missing new meetings.
    ("cbr-history.json", "CBR decision history", "date", 130, "MPC meets ~every 2 months"),
    # CPI history was deliberately left OUT of this list when its parser shipped:
    # the file did not exist yet, a missing file is reported as MISSING, and this
    # check also runs in the dispatch-only validate-sources job where the scraper
    # does not — so listing it early would have raised an alarm about a
    # deployment rather than about data. The file exists now, so that reason has
    # expired and leaving it out would be the unmonitored dataset instead.
    #
    # 75 days, not 40 like macro.json, because `date` here is the month the
    # figure DESCRIBES and CBK's table lags by one: on 6 August the newest row
    # is dated 1 July, already ~36 days old on the day it is perfectly current.
    # A 40-day budget would spend half of every month in alarm. 75 gives a full
    # missed publication before it speaks, which is the first point at which
    # something is actually wrong.
    ("cpi-history.json", "CPI history", "date", 75, "monthly, and CBK's table lags a month"),
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


# Freshness is not the only way a dataset goes wrong, and it is not the way that
# actually reached users. FXD1/2012/15 was published with a 1% coupon on a
# fifteen-year Kenyan government bond — "11.000" with its leading digit lost to
# CBK's split-digit rendering. Every freshness budget was green the whole time,
# because the number was current. It was just wrong.
#
# So the app's own output is checked for values that cannot exist. These bounds
# are deliberately generous: the job is to catch a digit that fell off, not to
# second-guess the market. Across every coupon and clearing rate in the archive
# back to 2014 the lowest genuine figure is 7.78%.
PLAUSIBLE = [
    ("couponRate", 6.0, 30.0),
    ("ytmGross", 5.0, 35.0),
    ("tenorYears", 0.5, 40.0),
]


def check_bonds_are_plausible(problems: list, rows: list) -> None:
    path = Path(DATA_DIR) / "bonds.json"
    if not path.exists():
        problems.append("Bond plausibility: bonds.json is MISSING")
        return
    try:
        bonds = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        problems.append(f"Bond plausibility: bonds.json unreadable ({exc.__class__.__name__})")
        return

    offences = []
    for bond in bonds:
        for field, lo, hi in PLAUSIBLE:
            value = bond.get(field)
            # Missing is not the same as fine. Every field here is required to
            # price a bond at all, so absence is a defect, not an exemption —
            # and skipping it was a hole in this very guard: a null coupon
            # renders as a confident "0.00%" in the calculator and would have
            # passed the check that exists to catch exactly that.
            if value is None:
                offences.append(f"{bond.get('issueCode')} {field} is missing")
                continue
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                offences.append(f"{bond.get('issueCode')} {field}={value!r} is not a number")
                continue
            if not (lo <= value <= hi):
                offences.append(f"{bond.get('issueCode')} {field}={value} outside {lo}-{hi}")

    if offences:
        rows.append(f"{'IMPLAUSIBLE':<9} Bond figures  {len(offences)} bad value(s)")
        for offence in offences:
            problems.append(f"Bond plausibility: {offence}")
    else:
        rows.append(f"{'OK':<9} Bond figures  {len(bonds)} bond(s), all within plausible bounds")


# Per-indicator reporting for the multi-indicator files.
#
# `newest_in_field` answers "how fresh is the freshest thing here", which is the
# right question for macro.json or tbills.json — one subject, one date. It is
# the wrong question for context.json, which holds six World Bank indicators
# with independent vintages, because ONE refreshed indicator hides every stale
# one behind it. On the day this was written GDP growth and Exports/GDP carried
# a 2025 vintage and made the file read 582 days old, while Reserves, External
# debt and Debt service sat at 948 and Interest / government revenue at 1313 —
# three and a half years, entirely invisible to a budget measuring the maximum.
#
# The fix is NOT to switch the budget to the oldest. Those lags are mostly
# real: the World Bank genuinely may not publish a recent figure for every
# series, and alarming on the oldest would fire every day forever, which is the
# wolf-crying the 900-day budget was widened to avoid in the first place.
#
# So this reports rather than alarms. The spread becomes visible in every
# health report — which is all that was needed for a human to have spotted it —
# and the alarm stays on `fetchedAt`, which is ours to be responsible for.
def report_per_indicator(payload, label: str, rows: list) -> None:
    if not isinstance(payload, list) or not payload:
        return
    today = date.today()
    aged: list[tuple[int, str]] = []
    for rec in payload:
        if not isinstance(rec, dict):
            continue
        when = parse_day(rec.get("asOf"))
        if when is None or when > today:
            continue
        aged.append(((today - when).days, str(rec.get("label") or rec.get("id"))))
    if not aged:
        return
    aged.sort(reverse=True)
    rows.append(f"{'':<9} {label} — vintage by indicator, oldest first:")
    for days, name in aged:
        rows.append(f"{'':<9}   {days:>5}d  {name}")


# PER-INDICATOR BUDGETS FOR macro.json, AND THE BUG THAT FORCED THEM
#
# The comment above says newest_in_field is "the right question for macro.json
# — one subject, one date". That was wrong, and the cost was eighteen days of
# a stale exchange rate that nothing reported.
#
# macro.json holds FIVE indicators on wholly different cadences: USD/KES moves
# every trading day, CPI is monthly, the CBR changes only when the MPC meets,
# roughly every two months. A single 40-day budget keyed to the newest record
# is satisfied by whichever one happened to update most recently. On the day
# this was written CPI carried 2026-08-05 and the file read "OK, 1d old", while
# FX_USD_KES sat at 2026-07-20 — eighteen days — and carried no lastChecked at
# all, meaning the scraper had not produced an FX record in all that time and
# carry_forward had been faithfully preserving the last good one.
#
# That is the same masking this module already fixed for context.json, in a
# file the fix explicitly skipped on a premise nobody rechecked. A daily rate
# and a two-monthly rate cannot share a threshold: set it loose enough for the
# CBR and FX can rot for two months; set it tight enough for FX and the CBR
# alarms every week it does not meet.
#
# So each indicator gets the budget its own publisher's cadence justifies.
# Anything not listed falls back to the file-level budget rather than being
# silently exempt — an unlisted indicator should be conservative, not invisible.
PER_INDICATOR_BUDGETS = {
    # CBK publishes an indicative rate every trading day. Four days covers a
    # weekend plus one missed run before it speaks.
    "FX_USD_KES": (4, "CBK publishes an indicative rate every trading day"),
    # KNBS releases the index in the last days of each month.
    "CPI": (45, "released monthly"),
    "CPI_CORE": (45, "released monthly"),
    "CPI_NONCORE": (45, "released monthly"),
    # The MPC meets roughly every two months and the rate often does not move;
    # a tighter budget would alarm on the Bank doing nothing, which is not news.
    "CBR": (130, "MPC meets ~every 2 months"),
}


def check_per_indicator_budgets(payload, label: str, problems: list, rows: list) -> None:
    """Hold each indicator in a multi-indicator file to its own cadence.

    Reports every indicator so the table shows the whole picture, and raises a
    problem only for the ones past their own budget.
    """
    if not isinstance(payload, list) or not payload:
        return
    today = date.today()
    seen: dict[str, tuple[int, int, str]] = {}
    # Why an indicator is old matters more than that it is. `carry_forward`
    # writes attemptFailed when every route failed, so "nobody has published a
    # new figure" and "our way in has broken" stop reading identically here.
    breaking: dict[str, str] = {}
    for rec in payload:
        if not isinstance(rec, dict):
            continue
        name = str(rec.get("indicator") or "")
        when = parse_day(rec.get("date"))
        if not name or when is None or when > today:
            continue
        age = (today - when).days
        budget, why = PER_INDICATOR_BUDGETS.get(name, (None, ""))
        if budget is None:
            # Not listed: fall back to the file budget rather than exempting it.
            budget, why = 40, "no specific budget — using the file default"
        # Keep the FRESHEST record per indicator; a file may hold history.
        prior = seen.get(name)
        if prior is None or age < prior[0]:
            seen[name] = (age, budget, why)
            if rec.get("attemptFailed"):
                breaking[name] = str(rec["attemptFailed"])
            else:
                breaking.pop(name, None)

    if not seen:
        return
    rows.append(f"{'':<9} {label} — by indicator, oldest first:")
    for name, (age, budget, why) in sorted(seen.items(), key=lambda kv: -kv[1][0]):
        state = "OK" if age <= budget else "STALE"
        rows.append(f"{'':<9}   {state:<5} {age:>4}d / {budget}d  {name}  ({why})")
        broken = breaking.get(name)
        if broken:
            rows.append(f"{'':<9}         last fetch FAILED — {broken}")
        if age > budget:
            detail = f", budget {budget}d ({why})"
            if broken:
                # An actively failing fetch is a different job for whoever
                # reads this: fix a route, not wait for a publisher.
                detail += f"; every route failed on the last run — {broken}"
            problems.append(f"{label}: {name} is {age} days old{detail}")
        elif broken:
            # Within budget but the fetch is broken. Worth saying BEFORE the
            # age crosses the line, which is the whole value of recording the
            # attempt: FX had four days of grace in which this was knowable.
            problems.append(
                f"{label}: {name} is within its {budget}d budget but every route "
                f"failed on the last run — {broken}"
            )


# Whether OUR fetch is current, which is a different question from whether the
# world has newer data. See the fetchedAt comment in worldbank.py: a stale
# vintage with a fresh fetchedAt is the World Bank's answer and nothing to do;
# a stale fetchedAt means this pipeline stopped asking, and that is a fault.
#
# Records written before fetchedAt existed do not carry it. Those are reported
# as unknown rather than counted as stale, because treating an absent field as
# a failure would raise an alarm about a deployment rather than about the data.
FETCH_MAX_AGE_DAYS = 7


def check_fetch_recency(payload, label: str, problems: list, rows: list) -> None:
    if not isinstance(payload, list) or not payload:
        return
    today = date.today()
    stamped = [r for r in payload if isinstance(r, dict) and r.get("fetchedAt")]
    if not stamped:
        rows.append(f"{'UNKNOWN':<9} {label} fetch age — no fetchedAt yet (written before it existed)")
        return
    oldest: int | None = None
    for rec in stamped:
        when = parse_day(rec["fetchedAt"])
        if when is None or when > today:
            continue
        age = (today - when).days
        oldest = age if oldest is None or age > oldest else oldest
    if oldest is None:
        return
    status = "STALE" if oldest > FETCH_MAX_AGE_DAYS else "OK"
    rows.append(f"{status:<9} {label} last fetched {oldest}d ago (max {FETCH_MAX_AGE_DAYS}d)")
    if oldest > FETCH_MAX_AGE_DAYS:
        problems.append(
            f"{label}: our last successful fetch was {oldest} days ago, budget "
            f"{FETCH_MAX_AGE_DAYS}d — this is our pipeline, not the source's lag"
        )


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

        # An empty optional source is the expected shipped state, not a fault.
        # Reported so it stays visible in the health table — silence would be
        # its own failure mode — but it raises no alarm.
        if filename in OPTIONAL_IF_EMPTY and not payload:
            rows.append(f"{'NOT SET':<9} {label}  (empty by design — no licence to publish)")
            continue

        newest = newest_in_field(payload, field)
        if newest is None:
            problems.append(f"{label}: no usable '{field}' in {filename}")
            rows.append(f"{'NO DATE':<9} {label}")
            continue

        if filename == "macro.json":
            check_per_indicator_budgets(payload, label, problems, rows)

        if filename == "context.json":
            report_per_indicator(payload, label, rows)
            check_fetch_recency(payload, label, problems, rows)

        age = (today - newest).days
        status = "STALE" if age > max_age else "OK"
        rows.append(f"{status:<9} {label}  {age}d old (max {max_age}d)")
        if age > max_age:
            problems.append(
                f"{label}: newest '{field}' is {age} days old, budget {max_age}d ({rationale})"
            )

    check_bonds_are_plausible(problems, rows)

    print("=== DATA HEALTH ===")
    for row in rows:
        print(row)

    # THE REPORT IS WRITTEN ON EVERY RUN, INCLUDING THE HEALTHY ONE.
    #
    # It used to be written only when `problems` was non-empty. The alert step
    # reads this file and, if the read throws, says:
    #
    #     (no freshness report — a scraper step failed before the check ran)
    #
    # So a PERFECTLY HEALTHY pipeline produced the sentence asserting that a
    # step had failed before the check ran. Observed on 2026-08-07: the check
    # had run and passed — the alert step's own `healthFailed` was false — and
    # the issue still carried that line, sending a reader looking for a crash
    # that never happened.
    #
    # The fallback text states a CAUSE it cannot know: a missing file means the
    # file is missing, not that a step failed. Writing unconditionally removes
    # the ambiguity at the source, which is better than rewording a message
    # that is only ever read when something has already gone unexplained.
    report = ("\n".join(f"- {p}" for p in problems) if problems
              else "All datasets within their freshness budgets.")
    Path("healthcheck-report.txt").write_text(report)

    if problems:
        print("\n=== PROBLEMS ===", file=sys.stderr)
        for p in problems:
            print(f"- {p}", file=sys.stderr)
        sys.exit(1)

    print("\nAll datasets within their freshness budgets.")


if __name__ == "__main__":
    main()
