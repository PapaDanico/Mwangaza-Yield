"""Parse the NSE Daily Bond Price List into secondary.json.

Evidence from a live probe (2026-07-25, see docs/DATA-SOURCES.md):

    [FILE] https://www.nse.co.ke/wp-content/uploads/BondPrices_24-JUL-2026.pdf
           "Download Daily Bond Price List"

Two consequences, both of which invalidate the original design:

  * It is a **PDF**, not a spreadsheet. The previous implementation called
    pd.read_excel() and would have failed every single day.
  * The filename is **date-stamped**, so a fixed NSE_DAILY_TRADE_URL repo
    variable would go stale within 24 hours. The link must be discovered from
    the listing page on each run.

NSE_BONDS_PAGE overrides the listing page if NSE ever moves it.
"""
import os
import re
import sys
from datetime import date
from io import BytesIO
from urllib.parse import urljoin

import pdfplumber
import requests
from bs4 import BeautifulSoup

from common import write_dataset

PAGE = os.environ.get("NSE_BONDS_PAGE", "https://www.nse.co.ke/bonds-statistics/")
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 60

PDF_HINT = re.compile(r"BondPrices.*\.pdf$|daily bond price", re.I)
# Government issues we care about: FXD/IFB/SDB codes as printed by NSE.
ISSUE_RE = re.compile(r"\b((?:FXD|IFB|SDB)\d?[/\s-]\d{4}[/\s-]\d+(?:\.\d+)?)\b", re.I)
NUM_RE = re.compile(r"\d+\.\d+")


def find_price_list_url() -> str:
    """Discover today's Daily Bond Price List PDF from the listing page."""
    resp = requests.get(PAGE, headers=UA, timeout=TIMEOUT)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")
    for a in soup.find_all("a", href=True):
        href = urljoin(PAGE, a["href"])
        label = a.get_text(" ", strip=True)
        if href.lower().endswith(".pdf") and (PDF_HINT.search(href) or PDF_HINT.search(label)):
            return href
    raise ValueError(
        f"No Daily Bond Price List PDF linked from {PAGE} — the page layout may have changed"
    )


def parse_rows(pdf_bytes: bytes) -> list:
    """Extract (issue code, clean price, yield) rows from the price list."""
    trades = []
    today = date.today().isoformat()
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            for line in (page.extract_text() or "").splitlines():
                issue = ISSUE_RE.search(line)
                if not issue:
                    continue
                numbers = [float(n) for n in NUM_RE.findall(line)]
                # A usable row carries at least a price and a yield. Prices sit
                # in the 50–150 band; yields in 1–30. Anything else is a
                # header, a footnote, or a layout we do not understand — skip
                # it rather than guess.
                price = next((n for n in numbers if 50 <= n <= 150), None)
                ytm = next((n for n in numbers if 1 <= n <= 30), None)
                if price is None or ytm is None:
                    continue
                trades.append({
                    "isin": re.sub(r"[\s-]", "/", issue.group(1).upper()),
                    "tradeDate": today,
                    "price": price,
                    "yield": ytm,
                    "volumeKES": 0,
                    "tradesCount": 1,
                })
    return trades


def has_text_layer(pdf_bytes: bytes) -> bool:
    with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
        return any(page.chars for page in pdf.pages)


def main() -> None:
    url = find_price_list_url()
    print(f"[nse] price list: {url}", file=sys.stderr)
    resp = requests.get(url, headers=UA, timeout=TIMEOUT)
    resp.raise_for_status()

    if not has_text_layer(resp.content):
        # Verified 2026-07-25: NSE publishes this as scanned images (0 chars,
        # 1 full-page image per page). No parser can read it, and we will not
        # OCR it — OCR confuses digits, and a misread bond price is a wrong
        # number shown with full confidence to someone investing their savings.
        #
        # Exit 0 rather than failing: a known, permanent limitation should not
        # raise a daily alert and train people to ignore alerts. The check
        # stays in place so that if NSE ever ships a text-layer PDF, this
        # scraper starts working on its own and we find out immediately.
        print("[nse] SKIPPED — price list is a scanned image, not machine-readable.",
              file=sys.stderr)
        print("[nse] Existing secondary.json left untouched. See docs/DATA-SOURCES.md.",
              file=sys.stderr)
        return

    print("[nse] text layer detected — NSE may have changed format, parsing.", file=sys.stderr)
    rows = parse_rows(resp.content)
    if not rows:
        print("[nse] text present but no rows matched — first page follows:", file=sys.stderr)
        with pdfplumber.open(BytesIO(resp.content)) as pdf:
            print((pdf.pages[0].extract_text() or "")[:1500], file=sys.stderr)

    write_dataset("secondary", rows)


if __name__ == "__main__":
    main()
