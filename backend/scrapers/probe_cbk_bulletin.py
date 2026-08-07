"""Can CBK's own bulletins replace the World Bank figures that are years old?

WHY THIS QUESTION
-----------------
The sovereign panel shows seven indicators, all from the World Bank. Their
vintages as of 2026-08-07:

    Interest / government revenue   asOf 2023   — three years old
    Reserves (import cover)         asOf 2024
    Current account / GDP           asOf 2024
    External debt / GNI             asOf 2024
    Debt service / exports          asOf 2024
    GDP growth                      asOf 2025
    Exports / GDP                   asOf 2025

The vintage is shown on screen, so nobody is misled — but a reader looking at a
2023 figure on a site that promises the latest available information is
entitled to ask why, and "the World Bank has not published a newer one" is only
an answer if nobody else has either.

WHY NOT THE OBVIOUS ALTERNATIVES
--------------------------------
`probe_debt_sources.py` already answered this for debt-to-GDP, and the answers
rule two candidates out rather than in:

  FRED redistributes the IMF series and returns 2025 and 2026 values, but its
  terms list "redistribute any third party's proprietary content ... for
  commercial use without first obtaining express written permission" under
  PROHIBITED. This project licenses its engine commercially. FRED is out until
  somebody obtains that permission in writing.

  The IMF DataMapper API returns Kenya figures out to 2031 — but the years at
  or beyond the current one are PROJECTIONS, and the sovereign panel shows
  measurements. Worse, imf.org/external/terms.htm returned 200 with zero
  characters of readable text: the licence is UNVERIFIED, not permissive. A
  human has to read it in a browser before anything is wired in.

So the remaining candidate is the one this project already trusts for the
credit ratings: CBK's own publications. `sovereign-rating.ts` takes all three
agencies from the Monthly Economic Bulletin, and calls it "a single primary
document, dated, from the country's central bank". That same document carries
reserves and import cover, the balance of payments, public debt, and government
revenue and expenditure — monthly, not years late.

WHAT THIS DOES
--------------
Finds the bulletins, checks they have a text layer, and reports whether the
indicators we need are actually in them and in what shape. It writes nothing
and decides nothing.

A 200 is not a source and a keyword match is not a parser. The output here is
evidence for whether writing one is worth it, and the honest answer may be no —
a PDF whose numbers sit in an image, or whose table shape changes monthly, is
worse than an old figure that is clearly labelled old.
"""
import re
import sys
from io import BytesIO

import requests

UA = {"User-Agent": "mwangaza-yield-probe/1.0 (+https://mwangazayield.org)"}
TIMEOUT = 45

# Landing pages that have historically listed the bulletins. Several are tried
# because CBK has moved these before — see discover_sources.py, which carries
# the same list for the weekly edition.
LANDINGS = [
    ("Monthly Economic Bulletin", [
        "https://www.centralbank.go.ke/monthly-economic-indicators/",
        "https://www.centralbank.go.ke/publications/monthly-economic-bulletins/",
        "https://www.centralbank.go.ke/research-and-publications/monthly-economic-bulletin/",
    ]),
    ("Weekly Bulletin", [
        "https://www.centralbank.go.ke/weekly-bulletin/",
        "https://www.centralbank.go.ke/publications/weekly-bulletin/",
    ]),
]

PDF_RE = re.compile(r'href="([^"]+\.pdf)"', re.I)

# What we are actually hunting, and the words each is likely to appear under.
# Deliberately several phrasings each: a single phrase that happens to be
# absent would read as "the bulletin does not carry this", which would be the
# wrong conclusion drawn from the right observation.
WANTED = {
    "Reserves / import cover": (
        "import cover", "usable foreign exchange reserves", "months of import"),
    "Current account": ("current account", "balance of payments"),
    "Public / external debt": ("public debt", "external debt", "debt stock"),
    "Government revenue": ("revenue", "ordinary revenue", "total revenue"),
    "Interest payments": ("interest payment", "debt service", "interest on debt"),
    "GDP growth": ("gdp growth", "real gdp", "economic growth"),
}


