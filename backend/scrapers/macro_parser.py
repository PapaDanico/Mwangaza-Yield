"""Scrape headline macro indicators (CBR, CPI, USD/KES) into macro.json."""
import json
import re
import sys
from datetime import date

import requests
from bs4 import BeautifulSoup

from common import DATA_DIR, write_dataset
from sources import (
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

    fx = resolve("FX_USD_KES", FX_ROUTES, fetch, *FX_BAND)
    cbr = resolve("CBR", CBR_ROUTES, fetch, *CBR_BAND)
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
    cpi = resolve("CPI", CPI_ROUTES, fetch, *CPI_BAND)
    report(cpi)
    if cpi.ok:
        records.append({"id": f"cpi-{today}", "indicator": "CPI", "value": cpi.value,
                        "date": today, "unit": "% y/y",
                        "source": "KNBS" if cpi.via == "knbs-home" else "CBK",
                        "fallback": cpi.via != "knbs-home",
                        "via": cpi.via})

    existing = read_existing()
    return carry_forward(
        date_by_observation(records, existing), existing, (fx, cbr, cpi),
    )


def read_existing() -> list:
    path = DATA_DIR / "macro.json"
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return []


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
    write_dataset("macro", scrape())
