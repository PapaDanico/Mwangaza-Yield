"""Whether the undated auction records can be dated from the document itself.

THE SITUATION
-------------
53 records across 48 PDFs carry no auction date. That is not a cosmetic gap.
The deduplication key is (issue code, auction date), so two undated auctions of
the same bond collapse into one; the year table cannot see them; and nothing
ordered by time can use them.

Their filenames fall into three groups, and only the first is already solved:

  1. A full date hidden by percent-encoding — "dated%2028.04.2014". Fixed in the
     parser: the URL is decoded before the date is read.
  2. A MONTH and a year, no day — "Results 25 yr re-opening July 2010",
     "results 5 year dated november 25th 2013". About eighteen files.
  3. Nothing at all — "FXD_1_2008_20.pdf", "9yearamortizedIFB.pdf".

WHY A PROBE RATHER THAN A PATCH
-------------------------------
Group 2 is where the temptation lies, and it is exactly the kind of temptation
this project has been burned by. A month is not a date. Writing the first of the
month would put a day in the field that no document anywhere claims, and every
consumer of this archive — the year table, the yield history, a licensee — would
read it as a fact we had read off a page. Kenyan bonds are auctioned on
Wednesdays and settle the following Monday; the day is not decorative.

So the question this asks is not "what should we write" but "does CBK put the
real date INSIDE the document". If the body carries it, group 2 and possibly
group 3 can be dated exactly, from the source, with no invention at all. If it
does not, then the honest answer is that these records stay undated and the
reason gets published on /sources/ alongside the rest.

Read-only. Writes nothing. Never gates CI.
"""
import json
import re
import sys
import time
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote

import requests

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}

ARCHIVE = Path(__file__).resolve().parents[2] / "public" / "data" / "auction-results.json"

MONTHS = ("january|february|march|april|may|june|july|august|september|october|"
          "november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec")

# What a concrete date looks like in a CBK document, in the several shapes the
# archive actually uses. Reported separately so the output says WHICH shape was
# found, not merely that something matched.
DATE_SHAPES = [
    ("numeric d-m-y", re.compile(r"(?<!\d)\d{1,2}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{2,4}(?!\d)")),
    ("day month year", re.compile(rf"(?<!\d)\d{{1,2}}(?:st|nd|rd|th)?\s+(?:{MONTHS})\s*,?\s*\d{{4}}", re.I)),
    ("month day year", re.compile(rf"(?:{MONTHS})\s+\d{{1,2}}(?:st|nd|rd|th)?\s*,?\s*\d{{4}}", re.I)),
]

# Lines worth showing whether or not they parsed — the words CBK puts next to a
# date. A date the shapes above miss is more interesting than one they catch.
CONTEXT_RE = re.compile(r"auction\s*date|date\s*of\s*auction|dated|value\s*date|"
                        r"issue\s*date|closing\s*date", re.I)

MONTH_ONLY_RE = re.compile(rf"(?:{MONTHS})\D{{0,12}}(\d{{4}})", re.I)

MAX_FILES = int(sys.argv[1]) if len(sys.argv) > 1 else 12
BUDGET_SECONDS = 150


def undated_urls() -> list:
    """Source PDFs whose records carry no auction date, newest naming first."""
    try:
        records = json.loads(ARCHIVE.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"  archive unreadable: {exc.__class__.__name__}: {exc}")
        return []
    urls, seen = [], set()
    for r in records:
        if r.get("auctionDate"):
            continue
        u = r.get("sourceUrl")
        if u and u not in seen:
            seen.add(u)
            urls.append(u)
    return urls


def probe(url: str) -> None:
    name = unquote(url.rsplit("/", 1)[-1])
    print(f"\n--- {name[:88]}")

    month_only = MONTH_ONLY_RE.search(name)
    print(f"    filename group: "
          f"{'month + year, no day' if month_only else 'no date of any kind'}")

    try:
        r = requests.get(url, headers=UA, timeout=45)
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
        text = "\n".join((p.extract_text() or "") for p in pdf.pages[:2])

    if not text.strip():
        print("    page text is empty — a scanned image, not a text PDF")
        return

    found = False
    for label, pattern in DATE_SHAPES:
        hits = [" ".join(m.group(0).split()) for m in pattern.finditer(text)]
        if hits:
            found = True
            # Deduplicated and capped: a cash-flow schedule prints dozens of
            # dates and none of them is the auction's.
            uniq = list(dict.fromkeys(hits))
            print(f"    {label}: {len(hits)} hit(s) — {uniq[:6]}")
    if not found:
        print("    NO concrete date in the body — this file cannot be dated from itself")

    # The lines that name a date are what decide whether any of the hits above
    # is the AUCTION's date rather than a coupon date or a maturity.
    lines = [" ".join(ln.split()) for ln in text.splitlines() if CONTEXT_RE.search(ln)]
    if lines:
        print("    lines naming a date:")
        for ln in list(dict.fromkeys(lines))[:5]:
            print(f"      | {ln[:96]}")
    else:
        print("    no line uses the words 'dated', 'auction date' or 'value date'")


def main() -> None:
    print("Probing whether undated auction PDFs carry their date in the body.\n"
          "This decides nothing and writes nothing — a month is not a date, and\n"
          "the point is to find out whether the day exists to be read.",
          file=sys.stderr)
    urls = undated_urls()
    print(f"=== {len(urls)} PDF(s) behind undated records; reading up to {MAX_FILES} ===")
    started = time.time()
    for i, url in enumerate(urls[:MAX_FILES]):
        if time.time() - started > BUDGET_SECONDS:
            print(f"\n(time budget reached after {i} file(s) — "
                  f"{len(urls) - i} not examined)")
            break
        try:
            probe(url)
        except Exception as exc:  # noqa: BLE001 — a probe must never take CI down
            print(f"    !! probe raised {exc.__class__.__name__}: {exc}")


if __name__ == "__main__":
    main()
