"""Capture the full Central Bank Rate history from CBK's MPC press releases.

Verified by probe on 2026-07-25 (see docs/DATA-SOURCES.md §10): the MPC
listing at /press/ ships its DataTables rows **in the served HTML** — 129
rows, no AJAX call, no client-side rendering. Plain `requests` + BeautifulSoup
reads the lot. That makes CBK's own rate decisions extractable without OCR,
without a licence, and without a headless browser.

Why this matters: the app has been showing "CBR 8.75%" as a bare number. A
number tells you nothing. The *path* — 18.00 at the peak, nine consecutive
cuts down to 8.75, then held — tells a saver why long bonds are priced the way
they are, and why "lock in now" is a live question rather than a slogan.

Each row carries the decision date and the press release URL, so every point
on the chart is one click from CBK's own words.
"""
import re
import sys
from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from common import write_dataset

PRESS_URL = "https://www.centralbank.go.ke/press/"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 60

# CBK's own phrasing across 18 years: "CBR at 8.75", "CBR to 9.75 percent",
# "Central Bank Rate (CBR) at 10.00". The rate always follows "at" or "to".
RATE_RE = re.compile(r"CBR\s*\)?\s+(?:at|to)\s+([\d]+\.?[\d]*)", re.I)
DATE_RE = re.compile(r"^\s*(\d{2})/(\d{2})/(\d{4})\s*$")

# Kenya's CBR has ranged 5.75–18.00 since the MPC was formed in 2008. Anything
# outside this band is a misparse — a page number, a year, a percentage of
# something else — and we drop it rather than plot it.
RATE_MIN, RATE_MAX = 3.0, 25.0

# A layout change that still parses but yields a handful of rows is more
# dangerous than an outright failure: it would silently replace a full history
# with a stub. Refuse to write anything below this.
MIN_DECISIONS = 40


def parse_date(text: str) -> str | None:
    """CBK prints dd/mm/yyyy. Return ISO, or None if this cell is not a date."""
    m = DATE_RE.match(text)
    if not m:
        return None
    day, month, year = (int(g) for g in m.groups())
    try:
        return datetime(year, month, day).date().isoformat()
    except ValueError:
        return None


def extract_decisions(html: str) -> list:
    """Pull (date, rate, title, url) from every table row that states a rate."""
    soup = BeautifulSoup(html, "lxml")
    by_date: dict[str, dict] = {}

    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) < 2:
            continue

        texts = [c.get_text(" ", strip=True) for c in cells]
        iso = next((d for d in (parse_date(t) for t in texts) if d), None)
        if not iso:
            continue

        # The title is the cell that names a rate; ignore the date cell.
        title = next((t for t in texts if RATE_RE.search(t)), None)
        if not title:
            continue

        rate = float(RATE_RE.search(title).group(1))
        if not RATE_MIN <= rate <= RATE_MAX:
            print(f"[cbr] skipping implausible rate {rate} in {title!r}", file=sys.stderr)
            continue

        link = row.find("a", href=True)
        url = urljoin(PRESS_URL, link["href"]) if link else PRESS_URL

        # The page lists each MPC meeting in both an "all press" and an
        # "MPC only" table, so the same decision appears twice. Keep one.
        by_date[iso] = {
            "id": f"cbr-{iso}",
            "date": iso,
            "rate": rate,
            "title": " ".join(title.split())[:160],
            "url": url,
        }

    return sorted(by_date.values(), key=lambda r: r["date"])


def annotate_moves(decisions: list) -> list:
    """Label each decision by what it did to the rate, derived not parsed.

    CBK's wording varies ("Retains", "Lowers", "Reduces", "Maintains"). The
    arithmetic does not, so we compute the direction from the previous rate
    rather than trusting the verb in the headline.
    """
    previous = None
    for d in decisions:
        if previous is None:
            d["move"] = "start"
            d["changeBps"] = 0
        else:
            change = round((d["rate"] - previous) * 100)
            d["changeBps"] = change
            d["move"] = "hold" if change == 0 else ("hike" if change > 0 else "cut")
        previous = d["rate"]
    return decisions


def main() -> None:
    resp = requests.get(PRESS_URL, headers=UA, timeout=TIMEOUT)
    resp.raise_for_status()
    print(f"[cbr] {PRESS_URL} -> HTTP {resp.status_code}, {len(resp.content)} bytes",
          file=sys.stderr)

    decisions = annotate_moves(extract_decisions(resp.text))

    if len(decisions) < MIN_DECISIONS:
        print(f"[cbr] only {len(decisions)} decisions parsed (expected >= {MIN_DECISIONS}) "
              f"— treating as a layout change, not writing", file=sys.stderr)
        sys.exit(1)

    first, last = decisions[0], decisions[-1]
    print(f"[cbr] {len(decisions)} decisions, {first['date']} ({first['rate']}%) "
          f"-> {last['date']} ({last['rate']}%)", file=sys.stderr)

    write_dataset("cbr-history", decisions)


if __name__ == "__main__":
    main()
