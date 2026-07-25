"""Parse CBK Treasury bond auction RESULTS into auction-results.json.

Source: https://www.centralbank.go.ke/bills-bonds/treasury-bonds/ — the LIVE
section. (The /securities/ path answers HTTP 200 while serving a 2016 archive;
see docs/DATA-SOURCES.md §15. That trap cost this project two wrong
conclusions.) Results PDFs live under /uploads/historical_treasury_bond_results/.

This is the dataset three roadmap items were waiting on: coupon rates for the
59 registered bonds we cannot currently price, twelve months of clearing
yields to answer "is that any good?", and the weighted average accepted rate —
what to actually bid.

WHY THIS DOES NOT PARSE extract_text()
--------------------------------------
The probe showed pdfplumber rendering one line as:

    Coupon Rate (%)   1 1.277   1 2.873

Those are TWO coupons — 11.277% and 12.873% — printed in side-by-side columns,
with a space injected inside each number. A regex over that text finds four
numbers (1, 1.277, 1, 2.873) and gets every one of them wrong while looking
entirely confident. For a figure that drives someone's yield calculation, that
is the worst possible failure mode.

So we work from word POSITIONS instead. The issue codes in the header fix the
column centres; every later value is assigned to the nearest column and the
fragments within a column are joined. "1" and "1.277" sitting in the same
column become "11.277" because that is what the page actually shows.
"""
import json
import re
import sys
from datetime import datetime
from io import BytesIO
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from common import DATA_DIR, write_dataset

LISTING = "https://www.centralbank.go.ke/bills-bonds/treasury-bonds/"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 60
MAX_PDFS = 12

RESULT_HREF_RE = re.compile(r"historical_treasury_bond_results|RESULTS", re.I)
# Issue codes appear as FXD1-2021-005 in filenames and FXD1/2021/5 in the page.
ISSUE_RE = re.compile(r"\b((?:FXD|IFB|SDB)\s?\d?)\s?[/-]\s?(\d{4})\s?[/-]\s?(\d{1,3})\b", re.I)
DATE_IN_NAME_RE = re.compile(r"(\d{2})-(\d{2})-(\d{4})")

# Rows we care about, and how to recognise them whatever CBK's wording that year.
FIELDS = [
    ("couponRate", re.compile(r"coupon\s*rate", re.I)),
    ("weightedAverageRate", re.compile(r"weighted\s*average\s*(?:rate|yield)", re.I)),
    ("marketWeightedAverageRate", re.compile(r"market\s*weighted\s*average", re.I)),
    ("pricePer100", re.compile(r"price\s*per\s*(?:kshs?)?\s*100", re.I)),
    ("amountOfferedKESM", re.compile(r"amount\s*offered", re.I)),
    ("amountAcceptedKESM", re.compile(r"amount\s*accepted", re.I)),
    ("bidsReceivedKESM", re.compile(r"(?:total\s*)?bids?\s*received", re.I)),
]

# Plausible bands. A value outside these means we read the wrong cell, and a
# wrong coupon is worse than a missing one.
BANDS = {
    "couponRate": (0.5, 30.0),
    "weightedAverageRate": (0.5, 30.0),
    "marketWeightedAverageRate": (0.5, 30.0),
    "pricePer100": (40.0, 160.0),
}

NUMERIC_RE = re.compile(r"^-?[\d,]+(?:\.\d+)?$")


def normalise_code(family: str, year: str, tenor: str) -> str:
    return f"{family.upper().replace(' ', '')}/{year}/{int(tenor):03d}"


def group_lines(words: list, tolerance: float = 2.5) -> list:
    """Cluster words into visual lines by their vertical position."""
    lines = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        for line in lines:
            if abs(line[0]["top"] - w["top"]) <= tolerance:
                line.append(w)
                break
        else:
            lines.append([w])
    return [sorted(line, key=lambda w: w["x0"]) for line in lines]


def cell_value(fragments: list) -> str:
    """Join fragments that share a column.

    "1" + "1.277" -> "11.277". CBK's PDFs split digits inside a number, so
    joining WITHOUT a separator is the only reading that reproduces the page.
    """
    joined = "".join(f["text"] for f in fragments).replace(",", "").strip()
    return joined


def assign_to_columns(line: list, centres: list, label_x: float) -> dict:
    """Map a line's numeric fragments onto the column each one sits under."""
    buckets: dict = {i: [] for i in range(len(centres))}
    for w in line:
        mid = (w["x0"] + w["x1"]) / 2
        if mid < label_x:  # part of the row label, not a value
            continue
        nearest = min(range(len(centres)), key=lambda i: abs(centres[i] - mid))
        buckets[nearest].append(w)
    return {i: cell_value(frs) for i, frs in buckets.items() if frs}


