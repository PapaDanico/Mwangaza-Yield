"""Probe CBK's HTML data tables — can we read them without OCR or a licence?

The MPC Press Releases page renders a DataTables grid with CSV/Excel export
buttons and 127 rows of rate decisions. If those rows are in the DOM (or behind
a plain AJAX endpoint), CBK's full Central Bank Rate history is extractable —
which turns our static "CBR 8.75%" into a rate-cycle narrative.

This probe reports, per page: whether a <table> is present, how many rows are
actually in the served HTML, whether DataTables is in use, and whether an AJAX
source is declared. Read-only, never gates CI.
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
TIMEOUT = 60

PAGES = [
    ("MPC Press Releases (CBR history)", "https://www.centralbank.go.ke/press/"),
    ("Statistical Bulletin", "https://www.centralbank.go.ke/statistical-bulletin/"),
    ("Monthly Economic Indicators", "https://www.centralbank.go.ke/monthly-economic-indicators/"),
    ("Weekly Bulletin (listing)", "https://www.centralbank.go.ke/weekly-bulletin/"),
]

# A DataTables grid usually declares an ajax source or ships the rows inline.
AJAX_RE = re.compile(r"""["']ajax["']\s*:\s*["']([^"']+)["']""", re.I)
DT_RE = re.compile(r"dataTable|DataTables", re.I)
RATE_RE = re.compile(r"CBR\s+(?:at|to)\s+([\d.]+)", re.I)


def probe(label: str, url: str) -> None:
    print(f"\n=== {label} ===\n  {url}")
    try:
        r = requests.get(url, headers=UA, timeout=TIMEOUT)
    except requests.RequestException as exc:
        print(f"  ERROR {exc.__class__.__name__}")
        return
    print(f"  HTTP {r.status_code}, {len(r.content)} bytes")
    if r.status_code != 200:
        return

    soup = BeautifulSoup(r.text, "lxml")
    tables = soup.find_all("table")
    print(f"  tables in DOM: {len(tables)}")
    print(f"  DataTables present: {bool(DT_RE.search(r.text))}")

    ajax = AJAX_RE.search(r.text)
    if ajax:
        print(f"  >>> AJAX SOURCE DECLARED: {ajax.group(1)[:120]}")

    for i, table in enumerate(tables[:3], 1):
        rows = table.find_all("tr")
        print(f"  table {i}: {len(rows)} rows in served HTML")
        for tr in rows[1:4]:
            cells = [c.get_text(" ", strip=True)[:60] for c in tr.find_all(["td", "th"])]
            if any(cells):
                print(f"    | {' | '.join(cells)}")

    # The payoff test: are actual rate decisions readable from this HTML?
    rates = RATE_RE.findall(r.text)
    if rates:
        uniq = sorted({float(x) for x in rates}, reverse=True)
        print(f"  >>> {len(rates)} CBR mentions found in HTML; distinct values: {uniq[:15]}")
    else:
        print("  no CBR decision text found in the served HTML "
              "(likely rendered client-side from an endpoint)")

    # PDF links are the fallback route for the bulletin/indicator pages.
    pdfs = [a["href"] for a in soup.find_all("a", href=True)
            if a["href"].lower().endswith(".pdf")]
    if pdfs:
        print(f"  {len(pdfs)} PDF link(s); newest-looking 3:")
        for href in pdfs[:3]:
            print(f"    - {href[:120]}")


def main() -> None:
    for label, url in PAGES:
        probe(label, url)
    print("\nA table is usable if rows appear in the served HTML, or an AJAX "
          "source is declared that returns JSON.", file=sys.stderr)


if __name__ == "__main__":
    main()
