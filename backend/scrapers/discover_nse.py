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


def inspect_pdf(url: str) -> None:
    """Report whether a PDF carries a text layer or is a scanned image.

    Decides whether automated extraction is even possible: no chars and one
    big image means OCR, and OCR'd digits in a bond price are a correctness
    risk we will not take silently.
    """
    import pdfplumber  # local import: only needed for this diagnostic

    print(f"\n=== PDF STRUCTURE: {url} ===")
    try:
        resp = requests.get(url, headers=UA, timeout=60)
        resp.raise_for_status()
    except requests.RequestException as exc:
        print(f"  UNREACHABLE: {exc.__class__.__name__}")
        return

    from io import BytesIO
    with pdfplumber.open(BytesIO(resp.content)) as pdf:
        print(f"  pages: {len(pdf.pages)}")
        for i, page in enumerate(pdf.pages[:2], 1):
            chars = len(page.chars)
            images = len(page.images)
            tables = page.extract_tables() or []
            print(f"  page {i}: {chars} chars, {images} images, {len(tables)} tables")
            if chars == 0 and images:
                print("    -> NO TEXT LAYER: this is a scanned image. Text extraction")
                print("       is impossible; only OCR could read it.")
            elif chars:
                sample = (page.extract_text() or "").splitlines()[:8]
                for line in sample:
                    print(f"    | {line[:110]}")
                if tables:
                    print(f"    first table row: {tables[0][0] if tables[0] else '(empty)'}")


def main() -> None:
    for page in PAGES:
        probe(page)

    # Inspect today's price list if we can find it.
    try:
        resp = requests.get(PAGES[0], headers=UA, timeout=45)
        soup = BeautifulSoup(resp.text, "lxml")
        for a in soup.find_all("a", href=True):
            href = urljoin(PAGES[0], a["href"])
            if re.search(r"BondPrices.*\.pdf$", href, re.I):
                inspect_pdf(href)
                break
    except requests.RequestException as exc:
        print(f"\n(could not inspect price list: {exc.__class__.__name__})")
    print("\nSet NSE_DAILY_TRADE_URL only to a FILE link that nse_parser can read "
          "(.xls/.xlsx). Anything else will fail daily.", file=sys.stderr)


if __name__ == "__main__":
    main()
