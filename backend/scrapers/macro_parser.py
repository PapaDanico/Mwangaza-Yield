"""Scrape headline macro indicators (CBR, CPI, USD/KES) into macro.json."""
import json
import re
import sys
from datetime import date

import requests
from bs4 import BeautifulSoup

from common import EmptyDataset, DATA_DIR, write_dataset
from sources import (
    Attempt, Resolution,
    resolve, report,
    FX_ROUTES, FX_BAND, CBR_ROUTES, CBR_BAND, CPI_ROUTES, CPI_BAND,
)

# CBK is reachable from code (all endpoints HTTP 200, verified 2026-07-25 on a
# network-open runner). A browser UA is sent as good manners, not necessity.
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}


def fetch_text(url: str) -> str:
    resp = requests.get(url, headers=UA, timeout=60)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, "lxml").get_text(" ")


def scrape() -> list:
    today = date.today().isoformat()
    records = []

    # RANKED ROUTES, NOT ONE REGEX. See sources.py: each indicator declares an
    # ordered list of ways to obtain it plus a plausibility band, so a layout
    # change on the preferred page costs a fallback rather than an update, and
    # a match that is not the quantity is rejected instead of published.
    #
    # Pages are fetched at most once each and shared across indicators — three
    # of the routes below point at the CBK home page.
    cache: dict[str, str] = {}

    def fetch(url: str) -> str:
        if url not in cache:
            cache[url] = fetch_text(url)
        return cache[url]

    # Read the previous dataset BEFORE deciding what to publish. A new figure
    # is judged against the last one we trusted, not only against a static
    # band — see implausible_move, and the 85.1625 USD/KES it exists to stop.
    existing = read_existing()

    fx = reject_implausible(resolve("FX_USD_KES", FX_ROUTES, fetch, *FX_BAND), existing)
    cbr = reject_implausible(resolve("CBR", CBR_ROUTES, fetch, *CBR_BAND), existing)
    report(fx)
    report(cbr)

    if cbr.ok:
        records.append({"id": f"cbr-{today}", "indicator": "CBR", "value": cbr.value,
                        "date": today, "unit": "%", "source": "CBK", "via": cbr.via})
    if fx.ok:
        records.append({"id": f"fx-{today}", "indicator": "FX_USD_KES", "value": fx.value,
                        "date": today, "unit": "KES/USD", "source": "CBK indicative",
                        "via": fx.via})

    # KNBS first, CBK as the fallback — the ordering that `via` now records in
    # the data rather than in a source string the UI cannot branch on. KNBS
    # fails TLS verification from CI on an incomplete chain, verified again on
    # 2026-08-06, and we do not disable verification for financial data; the
    # resolver reports that as a failed route and moves on.
    cpi = reject_implausible(resolve("CPI", CPI_ROUTES, fetch, *CPI_BAND), existing)
    report(cpi)
    if cpi.ok:
        rec = {"id": f"cpi-{today}", "indicator": "CPI", "value": cpi.value,
               "date": today, "unit": "% y/y",
               "source": "KNBS" if cpi.via == "knbs-home" else "CBK",
               "fallback": cpi.via != "knbs-home",
               "via": cpi.via}
        period = reference_period(cpi.value)
        if period:
            rec["period"] = period
        records.append(rec)

    merged = carry_forward(
        date_by_observation(records, existing), existing, (fx, cbr, cpi),
    )
    merged.extend(load_macro_context(existing))
    return one_row_per_indicator(merged)


