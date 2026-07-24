"""Scrape headline macro indicators (CBR, CPI, USD/KES) into macro.json."""
import re
import sys
from datetime import date

import requests
from bs4 import BeautifulSoup

from common import write_dataset

# CBK returns 403 to non-browser clients (verified 2026-07 — see docs/DATA-SOURCES.md),
# so present a standard browser UA.
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

    try:
        knbs = fetch_text("https://www.knbs.or.ke/")
        cpi = re.search(r"(?:inflation|CPI)[\s\S]{0,80}?([\d.]+)\s*%", knbs, re.I)
        if cpi:
            records.append({"id": f"cpi-{today}", "indicator": "CPI", "value": float(cpi.group(1)),
                            "date": today, "unit": "% y/y", "source": "KNBS"})
    except requests.RequestException as exc:
        print(f"KNBS fetch failed ({exc}) — continuing with CBK indicators", file=sys.stderr)

    return records


if __name__ == "__main__":
    write_dataset("macro", scrape())
