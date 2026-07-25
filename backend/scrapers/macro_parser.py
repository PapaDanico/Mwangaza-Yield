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
    cbr = re.search(r"Central Bank Rate[\s\S]{0,80}?([\d.]+)\s*%", cbk, re.I)
    if cbr:
        records.append({"id": f"cbr-{today}", "indicator": "CBR", "value": float(cbr.group(1)),
                        "date": today, "unit": "%", "source": "CBK"})
    fx = re.search(r"(?:USD|US Dollar)[\s\S]{0,60}?(\d{2,3}\.\d+)", cbk)
    if fx:
        records.append({"id": f"fx-{today}", "indicator": "FX_USD_KES", "value": float(fx.group(1)),
                        "date": today, "unit": "KES/USD", "source": "CBK"})

    # KNBS first; CBK publishes the same headline CPI and is the fallback.
    cpi_value = None
    try:
        knbs = fetch_text("https://www.knbs.or.ke/")
        cpi = re.search(r"(?:inflation|CPI)[\s\S]{0,80}?([\d.]+)\s*%", knbs, re.I)
        if cpi:
            cpi_value = (float(cpi.group(1)), "KNBS")
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
            cpi_value = (float(cpi.group(1)), "CBK (KNBS unavailable)")

    if cpi_value:
        records.append({"id": f"cpi-{today}", "indicator": "CPI", "value": cpi_value[0],
                        "date": today, "unit": "% y/y", "source": cpi_value[1]})

    return carry_forward(records)


def carry_forward(records: list) -> list:
    """Keep indicators this run could not refresh.

    Without this, a partial scrape REPLACES the dataset and silently deletes
    whatever it failed to fetch — e.g. losing CPI from the app entirely because
    KNBS was down that morning. A stale indicator, clearly dated, beats a
    missing one.
    """
    path = DATA_DIR / "macro.json"
    if not path.exists():
        return records
    try:
        existing = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return records

    fresh = {r["indicator"] for r in records}
    for old in existing:
        if old.get("indicator") not in fresh:
            print(f"[macro] carrying forward {old.get('indicator')} from {old.get('date')}",
                  file=sys.stderr)
            records.append(old)
    return records

    return records


if __name__ == "__main__":
    write_dataset("macro", scrape())