# How far a figure may move from the last value we trusted before we refuse it.
#
# THE BAND CHECKS BOUNDS, NOT TRUTH — AND THAT GAP SHIPPED A WRONG RATE.
#
# On 2026-08-07 the live route probe resolved FX_USD_KES to 85.1625 from CBK's
# forex page. USD/KES is about 129.5. 85.16 is roughly where the rate sat in
# 2015, so the pattern is matching a historical row rather than today's. It
# passed every check we had: the page was reachable, the regex matched, the
# value parsed as a number, and 85.1625 sits comfortably inside the 50-500
# plausibility band.
#
# test_sources.py states that limitation explicitly rather than pretending
# otherwise — "band checks bounds, not truth — this is by design". The design
# was right and the consequence was still a 34% error about to be published as
# fact on a site people use to decide where to put money. Worse than the
# eighteen-day staleness it was introduced to fix: stale data is old and says
# so, this is wrong data wearing the clothes of fresh data.
#
# A band cannot catch it because 85 is a perfectly plausible exchange rate. The
# thing that makes it obviously wrong is that we already hold 129.5 and no
# currency moves 34% between two readings without it being world news. So the
# check that works is not "is this number reasonable" but "is this a reasonable
# DISTANCE from the number we last trusted".
#
# Tolerances are per indicator and deliberately generous — this is a
# parse-error trap, not a market-move filter. USD/KES has not moved 10% in a
# fortnight in years; inflation genuinely can jump by half its own value; the
# CBR moves in steps of 0.25-1.0 against a base near 9.
#
# When it fires, the previous value is carried forward and the run reports a
# failure. That is the right trade: a stale figure that says it is stale beats
# a wrong figure that says it is current.
MAX_MOVE = {
    "FX_USD_KES": 0.10,
    "CPI": 0.50,
    "CPI_CORE": 0.50,
    "CPI_NONCORE": 0.50,
    "CBR": 0.25,
}
DEFAULT_MAX_MOVE = 0.50


def implausible_move(indicator: str, value, existing: list) -> str | None:
    """Reason to reject `value` as too far from the last trusted one, or None.

    Returns None when there is nothing to compare against. A first observation
    cannot be checked this way and refusing it would mean never accepting any
    figure at all — a guard that fires in every case, which this codebase has
    already caught itself writing once.
    """
    if value is None:
        return None
    prior = next(
        (r for r in existing
         if isinstance(r, dict) and r.get("indicator") == indicator
         and isinstance(r.get("value"), (int, float))),
        None,
    )
    if prior is None:
        return None
    old = float(prior["value"])
    if old == 0:
        return None
    move = abs(float(value) - old) / abs(old)
    limit = MAX_MOVE.get(indicator, DEFAULT_MAX_MOVE)
    # The epsilon is not decoration. A move of exactly the limit computes as
    # 0.10000000000000009 for 129.5 -> 142.45, so a bare `<=` refuses the
    # boundary it is documented to allow, and which value happens to fail
    # depends on binary representation rather than on anything real.
    if move <= limit + 1e-9:
        return None
    return (
        f"value {value} is {move * 100:.1f}% from the last trusted {old} "
        f"(limit {limit * 100:.0f}%) — treating as a parse error, not a market move"
    )


def reject_implausible(res, existing: list):
    """Turn a resolution holding an implausible value into a FAILED one.

    Deliberately expressed as a failure rather than as a new third state. The
    downstream machinery — carry_forward keeping the last good value,
    `attemptFailed` recording why in the data, healthcheck raising it — was
    built for "we tried and got nothing usable", and a wrong number IS nothing
    usable. Inventing a parallel path would mean a second set of reporting to
    keep correct, and the one that got less attention would be the one that
    went quiet.

    The rejected value is preserved in the attempt list, because "we got
    85.1625 and refused it" is a far more useful thing to read at 6am than "no
    value".
    """
    if res is None or not res.ok:
        return res
    reason = implausible_move(res.indicator, res.value, existing)
    if reason is None:
        return res
    print(f"[macro] REJECTED {res.indicator}: {reason}", file=sys.stderr)
    attempts = list(res.attempts)
    attempts.append(Attempt(route=res.via or "?", url="", ok=False,
                            reason=reason, value=res.value))
    return Resolution(indicator=res.indicator, value=None, via=None,
                      attempts=attempts)