def get(url: str):
    try:
        return requests.get(url, headers=UA, timeout=TIMEOUT)
    except requests.RequestException as exc:
        print(f"   FETCH FAILED: {type(exc).__name__}: {str(exc)[:120]}")
        return None


def find_pdfs(label: str, urls: list) -> list:
    print(f"\n-- {label}")
    for url in urls:
        r = get(url)
        if r is None:
            continue
        print(f"   {url}")
        print(f"   status : {r.status_code}, {len(r.content)} bytes")
        if r.status_code != 200:
            continue
        hrefs = PDF_RE.findall(r.text)
        pdfs = []
        for h in hrefs:
            if h.startswith("//"):
                h = "https:" + h
            elif h.startswith("/"):
                h = "https://www.centralbank.go.ke" + h
            if h not in pdfs:
                pdfs.append(h)
        print(f"   pdfs   : {len(pdfs)} linked")
        for p in pdfs[:5]:
            print(f"            {p}")
        if pdfs:
            return pdfs
    print("   no PDFs found on any candidate landing page")
    return []


def inspect(pdf_url: str) -> None:
    """Does this PDF have a text layer, and does it mention what we need?"""
    print(f"\n-- inspecting {pdf_url}")
    r = get(pdf_url)
    if r is None or r.status_code != 200:
        print(f"   status : {r.status_code if r else 'no response'} — cannot inspect")
        return
    print(f"   status : 200, {len(r.content)} bytes")
    try:
        import pdfplumber
    except ImportError:
        print("   pdfplumber not installed — cannot read the text layer")
        return
    try:
        with pdfplumber.open(BytesIO(r.content)) as pdf:
            pages = len(pdf.pages)
            # Bulletins run to dozens of pages; a sample is enough to answer
            # "is there a text layer" and "are the words present".
            text = " ".join((p.extract_text() or "") for p in pdf.pages[:25])
    except Exception as exc:  # noqa: BLE001 — a probe reports, never raises
        print(f"   could not open: {type(exc).__name__}: {str(exc)[:120]}")
        return

    print(f"   pages  : {pages}, read first {min(pages, 25)}")
    print(f"   text   : {len(text)} chars extracted")
    if len(text) < 500:
        print("   VERDICT: NO USABLE TEXT LAYER — the numbers are probably an")
        print("            image. A parser cannot read this without OCR, and")
        print("            OCR on financial figures is not something to trust.")
        return

    low = text.lower()
    for label, phrases in WANTED.items():
        hits = [p for p in phrases if p in low]
        if hits:
            # Show the surrounding text so a reader can judge whether the
            # number is next to the phrase or merely in the same document.
            i = low.find(hits[0])
            snippet = " ".join(text[max(0, i - 60):i + 160].split())
            print(f"   FOUND  {label:<26} via {hits[0]!r}")
            print(f"          ...{snippet[:150]}")
        else:
            print(f"   absent {label:<26} (tried {', '.join(phrases)})")


def main() -> int:
    print("=" * 72)
    print("Can CBK's bulletins replace World Bank figures that are years old?")
    print("=" * 72)
    print("Writes nothing. Reports what the documents actually contain.")

    for label, urls in LANDINGS:
        pdfs = find_pdfs(label, urls)
        for pdf in pdfs[:2]:
            inspect(pdf)

    print("\n" + "=" * 72)
    print("Read this before writing a parser")
    print("=" * 72)
    print("A keyword match is not a parser. Before an indicator moves off the")
    print("World Bank, three things must hold and be visible above: a text")
    print("layer that survives the month-to-month layout, the figure adjacent")
    print("to a label rather than merely in the same document, and a date on")
    print("the document itself — the sovereign panel shows vintages, and a")
    print("bulletin figure with the wrong month attached is worse than a")
    print("World Bank figure that is honestly three years old.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
