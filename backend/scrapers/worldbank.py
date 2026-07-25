"""Pull Kenya sovereign-health indicators from the World Bank Open Data API.

Why this source, when most of the others on the list are unusable:
  * No API key — so it can run in CI without secrets, and could even be called
    from the browser if we ever wanted live refresh.
  * Documented, stable, versioned REST/JSON (v2).
  * CC BY 4.0 licensed, so we may redistribute with attribution. Most Kenyan
    market data is either licensed (NSE bulk feeds) or copyrighted research
    (broker notes), which we link to instead of copying.

The indicators chosen are the ones that tell a BOND investor whether the
borrower is good for the money — not general development statistics.
"""
import sys
from datetime import date

import requests

from common import write_dataset

BASE = "https://api.worldbank.org/v2/country/KE/indicator"

# (World Bank indicator code, human label, unit, sentiment thresholds)
# `good_below` means lower is healthier; None means context-only.
INDICATORS = [
    ("NY.GDP.MKTP.KD.ZG", "GDP growth", "% y/y", None),
    ("FI.RES.TOTL.MO", "Reserves (import cover)", "months", None),
    ("NE.EXP.GNFS.ZS", "Exports / GDP", "%", None),
    ("BN.CAB.XOKA.GD.ZS", "Current account / GDP", "%", None),
]

TIMEOUT = 60


def latest_value(indicator_code: str) -> dict | None:
    """Most recent non-null observation for Kenya, with its year."""
    resp = requests.get(
        f"{BASE}/{indicator_code}",
        params={"format": "json", "per_page": 20, "mrnev": 1},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    payload = resp.json()
    # v2 returns [pagination_header, [observations]]; an error returns a dict.
    if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return None
    for obs in payload[1]:
        if obs.get("value") is not None:
            return {"value": float(obs["value"]), "year": obs["date"]}
    return None


def scrape() -> list:
    records = []
    for code, label, unit, _ in INDICATORS:
        try:
            obs = latest_value(code)
        except requests.RequestException as exc:
            print(f"[worldbank] {code} failed: {exc}", file=sys.stderr)
            continue
        if not obs:
            print(f"[worldbank] {code}: no observation", file=sys.stderr)
            continue
        records.append({
            "id": f"wb-{code.lower().replace('.', '-')}",
            "label": label,
            "value": round(obs["value"], 2),
            "unit": unit,
            "asOf": obs["year"],
            "source": "World Bank Open Data (CC BY 4.0)",
            "sourceUrl": f"https://data.worldbank.org/indicator/{code}?locations=KE",
        })
    return records


if __name__ == "__main__":
    print(f"[worldbank] fetching as of {date.today().isoformat()}", file=sys.stderr)
    write_dataset("context", scrape())