def reference_period(value, history: list | None = None) -> str | None:
    """Which MONTH a headline CPI print describes, as YYYY-MM.

    A monthly statistic has two dates and this file only ever recorded one.
    `date` means "when this figure first appeared to us" — correct for USD/KES,
    which genuinely changes on the day we read it, and the reason
    `date_by_observation` exists. For CPI it is the date we happened to scrape
    a number describing a month that had already closed.

    The consequence reached the reader. On 2026-08-05 the dashboard showed

        Inflation (CPI)   6.49 % y/y   CBK · 2026-08-05

    and 6.49 is the twelve-month inflation for JULY. CBK's own table row is
    ['2026', 'July', '5.08', '6.49']. So the site dated a July figure to
    August, on a card whose entire job is telling a reader how current a number
    is.

    The same file already got this right for the splits: CPI_CORE and
    CPI_NONCORE carry 2026-07-31 and cite "KNBS ... July 2026". The headline
    was the odd one out, which is how it survived — it looked freshER than its
    own components rather than wrong.

    The month is not guessed from the calendar. Deriving it as "last month"
    would be right most of the time and silently wrong exactly when a release
    is late, which is when a reader most needs to know what they are looking
    at. It comes from cpi-history.json, the series scraped from CBK's dated
    table: the newest month whose value equals this print. `corroborates()`
    already relies on that identity holding, so this reuses a check the project
    trusts rather than inventing a second, weaker one.

    Returns None when nothing matches — a new print we have no history row for
    yet, or a changed value. No period is then written and the UI falls back to
    the observation date, which is the honest answer rather than a plausible
    one.
    """
    if value is None:
        return None
    if history is None:
        path = DATA_DIR / "cpi-history.json"
        try:
            history = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            return None
    if not isinstance(history, list):
        return None
    months = [
        str(r["date"])[:7] for r in history
        if isinstance(r, dict) and r.get("date")
        # Float equality is safe here: both sides are one- or two-decimal
        # percentages parsed from the same publisher's tables, not computed.
        and r.get("value") == value
    ]
    return max(months) if months else None


def read_existing() -> list:
    path = DATA_DIR / "macro.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def load_macro_context(existing: list) -> list:
    path = DATA_DIR / "macro-context.json"
    if not path.exists():
        return [
            r for r in existing
            if isinstance(r, dict)
            and r.get("indicator") in {
                "DEBT_TO_GDP", "DEBT_SERVICE_TO_REVENUE", "INTEREST_TO_REVENUE",
                "DOMESTIC_DEBT_SHARE", "EXTERNAL_DEBT_SHARE", "REVENUE_TO_GDP",
                "US10Y", "US_FED_FUNDS", "EM_BOND_YIELD",
            }
        ]
    try:
        rows = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []
    return rows if isinstance(rows, list) else []


def date_by_observation(records: list, existing: list) -> list:
    """Make `date` mean "when this figure changed", not "when we looked".

    Every record used to be stamped with today's date because that is when the
    scrape ran. For USD/KES, which moves daily, the two are near enough the
    same thing. For CPI they are not: KNBS publishes it monthly, the CBR is set
    at MPC meetings weeks apart, and re-stamping an unchanged number every
    morning presents a figure from weeks ago as observed today.

    That is not a cosmetic problem. It is the exact defect this project keeps
    finding — a date refreshed over a value that was not — except automated, so
    it renewed its own false freshness daily with nobody deciding to. Inflation
    sat at 6.41% while its date advanced every day, and every staleness check
    downstream was satisfied by a number nothing had confirmed.

    So an unchanged value keeps the date it first appeared, and `lastChecked`
    records that we looked and found it the same. A reader can then tell the
    difference between "still 6.41% as of this morning" and "6.41%, unconfirmed
    since June".
    """
    previous = {r.get("indicator"): r for r in existing}
    for rec in records:
        old = previous.get(rec["indicator"])
        rec["lastChecked"] = today_iso()
        if old and old.get("value") == rec["value"] and old.get("source") == rec.get("source"):
            rec["date"] = old.get("date", rec["date"])
            # The id follows the observation date so an unchanged figure keeps
            # a stable identity across runs instead of minting a new row a day.
            rec["id"] = old.get("id", rec["id"])
    return records


def today_iso() -> str:
    return date.today().isoformat()


