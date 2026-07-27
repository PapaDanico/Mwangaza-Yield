"""Whether the auction calendar can be built from CBK prospectuses.

THE SITUATION
-------------
public/data/auctions.json is HAND-MAINTAINED. Nothing in the refresh pipeline
writes it — cbk_parser.py is a manual CLI you point at a downloaded PDF — and
it was last touched by a commit about a currency label. It now holds three
settled auctions and one placeholder, "TBA — August 2026".

Two things follow, and the second is worse than the first.

  1. Auction Radar, the page whose whole promise is "CBK primary issuance
     calendar with countdowns", has nothing to count down to.

  2. The prediction ledger is EMPTY — zero entries, ever. It records a forecast
     only for a FUTURE auction with named bonds, and the calendar has never
     offered one. The public track record that was built as the M2 exit test
     has therefore never scored anything. It is not broken. It is starved.

The prospectuses are reachable and current. discover_prospectus.py read this
in CI today:

    .../uploads/treasury_bonds_prospectuses/46801342_JULY 2026
    FXD1-2022-010, FXD1-2021-020 AND FXD1-2026-030 DATED 13-07-2026.pdf
    4 page(s), 6760 chars, 5 table(s)

So the documents exist, carry text, and describe the auction we already hold
results for. The question is not whether they can be fetched.

WHAT THIS ASKS, AND WHY IT IS A PROBE AND NOT A PARSER
------------------------------------------------------
cbk_parser.py already claims to turn one of these into an auctions.json record.
Pointing it at the live listing on a schedule is a four-line change, and it
would be wrong in a way that is invisible from here:

  * It takes the FIRST issue code in the document (`ISSUE_RE.search`). The file
    named above sells THREE bonds. Automating it as written would publish one
    and silently drop two — the same multi-bond trap that cost this project a
    parser rewrite on the results side.
  * It raises on any missing date. Whether CBK's current prospectus wording
    still matches DATE_PATTERNS, written against an older layout, is unknown.
  * It hardcodes prospectusUrl to /securities/treasury-bonds/, the path
    documented elsewhere in this repo as answering 200 while serving a 2016
    archive.

None of that can be checked from a machine that cannot reach CBK. So this
prints what the documents ACTUALLY say for every field the calendar needs, for
the newest prospectuses on the listing, and the parser gets written against the
answer. Look before building: the lesson this project has now learned three
times.

Read-only. Writes nothing. Never gates CI.
"""
import re
import sys
from io import BytesIO
from urllib.parse import urljoin, unquote

import requests
from bs4 import BeautifulSoup

LISTING = "https://www.centralbank.go.ke/bills-bonds/treasury-bonds/"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = (8, 45)
MAX_PDFS = int(sys.argv[1]) if len(sys.argv) > 1 else 4

# The upload PATH is what identifies a prospectus. Naming is not identity —
# believing it was is what made discover_prospectus.py read 506 results files
# and report that prospectuses mention no coupon dates.
PROSPECTUS_PATH = "/uploads/treasury_bonds_prospectuses/"

ISSUE_RE = re.compile(r"\b((?:FXD|IFB|SDB)\s?\d\s?/\s?\d{4}\s?/\s?\d+(?:\.\d+)?)\b", re.I)

# Every field auctions.json needs, with the phrasings cbk_parser.py expects
# PLUS the looser ones a current document might use instead. Reported
# separately so the output says which wording actually appeared, rather than
# just whether something matched.
FIELDS = [
    ("offerOpenDate", [
        ("cbk_parser", r"(?:Period of Sale|Offer Opens?)[\s:]*?(\d{1,2}[/\s]\w+[/\s]\d{4})"),
        ("loose", r"(?:period of sale|offer opens?|sale period|opening date)\D{0,40}"
                  r"(\d{1,2}\s*[/.\-\s]\s*\w+\s*[/.\-\s]\s*\d{2,4})"),
    ]),
    ("offerCloseDate", [
        ("cbk_parser", r"(?:Offer Closes?|Closing Date)[\s:]*?(\d{1,2}[/\s]\w+[/\s]\d{4})"),
        ("loose", r"(?:offer closes?|closing date|closure date)\D{0,40}"
                  r"(\d{1,2}\s*[/.\-\s]\s*\w+\s*[/.\-\s]\s*\d{2,4})"),
    ]),
    ("auctionDate", [
        ("cbk_parser", r"Auction Date[\s:]*?(\d{1,2}[/\s]\w+[/\s]\d{4})"),
        ("loose", r"auction\s*date\D{0,40}(\d{1,2}\s*[/.\-\s]\s*\w+\s*[/.\-\s]\s*\d{2,4})"),
    ]),
    ("settlementDate", [
        ("cbk_parser", r"(?:Value|Settlement) Date[\s:]*?(\d{1,2}[/\s]\w+[/\s]\d{4})"),
        ("loose", r"(?:value|settlement)\s*date\D{0,40}"
                  r"(\d{1,2}\s*[/.\-\s]\s*\w+\s*[/.\-\s]\s*\d{2,4})"),
    ]),
    ("amountOfferedKES", [
        ("cbk_parser", r"Kshs?\.?\s*([\d,]+(?:\.\d+)?)\s*(?:Billion|Million)"),
        ("loose", r"(?:amount|total)\s*(?:offered|on offer)\D{0,40}([\d,]+(?:\.\d+)?)"),
    ]),
    ("couponRate", [
        ("cbk_parser", r"(?:Coupon|Interest)\s*Rate[\s:]*?([\d.]+)\s*%"),
        ("loose", r"coupon\D{0,30}([\d.]+)\s*%"),
    ]),
]


