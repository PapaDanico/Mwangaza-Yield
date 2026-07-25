"""Probe Kenyan government sources the sources page names but nothing fetches.

The sources page credits the National Treasury for "Public debt stock and
debt-to-GDP", the IMF for "Debt sustainability analysis, Article IV
projections", and KNBS for "Monthly CPI / inflation". None of the three is
fetched by anything in this directory. Debt now comes from the World Bank,
CPI comes from CBK's own release with `KNBS unavailable` recorded against it,
and no scraper has ever contacted treasury.go.ke or the IMF at all.

Crediting a source we do not read is the same defect as quoting a figure we
cannot support, on the one page whose entire purpose is to let a reader check
our working.

WHY A PROBE AND NOT A PARSER
-----------------------------
This repository has twice recorded work as blocked on the strength of a probe
that never examined the right document — see the correction at the head of
discover_prospectus.py, which reported "COUPON DATES: not found" after
inspecting 506 auction-result PDFs that had no reason to contain one. The
lesson each time was the same: find out what a source actually serves before
writing anything that depends on it.

So this answers one question per target: is there a document a machine can
read, and does it contain the figure we would want? It writes no data, gates
no CI, and draws no conclusion beyond what it observed.

WHY THESE FIGURES ARE WORTH THE TROUBLE
----------------------------------------
World Bank debt data is authoritative but slow — the series we just added lag
by a year or more, because they are compiled from national submissions. The
National Treasury publishes the same figures quarterly, in shillings, months
ahead of the World Bank. For a bond investor deciding whether to lend to this
borrower, a year is the difference between a current picture and a historical
one.

WHAT THE FIRST TWO RUNS ESTABLISHED
------------------------------------
Run 1: the Treasury is reachable (HTTP 200) and links "Public Debt Management"
from its home page. This probe then printed "not a PDF — inspect by hand" at
the landing page and stopped, which told us nothing — the same failure as
discover_prospectus.py, one level up. Fixed by following an index once.

Run 2: following the index reached the PDMO's actual document list, and its
debt documents are DEAD. "Treasury bonds Yield Curve" and "Outstanding
Treasury bonds as at 30th June 2023" both 404; the only live PDF on the page
is an expenditure requisition form containing none of the terms we want. The
site is mid-migration — newsite.treasury.go.ke exists alongside
www.treasury.go.ke/wp-content/uploads/2023/08/... paths that no longer
resolve.

So no Treasury parser has been written. There is nothing yet to parse, and
writing an extractor against a 404 would be worse than having none.

Read-only. Never gates CI.
"""
import re
import sys
from io import BytesIO
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 45

# Candidate landing pages per target. Several per target on purpose: Kenyan
# government sites reorganise, and a single 404 should not be read as "the
# source does not publish this".
TARGETS = [
    (
        "National Treasury — public debt",
        [
            "https://www.treasury.go.ke/",
            "https://www.treasury.go.ke/publications/",
            "https://www.treasury.go.ke/category/debt-management/",
            "https://www.treasury.go.ke/quarterly-economic-and-budgetary-review/",
            # Found by the first run of this probe: the Public Debt Management
            # Office's own document library, reached from the Treasury home page.
            "https://www.treasury.go.ke/pdmo-reports-and-documents",
            "https://newsite.treasury.go.ke/directorate-public-debt-management",
        ],
        re.compile(r"debt|budgetary\s*review|qebr|borrow", re.I),
        # Figures worth extracting if the document proves readable.
        ["public debt", "debt to gdp", "debt-to-gdp", "domestic debt", "external debt",
         "debt service", "interest payment"],
    ),
    (
        # The Treasury's own debt documents 404 (see the correction above), but
        # CBK publishes government domestic debt in its Weekly Bulletin — and
        # CBK is the one host this pipeline already reaches successfully every
        # single day. A source we can actually keep reaching beats a better one
        # that breaks.
        "CBK Weekly Bulletin — government domestic debt",
        [
            "https://www.centralbank.go.ke/weekly-bulletin/",
            "https://www.centralbank.go.ke/publications/weekly-bulletin/",
            "https://www.centralbank.go.ke/statistics/public-debt/",
            "https://www.centralbank.go.ke/publications/",
        ],
        re.compile(r"bulletin|debt|public\s*debt|statistical", re.I),
        ["domestic debt", "public debt", "external debt", "debt service",
         "government securities", "total debt"],
    ),
    (
        "KNBS — CPI / inflation",
        [
            "https://www.knbs.or.ke/",
            "https://www.knbs.or.ke/publications/",
            "https://www.knbs.or.ke/all-reports/",
        ],
        re.compile(r"cpi|consumer\s*price|inflation", re.I),
        ["consumer price index", "inflation", "12-month"],
    ),
    (
        "IMF — Kenya country page",
        [
            "https://www.imf.org/en/Countries/KEN",
            "https://www.imf.org/en/Publications/CR",
        ],
        re.compile(r"kenya|article\s*iv|debt\s*sustainab", re.I),
        ["debt sustainability", "article iv", "public debt"],
    ),
]


def fetch(url: str):
    try:
        r = requests.get(url, headers=UA, timeout=TIMEOUT)
        return r
    except requests.RequestException as exc:
        print(f"  {url} -> ERROR {exc.__class__.__name__}: {exc}")
        return None


