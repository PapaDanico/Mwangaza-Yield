"""Find the real downloadable bond-data file on the NSE site.

`nse_parser.py` needs a spreadsheet URL for NSE_DAILY_TRADE_URL, but the only
verified NSE endpoint is an HTML page. Guessing a URL would give us a scraper
that fails every morning and trains everyone to ignore the alerts — so this
probe reports what is actually linked, and we set the variable from evidence.

Read-only. Prints candidates and exits 0 regardless, so it never gates CI.
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
PAGES = [
    "https://www.nse.co.ke/bonds-statistics/",
    "https://www.nse.co.ke/dataservices/",
]
# What nse_parser can actually consume, plus PDFs worth knowing about.
INTERESTING = re.compile(r"\.(xlsx?|csv|pdf)(\?|$)", re.I)
BOND_HINT = re.compile(r"bond|fixed[- ]income|debt|price list", re.I)


def probe(url: str) -> None:
    print(f"\n=== {url} ===")
    try:
        resp = requests.get(url, headers=UA, timeout=45)
    except requests.RequestException as exc:
        print(f"  UNREACHABLE: {exc.__class__.__name__}")
        return
    print(f"  HTTP {resp.status_code}, {len(resp.content)} bytes, {resp.headers.get('Content-Type','?')[:50]}")
    if resp.status_code != 200:
        return

    soup = BeautifulSoup(resp.text, "lxml")
    links = []
    for a in soup.find_all("a", href=True):
        href = urljoin(url, a["href"])
        text = " ".join(a.get_text(" ", strip=True).split())[:70]
        if INTERESTING.search(href):
            links.append((href, text, "FILE"))
        elif BOND_HINT.search(text) or BOND_HINT.search(href):
            links.append((href, text, "bond-related page"))

    if not links:
        print("  No downloadable files or bond-related links found.")
        # Surface whether the numbers are rendered client-side instead.
        if re.search(r"react|angular|__NEXT_DATA__|vue", resp.text, re.I):
            print("  NOTE: page looks JavaScript-rendered — the data may load from an")
            print("        XHR endpoint that plain requests cannot see.")
        return

    seen = set()
    for href, text, kind in links:
        if href in seen:
            continue
        seen.add(href)
        print(f"  [{kind}] {href}")
        if text:
            print(f"        \"{text}\"")


def main() -> None:
    for page in PAGES:
        probe(page)
    print("\nSet NSE_DAILY_TRADE_URL only to a FILE link that nse_parser can read "
          "(.xls/.xlsx). Anything else will fail daily.", file=sys.stderr)


if __name__ == "__main__":
    main()