def prospectus_links() -> list:
    try:
        r = requests.get(LISTING, headers=UA, timeout=TIMEOUT)
        r.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        print(f"  listing unreachable: {exc.__class__.__name__}: {exc}")
        return []

    soup = BeautifulSoup(r.text, "html.parser")
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = urljoin(LISTING, a["href"])
        if PROSPECTUS_PATH not in href or not href.lower().endswith(".pdf"):
            continue
        if href in seen:
            continue
        seen.add(href)
        out.append(href)

    print(f"  listing carried {len(out)} prospectus-path PDF(s)")
    if not out:
        # Say so plainly rather than settling for whatever else is on the page.
        print("  NOTHING under " + PROSPECTUS_PATH + " — the listing has moved "
              "or the markup changed. Do not fall back to other PDFs.")
    return out


def probe(url: str) -> None:
    name = unquote(url.rsplit("/", 1)[-1])
    print(f"\n--- {name[:96]}")

    try:
        r = requests.get(url, headers=UA, timeout=TIMEOUT)
        r.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        print(f"    unreachable: {exc.__class__.__name__}: {exc}")
        return

    try:
        import pdfplumber
    except Exception:
        print("    pdfplumber unavailable")
        return

    with pdfplumber.open(BytesIO(r.content)) as pdf:
        text = "\n".join((p.extract_text() or "") for p in pdf.pages)
    if not text.strip():
        print("    no text layer — a scan, and the no-OCR policy settles it")
        return

    flat = " ".join(text.split())

    # THE question for the calendar: how many bonds is this one auction selling?
    codes = []
    for m in ISSUE_RE.finditer(text):
        c = re.sub(r"\s", "", m.group(1)).upper()
        if c not in codes:
            codes.append(c)
    in_name = [re.sub(r"[\s\-]", "/", c) for c in ISSUE_RE.findall(name)]
    print(f"    issue codes in BODY ({len(codes)}): {codes}")
    print(f"    issue codes in NAME ({len(in_name)}): {in_name}")
    if len(codes) > 1:
        print("    >>> MULTI-BOND. cbk_parser.py takes the first code only and "
              "would drop the rest.")

    for field, patterns in FIELDS:
        hits = []
        for label, pat in patterns:
            m = re.search(pat, flat, re.I)
            if m:
                hits.append(f"{label}={' '.join(m.group(1).split())!r}")
        print(f"    {field:18s} {'  '.join(hits) if hits else 'NOT FOUND by either pattern'}")

    # If a date field failed, show the words CBK put near dates instead, so the
    # next pattern is written from the document rather than from memory.
    missing = [f for f, ps in FIELDS
               if f.endswith("Date") and not any(re.search(p, flat, re.I) for _, p in ps)]
    if missing:
        print(f"    date fields missing: {missing}")
        for line in text.splitlines():
            if re.search(r"\d{1,2}[/\s.\-]\s*\w+[/\s.\-]\s*\d{2,4}", line) and len(line) < 160:
                print(f"      | {' '.join(line.split())}")


def main() -> None:
    print("=== CAN THE AUCTION CALENDAR BE BUILT FROM PROSPECTUSES? ===")
    links = prospectus_links()
    if not links:
        print("\nNo prospectuses reached. The calendar stays hand-maintained "
              "and the ledger stays empty; neither is fixed by guessing.")
        return
    for url in links[:MAX_PDFS]:
        probe(url)
    print("\nWhat to take from this: the issue-code counts decide whether the "
          "parser emits one record per DOCUMENT or one per BOND, and the field "
          "lines decide whether cbk_parser.py's patterns still match CBK's "
          "current wording or need rewriting against it.")


if __name__ == "__main__":
    main()