def one_row_per_indicator(records: list) -> list:
    """One indicator, one row — asserted here rather than hoped for upstream.

    THE MERGE IS NOT IDEMPOTENT WITHOUT THIS, AND IT SHIPPED.

    `scrape()` assembles macro.json from three writers that each believe they
    own a disjoint slice of it: the fresh scrape, `carry_forward` (anything the
    scrape did not refresh), and `load_macro_context` (the debt and global
    rows). The third overlaps the second. `carry_forward` walks EVERY row of
    the previous file and re-appends whatever is not in this run's fresh set,
    which includes every context row; `load_macro_context` then appends the
    same rows again from the same file, because macro-context.json does not
    exist and its fallback re-reads them out of `existing`.

    So every context indicator came back twice, and the output of one run is
    the input of the next: 14 rows became 22 on 2026-08-19, and would have
    become 38, then 70, then 134 — doubling every refresh, byte-identical
    duplicates carrying identical `id`s, until the file was mostly copies of
    itself.

    Nothing downstream failed loudly at it, which is why it ran for a day
    unnoticed: `latestValue` in macro-context.ts sorts by date and takes the
    first, so a duplicate reads the same as no duplicate. The damage was to
    everything that COUNTS rows rather than reading them — the manifest's
    recordCount, the data-health table, any future consumer that maps over the
    file — plus a trend arrow comparing a row against its own copy and
    therefore always reporting "unchanged".

    Deduping at the seam is the fix rather than untangling which writer should
    have yielded, because the invariant is what actually matters and it is
    cheap to state: macro.json holds the current value of each indicator, one
    row each. Order is precedence — fresh, then carried-forward, then context —
    so the FIRST row wins and the later copy is dropped.
    """
    seen: dict = {}
    out = []
    for row in records:
        if not isinstance(row, dict):
            continue
        name = row.get("indicator")
        if name is None or name in seen:
            if name is not None:
                print(f"[macro] dropping duplicate row for {name} "
                      f"(id={row.get('id')})", file=sys.stderr)
            continue
        seen[name] = row
        out.append(row)
    return out


def carry_forward(records: list, existing: list, resolutions=()) -> list:
    """Keep indicators this run could not refresh, and say so IN THE DATA.

    Without the carrying-forward, a partial scrape REPLACES the dataset and
    silently deletes whatever it failed to fetch — e.g. losing CPI from the app
    entirely because KNBS was down that morning. A stale indicator, clearly
    dated, beats a missing one.

    But carrying a row forward UNCHANGED is how USD/KES sat at 2026-07-20 for
    seventeen days without anybody noticing. The carried row was byte-identical
    to a healthy one: same `date`, same `value`, and — because `lastChecked` is
    only stamped on a record that actually resolved — no field at all saying
    when we last tried. Nothing downstream could distinguish

        we have not attempted this indicator            (nothing is wrong)
        we attempt it every run and it keeps failing    (a source has moved)

    and the second is an emergency wearing the first one's clothes. The only
    trace was a line on stderr in a CI log nobody reads, which is the same as
    no trace: this project's recurring defect is a guard that cannot fire in
    the case it exists to detect, and a warning nobody receives has not fired.

    So a failed attempt is now recorded on the row itself. Deliberately NOT via
    `lastChecked` — that field means "we looked and the figure was confirmed
    unchanged", and stamping it on a failure would make a broken indicator
    render as freshly verified every morning. That is the false-freshness bug
    `date_by_observation` exists to prevent, and writing it back in here under a
    different name would undo that fix. A failure gets its own vocabulary:

        lastAttempt   — when we last tried, succeed or fail
        attemptFailed — why the last try produced nothing

    `lastChecked` keeps meaning confirmation, and its ABSENCE alongside a
    recent `lastAttempt` is now a readable statement: unconfirmed since `date`,
    despite trying.
    """
    failed = {
        r.indicator: r for r in resolutions
        if r is not None and not r.ok
    }
    fresh = {r["indicator"] for r in records}
    for old in existing:
        name = old.get("indicator")
        if name in fresh:
            continue
        row = dict(old)
        res = failed.get(name)
        if res is not None:
            # Attempted this run and every route failed. Name the routes so the
            # data says which way in, not merely that there was no way in.
            row["lastAttempt"] = today_iso()
            row["attemptFailed"] = "; ".join(
                f"{a.route}: {a.reason}" for a in res.attempts
            ) or "no routes configured"
            print(f"[macro] {name} FAILED every route, carrying {old.get('date')} "
                  f"forward: {row['attemptFailed']}", file=sys.stderr)
        else:
            print(f"[macro] carrying forward {name} from {old.get('date')} "
                  f"(not attempted this run)", file=sys.stderr)
        records.append(row)
    return records


if __name__ == "__main__":
    try:
        write_dataset("macro", scrape())
    except EmptyDataset:
        sys.exit(1)
