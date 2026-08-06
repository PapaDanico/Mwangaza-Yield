"""Scrape headline macro indicators (CBR, CPI, USD/KES) into macro.json."""
import json
import re
import sys
from datetime import date

import requests
from bs4 import BeautifulSoup

from common import DATA_DIR, write_dataset

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

    cbk = fetch_text("https://www.centralbank.go.ke/")

    # WHY EXTRACTION FAILURE IS REPORTED SEPARATELY FROM CARRY-FORWARD
    #
    # carry_forward already prints when an indicator is preserved, and it did:
    # "[macro] carrying forward FX_USD_KES from 2026-07-20" appeared on every
    # run for eighteen days while USD/KES — a rate CBK publishes every trading
    # day — sat frozen on the dashboard. Nobody read it, because a line in a
    # green job's log is not an alarm.
    #
    # Two failures produce that identical line and want opposite responses.
    # If the PAGE WAS UNREACHABLE, waiting is correct: the next run fixes it.
    # If the page loaded and the PATTERN NO LONGER MATCHES, waiting fixes
    # nothing — CBK has changed its markup and the scraper needs editing. This
    # says which, so the next person to look does not have to guess.
    #
    # The alarm itself now lives in healthcheck.py's per-indicator budgets,
    # where a stale FX can no longer hide behind a fresh CPI.
    missed: list[str] = []

    cbr = re.search(r"Central Bank Rate[\s\S]{0,80}?([\d.]+)\s*%", cbk, re.I)
    if cbr:
        records.append({"id": f"cbr-{today}", "indicator": "CBR", "value": float(cbr.group(1)),
                        "date": today, "unit": "%", "source": "CBK"})
    else:
        missed.append("CBR")

    fx = re.search(r"(?:USD|US Dollar)[\s\S]{0,60}?(\d{2,3}\.\d+)", cbk)
    if fx:
        records.append({"id": f"fx-{today}", "indicator": "FX_USD_KES", "value": float(fx.group(1)),
                        "date": today, "unit": "KES/USD", "source": "CBK"})
    else:
        missed.append("FX_USD_KES")

    if missed:
        print(
            f"[macro] PAGE LOADED ({len(cbk)} chars) BUT NO MATCH for {', '.join(missed)} — "
            f"this is a changed CBK layout, not an outage, and waiting will not fix it",
            file=sys.stderr,
        )

    # KNBS first; CBK publishes the same headline CPI and is the fallback.
    # `fallback` is carried as its own field rather than smuggled into the
    # source string: the UI cannot branch on prose, and "CBK (KNBS
    # unavailable)" was being rendered as though it were an ordinary citation.
    cpi_value = None
    try:
        knbs = fetch_text("https://www.knbs.or.ke/")
        cpi = re.search(r"(?:inflation|CPI)[\s\S]{0,80}?([\d.]+)\s*%", knbs, re.I)
        if cpi:
            cpi_value = (float(cpi.group(1)), "KNBS", False)
    except requests.exceptions.SSLError as exc:
        # Verified 2026-07-25 on a network-open runner: knbs.or.ke fails TLS
        # verification (incomplete chain). We do NOT disable verification —
        # silently trusting an unverified certificate for financial data is a
        # worse outcome than falling back to another authoritative source.
        print(f"KNBS TLS verification failed ({exc.__class__.__name__}) — falling back to CBK", file=sys.stderr)
    except requests.RequestException as exc:
        print(f"KNBS fetch failed ({exc}) — falling back to CBK", file=sys.stderr)

    if cpi_value is None:
        cpi = re.search(r"(?:Inflation Rate|Overall Inflation)[\s\S]{0,80}?([\d.]+)\s*%", cbk, re.I)
        if cpi:
            cpi_value = (float(cpi.group(1)), "CBK", True)

    if cpi_value:
        records.append({"id": f"cpi-{today}", "indicator": "CPI", "value": cpi_value[0],
                        "date": today, "unit": "% y/y", "source": cpi_value[1],
                        "fallback": cpi_value[2]})

    existing = read_existing()
    return carry_forward(date_by_observation(records, existing), existing)


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


def carry_forward(records: list, existing: list) -> list:
    """Keep indicators this run could not refresh.

    Without this, a partial scrape REPLACES the dataset and silently deletes
    whatever it failed to fetch — e.g. losing CPI from the app entirely because
    KNBS was down that morning. A stale indicator, clearly dated, beats a
    missing one.
    """
    fresh = {r["indicator"] for r in records}
    for old in existing:
        if old.get("indicator") not in fresh:
            print(f"[macro] carrying forward {old.get('indicator')} from {old.get('date')}",
                  file=sys.stderr)
            records.append(old)
    return records


if __name__ == "__main__":
    write_dataset("macro", scrape())
