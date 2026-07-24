"""Fetch NSE daily bond trading data into secondary.json.

The NSE publishes bond trading statistics in varying formats (XLS/XLSX,
sometimes behind a changed URL). Column names are matched loosely; any
schema mismatch fails loudly rather than emitting wrong prices.
"""
import os
import sys
from datetime import date
from io import BytesIO

import pandas as pd
import requests

from common import write_dataset

URL = os.environ.get("NSE_DAILY_TRADE_URL", "")

COLUMN_ALIASES = {
    "isin": ["isin", "isin code", "isin no"],
    "price": ["clean price", "price", "avg price"],
    "yield": ["yield", "ytm", "avg yield"],
    "volumeKES": ["turnover", "value", "deal value", "volume (kes)"],
}


def find_column(df: pd.DataFrame, aliases: list) -> str:
    cols = {str(c).strip().lower(): c for c in df.columns}
    for a in aliases:
        if a in cols:
            return cols[a]
    raise ValueError(f"no column matching {aliases} in {list(df.columns)}")


def parse(url: str) -> list:
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    df = pd.read_excel(BytesIO(resp.content), sheet_name=0)
    cols = {k: find_column(df, v) for k, v in COLUMN_ALIASES.items()}
    today = date.today().isoformat()
    out = []
    for _, row in df.iterrows():
        isin = str(row[cols["isin"]]).strip()
        if not isin.startswith("KE"):
            continue
        out.append({
            "isin": isin,
            "tradeDate": today,
            "price": float(row[cols["price"]]),
            "yield": float(row[cols["yield"]]),
            "volumeKES": float(row[cols["volumeKES"]]),
            "tradesCount": 1,
        })
    return out


if __name__ == "__main__":
    if not URL:
        print("Set NSE_DAILY_TRADE_URL — the NSE endpoint must be verified manually first.", file=sys.stderr)
        sys.exit(2)
    write_dataset("secondary", parse(URL))