def inspect_document(url: str, wanted: list, follow_index: bool = True) -> None:
    """Report whether one linked document is machine-readable and on-topic."""
    print(f"\n    --- {url[:110]}")
    r = fetch(url)
    if r is None or r.status_code >= 400:
        print(f"        unreachable (HTTP {getattr(r, 'status_code', '?')})")
        return

    ctype = r.headers.get("content-type", "?").split(";")[0]
    print(f"        {ctype}, {len(r.content):,} bytes")

    if "pdf" not in ctype.lower() and not url.lower().endswith(".pdf"):
        # An index page, not a document. The first version of this probe stopped
        # here and said "inspect by hand", which is how it reported nothing
        # useful about a source that was reachable and publishing exactly what
        # we wanted — the same failure discover_prospectus.py made, one level
        # up. Government sites file documents behind a landing page; follow it.
        if not follow_index:
            print("        HTML, and we are already one level deep — stopping")
            return
        print("        HTML index — following one level for linked documents")
        soup = BeautifulSoup(r.text, "lxml")
        found = []
        for a in soup.find_all("a", href=True):
            child = urljoin(url, a["href"])
            if child.lower().split("?")[0].endswith((".pdf", ".xlsx", ".xls", ".csv")):
                text = " ".join(a.get_text().split())[:80]
                if child not in [f[1] for f in found]:
                    found.append((text, child))
        if not found:
            print("        no file-extension links here — listing what IS on the page,")
            print("        because an index yielding nothing is usually a filter problem")
            print("        rather than an empty library:")
            seen_txt = set()
            shown = 0
            for a in soup.find_all("a", href=True):
                txt = " ".join(a.get_text().split())
                if len(txt) < 6 or txt in seen_txt:
                    continue
                seen_txt.add(txt)
                print(f"          - {txt[:70]:<72} {urljoin(url, a['href'])[:80]}")
                shown += 1
                if shown >= 25:
                    print("          ... (truncated at 25)")
                    break
            if not shown:
                print("          nothing link-like at all — the page is probably script-rendered")
            return
        print(f"        {len(found)} document(s) linked; inspecting the first 3:")
        for text, child in found[:3]:
            print(f'          "{text}"')
            inspect_document(child, wanted, follow_index=False)
        return

    try:
        import pdfplumber  # imported here so the rest of the probe runs without it
    except Exception:
        print("        pdfplumber unavailable in this environment; cannot inspect")
        return

    try:
        with pdfplumber.open(BytesIO(r.content)) as pdf:
            pages = len(pdf.pages)
            text = ""
            for page in pdf.pages[:8]:
                text += (page.extract_text() or "") + "\n"
            chars = len(text.strip())
            print(f"        pages: {pages}, first 8 pages yield {chars:,} chars")
            if chars < 200:
                print("        >>> NO TEXT LAYER — scanned image, not machine-readable")
                return
            print("        >>> TEXT LAYER PRESENT")
            low = text.lower()
            hits = [w for w in wanted if w in low]
            print(f"        figures present in first 8 pages: {hits or 'NONE of the wanted terms'}")
            for line in text.splitlines():
                if any(w in line.lower() for w in wanted):
                    print(f"          | {line.strip()[:110]}")
                    break
    except Exception as exc:
        print(f"        could not open as PDF: {exc.__class__.__name__}")


def probe(label: str, pages: list, link_re, wanted: list) -> None:
    print(f"\n=== {label} ===")
    reached_any = False
    for page_url in pages:
        r = fetch(page_url)
        if r is None:
            continue
        print(f"  {page_url} -> HTTP {r.status_code}, {len(r.content):,} bytes")
        if r.status_code >= 400:
            continue
        reached_any = True

        soup = BeautifulSoup(r.text, "lxml")
        docs, seen = [], set()
        for a in soup.find_all("a", href=True):
            href = urljoin(page_url, a["href"])
            label_text = " ".join(a.get_text().split())[:90]
            if href in seen:
                continue
            if link_re.search(label_text) or link_re.search(href):
                seen.add(href)
                docs.append((label_text, href))

        if not docs:
            print("    no on-topic links found on this page")
            continue

        print(f"    {len(docs)} on-topic link(s); inspecting the first 2:")
        for text, href in docs[:2]:
            print(f'    * "{text}"')
            inspect_document(href, wanted)
        return

    if not reached_any:
        print(f"  !! nothing reachable for {label} — the host may block automated clients")


def main() -> None:
    print("Probing government sources the sources page credits but nothing fetches.\n"
          "This writes no data and decides nothing. A source is only worth building\n"
          "on if a document reports TEXT LAYER PRESENT *and* contains the figures\n"
          "we would want — a probe that finds neither has not proven a source is\n"
          "unusable, only that it did not look in the right document.",
          file=sys.stderr)
    for label, pages, link_re, wanted in TARGETS:
        try:
            probe(label, pages, link_re, wanted)
        except Exception as exc:  # a probe must never take CI down
            print(f"  !! {label} probe raised {exc.__class__.__name__}: {exc}")


if __name__ == "__main__":
    main()
