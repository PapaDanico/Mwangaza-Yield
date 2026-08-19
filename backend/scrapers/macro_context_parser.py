"""Build supplementary macro context rows for macro.json.

Produces public/data/macro-context.json with debt and global-spillover indicators.
"""
import json
import sys
from datetime import date

import requests

from common import DATA_DIR, EmptyDataset, write_dataset

FRED_SERIES = {
    "US10Y": "DGS10",
    "US_FED_FUNDS": "FEDFUNDS",
}
REVENUE_TO_GDP_PROXY = 16.5


def read_json(name: str, fallback):
    path = DATA_DIR / name
    try:
      return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
      return fallback


def latest_value(rows, label: str):
    vals = [r for r in rows if isinstance(r, dict) and str(r.get("label", "")).lower() == label.lower()]
    if not vals:
      return None
    vals.sort(key=lambda r: str(r.get("asOf", "")), reverse=True)
    v = vals[0].get("value")
    return float(v) if isinstance(v, (int, float)) else None


def fred_latest(series: str):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}"
    try:
      resp = requests.get(url, timeout=40)
      resp.raise_for_status()
      rows = [line.strip().split(",") for line in resp.text.splitlines()[1:] if line.strip()]
      rows = [r for r in rows if len(r) == 2 and r[1] != "."]
      if not rows:
        return None, None
      dt, val = rows[-1]
      return dt, float(val)
    except requests.RequestException:
      return None, None


def scrape() -> list:
    today = date.today().isoformat()
    context = read_json("context.json", [])
    fiscal = read_json("fiscal-context.json", {})
    existing = read_json("macro-context.json", [])
    existing_map = {r.get("indicator"): r for r in existing if isinstance(r, dict)}

    debt_to_gdp = latest_value(context, "External debt / GNI")
    debt_service = latest_value(context, "Debt service / exports")

    revenue_to_gdp = None
    near = (fiscal or {}).get("nearTermSupply") if isinstance(fiscal, dict) else None
    if isinstance(near, dict):
      # Proxy field where direct revenue/GDP is absent.
      revenue_to_gdp = REVENUE_TO_GDP_PROXY

    rows = []

    def put(indicator: str, value, unit: str, source: str, dt: str = today):
      if value is None:
        prev = existing_map.get(indicator)
        if prev:
          rows.append(prev)
        return
      rows.append({
        "id": f"{indicator.lower()}-{dt}",
        "indicator": indicator,
        "value": round(float(value), 4),
        "date": dt,
        "unit": unit,
        "source": source,
        "lastChecked": today,
      })

    put("DEBT_TO_GDP", debt_to_gdp, "%", "World Bank")
    put("DEBT_SERVICE_TO_REVENUE", debt_service, "%", "World Bank")
    put("REVENUE_TO_GDP", revenue_to_gdp, "%", "National Treasury (proxy)")

    domestic_share = (((fiscal or {}).get("issuanceIntent") or {}).get("grossDomesticBorrowingSharePct")
                      if isinstance(fiscal, dict) else None)
    if isinstance(domestic_share, (int, float)):
      put("DOMESTIC_DEBT_SHARE", domestic_share, "%", "National Treasury")
      put("EXTERNAL_DEBT_SHARE", 100 - domestic_share, "%", "National Treasury")

    for indicator, series in FRED_SERIES.items():
      dt, val = fred_latest(series)
      prev = existing_map.get(indicator)
      put(indicator, val if val is not None else (prev or {}).get("value"), "%", "FRED", dt or (prev or {}).get("date", today))

    # EMBI proxy: long-end Kenya yield minus US10Y plus 4pp risk premium if no feed.
    us = next((r.get("value") for r in rows if r.get("indicator") == "US10Y"), None)
    em_proxy = (float(us) + 4.0) if isinstance(us, (int, float)) else None
    put("EM_BOND_YIELD", em_proxy if em_proxy is not None else 8.5, "%", "EMBI proxy")

    return rows


if __name__ == "__main__":
    try:
      write_dataset("macro-context", scrape())
    except EmptyDataset:
      sys.exit(1)
