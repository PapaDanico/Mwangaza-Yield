"""Probe CBK bond prospectuses for the two facts that govern our arithmetic.

Roadmap items 1 and 2 both live inside these PDFs, and both change numbers we
already show people:

  1. **Exact coupon dates.** We currently COMPUTE them by adding six months to
     the issue date. Real schedules follow business-day conventions and shift
     for weekends and public holidays. Every "next coupon date", the cash-flow
     calendar and every .ics reminder inherits that approximation.

  2. **The day-count convention.** We assume Actual/365. If a prospectus says
     30/360 — or anything else — every accrued-interest figure and therefore
     every settlement cost we quote is wrong by a few hundred shillings per
     hundred thousand.

Neither is worth guessing at. This probe answers whether the prospectuses
state them in a form software can read, BEFORE any parser is written. That
sequence is the one lesson this project has learned the expensive way, twice.

Read-only. Never gates CI.
"""
import re
import sys
from io import BytesIO
from urllib.parse import urljoin

import pdfplumber
import requests
from bs4 import BeautifulSoup

# Corrected 2026-07-25: the /securities/ listing answers 200 but serves a 2016
# archive, which is why this probe twice concluded "only 2016 reachable". The
# live documents sit under /uploads/treasury_bonds_prospectuses/ and are linked
# from /bills-bonds/treasury-bonds/. Found by web search, not by guessing.
LISTING = "https://www.centralbank.go.ke/bills-bonds/treasury-bonds/"
LEGACY_LISTING = "https://www.centralbank.go.ke/securities/treasury-bonds/treasury-bonds-prospectuses/"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 60
MAX_PDFS = 3

# What we are hunting for, and the phrasings CBK might use for each.
PROBES = [
    ("DAY COUNT", re.compile(
        r"(actual\s*/\s*actual|actual\s*/\s*365|act\s*/\s*365|30\s*/\s*360|"
        r"day[- ]count|basis of\s+(?:interest|accrual))", re.I)),
    ("COUPON DATES", re.compile(
        r"(interest payment date|coupon payment date|interest will be paid|"
        r"payable\s+(?:semi[- ]?annually|half[- ]yearly)|coupon dates?)", re.I)),
    ("BUSINESS DAY RULE", re.compile(
        r"(business day|following business day|preceding business day|"
        r"public holiday|working day)", re.I)),
    ("REDEMPTION", re.compile(r"(redemption date|maturity date|redeemable)", re.I)),
]
# A concrete date list is far more useful than prose about one.
DATE_LINE_RE = re.compile(
    r"\d{1,2}[/\s.-]\s*(?:\d{1,2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
    r"[a-z]*[/\s.-]\s*\d{2,4}", re.I)


# Every CBK page carries the same three PDFs in a sidebar widget. The first
# run of this probe dutifully inspected all three and learned nothing about
# prospectuses — "the first PDFs on the page" is not the same as "the PDFs
# this page is about".
BOILERPLATE = re.compile(
    r"AuctionRulesGuidelines|/BBP\.pdf|Master-Repurchase|Pricelist|Policies", re.I)
# A real prospectus is named for its issue: FXD1/2024/10, IFB1/2023/17 etc.
ISSUE_RE = re.compile(r"(FXD|IFB|SDB)\s?\d?[/_-]?\d{4}", re.I)


def find_prospectus_pdfs(listing: str = LISTING) -> list:
    r = requests.get(listing, headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")

    # Prefer links inside the listing table — that is what the page is FOR.
    anchors = [a for t in soup.find_all("table") for a in t.find_all("a", href=True)]
    scope = "listing table"
    if not anchors:
        anchors = soup.find_all("a", href=True)
        scope = "whole page (no table found)"
    print(f"  scanning {len(anchors)} link(s) from the {scope}")

    seen, out = set(), []
    for a in anchors:
        href = urljoin(listing, a["href"])
        label = " ".join(a.get_text(" ", strip=True).split())[:70]
        if not href.lower().endswith(".pdf") or href in seen:
            continue
        if BOILERPLATE.search(href):
            continue
        if not (ISSUE_RE.search(href) or ISSUE_RE.search(label)):
            continue
        seen.add(href)
        out.append((href, label))
    return out


def inspect(url: str, label: str) -> None:
    print(f"\n--- {label or '(no link text)'}\n    {url}")
    try:
        r = requests.get(url, headers=UA, timeout=TIMEOUT)
        r.raise_for_status()
    except requests.RequestException as exc:
        print(f"    UNREACHABLE {exc.__class__.__name__}")
        return

    try:
        with pdfplumber.open(BytesIO(r.content)) as pdf:
            pages = len(pdf.pages)
            text = "\n".join(p.extract_text() or "" for p in pdf.pages)
            chars = sum(len(p.chars) for p in pdf.pages)
            tables = sum(len(p.extract_tables() or []) for p in pdf.pages)
    except Exception as exc:  # noqa: BLE001 - diagnostic tool
        print(f"    could not open as PDF: {exc.__class__.__name__}")
        return

    print(f"    {pages} page(s), {chars} chars, {tables} table(s)")
    if chars == 0:
        print("    >>> NO TEXT LAYER — scanned image, unusable")
        return

    for name, pattern in PROBES:
        hits = pattern.findall(text)
        if hits:
            flat = [h if isinstance(h, str) else h[0] for h in hits]
            print(f"    >>> {name}: {len(hits)} hit(s) — {sorted(set(x.lower() for x in flat))[:4]}")
        else:
            print(f"        {name}: not found")

    # Show the lines around any day-count or interest-payment language: the
    # exact wording is what a parser would have to key on.
    for line in text.splitlines():
        low = line.lower()
        if any(k in low for k in ("day count", "actual/365", "act/365", "30/360",
                                  "interest payment date", "coupon payment",
                                  "basis of interest")):
            print(f"      | {line.strip()[:150]}")

    dates = DATE_LINE_RE.findall(text)
    print(f"    date-like strings in document: {len(dates)}")


# Probed 2026-07-25: three prospectuses stated "Interest Payment Dates" but NONE
# stated a day-count convention. On reflection that is the right design — a
# prospectus sells one issue, while the convention governs every issue and
# belongs in the rules. So look where rules live. (These are the very PDFs the
# prospectus hunt excludes as boilerplate; wrong for that question, likely
# right for this one.)
CONVENTION_DOCS = [
    ("CBK Auction Rules & Guidelines",
     "https://www.centralbank.go.ke/wp-content/uploads/2024/06/AuctionRulesGuidelines.pdf"),
]


def main() -> None:
    print("=== PART 2: where the day-count convention should live ===")
    for label, url in CONVENTION_DOCS:
        inspect(url, label)

    print("\n=== PART 1: individual prospectuses ===")
    pdfs = find_prospectus_pdfs()
    if not pdfs:
        print("!! no issue-coded prospectus PDFs found — the listing may be "
              "rendered client-side, or the naming has changed. Not guessing.")
        return
    print(f"{len(pdfs)} prospectus PDF(s) matched an issue code; "
          f"inspecting the newest {MAX_PDFS}")
    for _, label in pdfs[:8]:
        print(f"    found: {label}")
    for url, label in pdfs[:MAX_PDFS]:
        inspect(url, label)
    print("\nBuild the exact-coupon-date parser only if COUPON DATES appears WITH a "
          "concrete schedule, and encode the day count only if it is stated explicitly.",
          file=sys.stderr)


if __name__ == "__main__":
    main()
