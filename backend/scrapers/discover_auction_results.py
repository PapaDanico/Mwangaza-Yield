"""Probe CBK for auction RESULTS — the highest-leverage data still missing.

Everything else on the roadmap is downstream of this one dataset:

  * **Coupon rates.** The securities register (§13) gave us 59 outstanding
    bonds but publishes no coupon. Without a coupon we cannot compute a yield,
    so we still ship 9 bonds instead of 59. Auction results carry the coupon.
  * **"Is that yield any good?"** The app says what a bond pays and never what
    comparable bonds cleared at. A year of auction prints answers the question
    every investor actually asks before bidding.
  * **What to bid.** We show what is OFFERED. The weighted average accepted
    rate is the single most useful number for deciding what to bid next time.

The /press/ probe (§10) proved CBK serves DataTables rows inside the HTML on
at least one listing. This checks whether the results pages do the same, or
whether the numbers live inside linked PDFs — a different parser either way,
which is exactly why we look before building.

Read-only. Never gates CI.
"""
import re
import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 45

PAGES = [
    ("Treasury bonds landing", "https://www.centralbank.go.ke/securities/treasury-bonds/"),
    ("Treasury bond results", "https://www.centralbank.go.ke/securities/treasury-bonds/treasury-bonds-results/"),
    ("Treasury bill results", "https://www.centralbank.go.ke/securities/treasury-bills/treasury-bills-results/"),
    ("Auction results (alt path)", "https://www.centralbank.go.ke/auction-results/"),
]

# The vocabulary of an auction result. If these appear in the served HTML, the
# numbers are readable without touching a PDF.
SIGNALS = {
    "coupon rate": re.compile(r"coupon\s*rate", re.I),
    "weighted average": re.compile(r"weighted\s*average", re.I),
    "amount offered": re.compile(r"amount\s*offered|offer\s*amount", re.I),
    "amount accepted": re.compile(r"amount\s*accepted|accepted\s*amount", re.I),
    "performance": re.compile(r"performance\s*(?:rate|%)", re.I),
    "bids received": re.compile(r"bids?\s*received", re.I),
}
ISSUE_RE = re.compile(r"\b(?:FXD|IFB|SDB)\d?/\d{4}/\d+", re.I)
RESULT_PDF_RE = re.compile(r"result|auction", re.I)


def probe(label: str, url: str) -> None:
    print(f"\n=== {label} ===\n  {url}")
    try:
        r = requests.get(url, headers=UA, timeout=TIMEOUT)
    except requests.RequestException as exc:
        print(f"  UNREACHABLE {exc.__class__.__name__}")
        return
    print(f"  HTTP {r.status_code}, {len(r.content)} bytes")
    if r.status_code != 200:
        return

    soup = BeautifulSoup(r.text, "lxml")
    tables = soup.find_all("table")
    rows = sum(len(t.find_all("tr")) for t in tables)
    print(f"  tables: {len(tables)} · rows in served HTML: {rows} · "
          f"DataTables: {bool(re.search(r'dataTable', r.text, re.I))}")

    found = [name for name, rx in SIGNALS.items() if rx.search(r.text)]
    if found:
        print(f"  >>> RESULT FIELDS IN HTML: {found}")
    else:
        print("      no auction-result vocabulary in the served HTML")

    issues = sorted(set(m.upper() for m in ISSUE_RE.findall(r.text)))
    if issues:
        print(f"  >>> {len(issues)} issue code(s) named, e.g. {issues[:6]}")

    # Show real rows so the layout is visible rather than inferred.
    for i, table in enumerate(tables[:2], 1):
        trs = table.find_all("tr")
        print(f"  table {i}: {len(trs)} rows")
        for tr in trs[:3]:
            cells = [c.get_text(" ", strip=True)[:34] for c in tr.find_all(["td", "th"])]
            if any(cells):
                print(f"    | {' | '.join(cells[:7])}")

    pdfs = [urljoin(url, a["href"]) for a in soup.find_all("a", href=True)
            if a["href"].lower().endswith(".pdf") and RESULT_PDF_RE.search(a["href"])]
    if pdfs:
        print(f"  {len(pdfs)} result-looking PDF(s); first 3:")
        for href in pdfs[:3]:
            print(f"    - {href[:120]}")


def main() -> None:
    for label, url in PAGES:
        probe(label, url)
    print("\nIf RESULT FIELDS appear in the served HTML, coupon rates and clearing yields "
          "are scrapeable directly. If they only appear in PDFs, check for a text layer "
          "before writing anything.", file=sys.stderr)


if __name__ == "__main__":
    main()