def find_header(lines: list) -> tuple:
    """Locate the row naming the issues; it defines the column geometry.

    Matches against the JOINED line rather than word by word. The first dry-run
    matched each word separately and so found only one issue in PDFs whose
    filename named two — CBK splits a code like "FXD1/2019/20" across word
    boundaries often enough that per-word matching silently loses half the
    bonds. Under-extraction is quieter than a wrong number and just as wrong.
    """
    for line in lines:
        spans, pos, parts = [], 0, []
        for w in line:
            parts.append(w["text"])
            spans.append((pos, pos + len(w["text"]), w))
            pos += len(w["text"]) + 1  # the joining space
        text = " ".join(parts)

        codes, centres = [], []
        for m in ISSUE_RE.finditer(text):
            start, end = m.span()
            owners = [w for (ws, we, w) in spans if ws < end and we > start]
            if not owners:
                continue
            codes.append(normalise_code(*m.groups()))
            centres.append((min(o["x0"] for o in owners) + max(o["x1"] for o in owners)) / 2)
        if codes:
            return codes, centres
    return [], []


def codes_in_name(url: str) -> list:
    """Issue codes named in the filename — the cross-check on what we found."""
    return [normalise_code(*m.groups()) for m in ISSUE_RE.finditer(url)]


def parse_pdf(content: bytes, source_url: str) -> list:
    # Imported here, not at module scope, so the column-reconstruction logic
    # above stays importable and testable without a PDF stack present.
    import pdfplumber

    with pdfplumber.open(BytesIO(content)) as pdf:
        pages = [p.extract_words() or [] for p in pdf.pages]

    auction_date = None
    m = DATE_IN_NAME_RE.search(source_url)
    if m:
        d, mo, y = m.groups()
        try:
            auction_date = datetime(int(y), int(mo), int(d)).date().isoformat()
        except ValueError:
            auction_date = None

    expected = codes_in_name(source_url)
    records: dict = {}
    for words in pages:
        if not words:
            continue
        lines = group_lines(words)
        codes, centres = find_header(lines)
        if not codes:
            continue
        # Values sit to the right of the row labels; anchor on the leftmost
        # column centre so label words are never mistaken for data.
        label_x = min(centres) - 40

        for key, pattern in FIELDS:
            for line in lines:
                text = " ".join(w["text"] for w in line)
                if not pattern.search(text):
                    continue
                for idx, raw in assign_to_columns(line, centres, label_x).items():
                    if idx >= len(codes) or not NUMERIC_RE.match(raw):
                        continue
                    value = float(raw)
                    lo_hi = BANDS.get(key)
                    if lo_hi and not (lo_hi[0] <= value <= lo_hi[1]):
                        print(f"[auctions] {codes[idx]} {key}={value} outside "
                              f"{lo_hi} — dropping", file=sys.stderr)
                        continue
                    rec = records.setdefault(codes[idx], {
                        "id": f"res-{codes[idx].replace('/', '-').lower()}-{auction_date}",
                        "issueCode": codes[idx],
                        "auctionDate": auction_date,
                        "sourceUrl": source_url,
                    })
                    rec.setdefault(key, value)
                break

    # CBK names the issues in the filename, so we can check our own work. If
    # the header yielded fewer, we have silently dropped a bond — say so
    # rather than return a tidy-looking partial result.
    missing = [c for c in expected if c not in records]
    if missing:
        print(f"[auctions] {source_url[-58:]}: filename names {len(expected)} issue(s), "
              f"parsed {len(records)} — MISSING {missing}", file=sys.stderr)
    return list(records.values())


def find_result_pdfs() -> list:
    r = requests.get(LISTING, headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    seen, out = set(), []
    for a in soup.find_all("a", href=True):
        href = urljoin(LISTING, a["href"])
        if href.lower().endswith(".pdf") and RESULT_HREF_RE.search(href) and href not in seen:
            seen.add(href)
            out.append(href)
    return out


def main() -> None:
    pdfs = find_result_pdfs()
    print(f"[auctions] {len(pdfs)} result PDF(s) linked from {LISTING}", file=sys.stderr)
    if not pdfs:
        print("[auctions] none found — the listing layout may have changed", file=sys.stderr)
        sys.exit(1)

    records = []
    for url in pdfs[:MAX_PDFS]:
        try:
            resp = requests.get(url, headers=UA, timeout=TIMEOUT)
            resp.raise_for_status()
            got = parse_pdf(resp.content, url)
        except Exception as exc:  # noqa: BLE001 — one bad PDF must not lose the rest
            print(f"[auctions] {url[-60:]}: {exc.__class__.__name__}", file=sys.stderr)
            continue
        print(f"[auctions] {url[-60:]}: {len(got)} issue(s)", file=sys.stderr)
        records.extend(got)

    with_coupon = [r for r in records if "couponRate" in r]
    print(f"[auctions] {len(records)} record(s), {len(with_coupon)} with a coupon rate",
          file=sys.stderr)
    write_dataset("auction-results", sorted(records, key=lambda r: (r["auctionDate"] or "", r["issueCode"])))


if __name__ == "__main__":
    main()
