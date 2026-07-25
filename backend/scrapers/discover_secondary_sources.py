"""Probe the July 2026 shortlist of secondary data sources for viability.

Viability here is TWO questions, and the second one kills more candidates than
the first:

  1. Can software read it?  (reachable, machine-readable, no key required)
  2. Are we permitted to?   (licence, terms of use, redistribution rights)

A source that fails (2) is not a source, however clean its JSON. This app
redistributes what it ingests — it ships static files to the public — so
"available" and "usable" are very different words here.

Read-only. Never gates CI.
"""
import re
import sys

import requests
from bs4 import BeautifulSoup

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 45

CANDIDATES = [
    ("KIPPRA", "https://kippra.or.ke/"),
    ("KIPPRA publications", "https://kippra.or.ke/publications/"),
    ("Cbonds — Kenya", "https://cbonds.com/countries/Kenya-bonds/"),
    ("AfricaFinancials", "https://africanfinancials.com/"),
    ("Bloomberg — Kenya rates", "https://www.bloomberg.com/markets/rates-bonds"),
    ("NSE Data Services — market statistics", "https://www.nse.co.ke/dataservices/market-statistics/"),
]

# Terms language that decides whether a source can be ingested at all.
PAYWALL_RE = re.compile(
    r"subscribe|subscription|sign in|log ?in|request a demo|contact sales|pricing|free trial",
    re.I)
RESTRICT_RE = re.compile(
    r"may not (?:copy|reproduce|redistribute|download|store)|proprietary to|"
    r"all rights reserved|not permitted|written permission|commercial gain|"
    r"except for your personal use",
    re.I)
OPEN_RE = re.compile(r"creative commons|CC BY|open data|public domain|open licen[cs]e", re.I)


def probe(label: str, url: str) -> None:
    print(f"\n=== {label} ===\n  {url}")
    try:
        r = requests.get(url, headers=UA, timeout=TIMEOUT)
    except requests.RequestException as exc:
        print(f"  UNREACHABLE — {exc.__class__.__name__}")
        return

    print(f"  HTTP {r.status_code}, {len(r.content)} bytes, {r.headers.get('content-type', '?')}")
    if r.status_code != 200:
        print("  -> not usable at this URL")
        return

    text = r.text
    soup = BeautifulSoup(text, "lxml")
    page_text = soup.get_text(" ", strip=True)

    # Structured data worth having?
    tables = soup.find_all("table")
    rows = sum(len(t.find_all("tr")) for t in tables)
    pdfs = {a["href"] for a in soup.find_all("a", href=True) if a["href"].lower().endswith(".pdf")}
    csvs = {a["href"] for a in soup.find_all("a", href=True)
            if re.search(r"\.(csv|xlsx?|json)$", a["href"], re.I)}
    print(f"  tables: {len(tables)} ({rows} rows in served HTML) · "
          f"PDF links: {len(pdfs)} · CSV/XLS/JSON links: {len(csvs)}")

    # Terms signals — the question that actually decides this.
    paywall = PAYWALL_RE.findall(page_text)
    restrict = RESTRICT_RE.findall(page_text)
    openlic = OPEN_RE.findall(page_text)
    if openlic:
        print(f"  >>> OPEN-LICENCE SIGNAL: {sorted(set(x.lower() for x in openlic))[:4]}")
    if restrict:
        print(f"  >>> RESTRICTIVE TERMS: {sorted(set(x.lower() for x in restrict))[:5]}")
    if paywall:
        print(f"  >>> PAYWALL / ACCOUNT SIGNAL: {sorted(set(x.lower() for x in paywall))[:5]}")
    if not (openlic or restrict or paywall):
        print("  no licence signal found on this page — check the terms page by hand")

    for href in sorted(csvs)[:3]:
        print(f"    data file: {href[:110]}")
    for href in sorted(pdfs)[:3]:
        print(f"    pdf: {href[:110]}")


def main() -> None:
    for label, url in CANDIDATES:
        probe(label, url)
    print("\nReachable is not the same as permitted. A source is only viable for this "
          "app if we may lawfully REDISTRIBUTE it — we ship static files to the public.",
          file=sys.stderr)


if __name__ == "__main__":
    main()
