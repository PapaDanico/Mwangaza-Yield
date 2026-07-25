"""Probe candidate data sources and report whether they are machine-readable.

Generalises the NSE investigation: for each candidate page, find linked PDFs
and report each one's structure — character count, images, tables. That
distinguishes a usable text PDF from a scanned image BEFORE any parser is
written, which is the lesson the NSE price list taught us the expensive way.

Read-only. Never gates CI.
"""
import re
import sys
from io import BytesIO
from urllib.parse import urljoin

import pdfplumber
import requests
from bs4 import BeautifulSoup

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 60

# (label, candidate page URLs, regex for the PDFs we care about)
TARGETS = [
    (
        "CBK Weekly Bulletin",
        [
            "https://www.centralbank.go.ke/weekly-bulletin/",
            "https://www.centralbank.go.ke/publications/weekly-bulletin/",
            "https://www.centralbank.go.ke/research-and-publications/weekly-bulletin/",
        ],
        re.compile(r"weekly.*bulletin.*\.pdf|bulletin.*\.pdf", re.I),
    ),
    (
        "CMA statistics",
        [
            "https://www.cma.or.ke/statistics/",
            "https://www.cma.or.ke/market-statistics/",
            "https://www.cma.or.ke/",
        ],
        re.compile(r"(statistic|bulletin|quarter|market).*\.pdf", re.I),
    ),
]


def fetch(url: str):
    try:
        r = requests.get(url, headers=UA, timeout=TIMEOUT)
        return r
    except requests.RequestException as exc:
        print(f"  {url} -> ERROR {exc.__class__.__name__}")
        return None


def inspect_pdf(url: str) -> None:
    print(f"\n  --- PDF: {url}")
    r = fetch(url)
    if r is None or r.status_code != 200:
        print(f"      unreachable (HTTP {getattr(r, 'status_code', '?')})")
        return
    try:
        with pdfplumber.open(BytesIO(r.content)) as pdf:
            print(f"      pages: {len(pdf.pages)}, {len(r.content)} bytes")
            page = pdf.pages[0]
            chars, images = len(page.chars), len(page.images)
            tables = page.extract_tables() or []
            print(f"      page 1: {chars} chars, {images} images, {len(tables)} tables")
            if chars == 0:
                print("      >>> NO TEXT LAYER — scanned image, not machine-readable")
                return
            print("      >>> TEXT LAYER PRESENT — machine-readable")
            for line in (page.extract_text() or "").splitlines()[:12]:
                print(f"        | {line[:100]}")
    except Exception as exc:  # noqa: BLE001 - diagnostic tool, report anything
        print(f"      could not open as PDF: {exc.__class__.__name__}")


def probe_target(label: str, pages: list, pdf_re) -> None:
    print(f"\n=== {label} ===")
    for page_url in pages:
        r = fetch(page_url)
        if r is None:
            continue
        print(f"  {page_url} -> HTTP {r.status_code}, {len(r.content)} bytes")
        if r.status_code != 200:
            continue

        soup = BeautifulSoup(r.text, "lxml")
        pdfs, seen = [], set()
        for a in soup.find_all("a", href=True):
            href = urljoin(page_url, a["href"])
            if href.lower().endswith(".pdf") and href not in seen:
                seen.add(href)
                label_text = " ".join(a.get_text(" ", strip=True).split())[:60]
                if pdf_re.search(href) or pdf_re.search(label_text):
                    pdfs.append((href, label_text))

        if not pdfs:
            print("    no matching PDFs linked here")
            continue
        print(f"    {len(pdfs)} matching PDF(s); inspecting the first 2:")
        for href, text in pdfs[:2]:
            print(f"    * \"{text}\"")
            inspect_pdf(href)
        return  # first page URL that works is enough

    print(f"  !! no working page found for {label}")


def main() -> None:
    for label, pages, pdf_re in TARGETS:
        probe_target(label, pages, pdf_re)
    print("\nA source is only worth building on if a PDF reports TEXT LAYER PRESENT.",
          file=sys.stderr)


if __name__ == "__main__":
    main()
