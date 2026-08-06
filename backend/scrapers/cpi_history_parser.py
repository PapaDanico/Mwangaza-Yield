"""Kenya CPI history, monthly, from CBK's inflation-rates table.

WHY THIS EXISTS
---------------
`real-terms.ts` is built and inert. `realSeries()` opens by refusing:

    if (!points.length || cpiByDate.size === 0) return null;

and `macro.json` carries exactly ONE CPI record, so every "what this leaves
you in real terms" surface on both platforms renders nothing. The refusal is
right — its own header says pairing a 2015 Treasury bill with a 2026 CPI print
"would answer nothing at all" — so the fix is a series, not a looser guard.

WHY THIS SOURCE
---------------
KNBS compiles the index and is unreachable: it fails TLS verification with an
incomplete chain, verified again on 2026-08-05, and we do not disable
verification for financial data. CBK republishes the same headline figures in
one HTML table at /inflation-rates/, 259 monthly rows spanning 2005-01 to
2026-07, all present in the served DOM.

WHICH COLUMN, AND WHY IT IS NOT A DETAIL
----------------------------------------
The table carries FOUR columns:

    ['Year', 'Month', 'Annual Average Inflation', '12-Month Inflation']
    ['2026', 'July',  '5.08',                     '6.49']

Both value columns are plausible percentages in the same range, and a parser
that took the wrong one would be wrong everywhere, silently, forever — every
real-terms figure on the site computed against a twelve-month rolling average
while the page claimed the year-on-year rate. No test would catch it, because
there is nothing obviously wrong about 5.08.

Two things settle it. The header names it. And the figure this project already
holds — 6.49, scraped independently off CBK's home page by macro_parser — is
the 12-Month Inflation for July 2026 exactly. An independent route to the same
number is worth more than a confident reading of a column heading, and
`corroborates()` below keeps that check alive rather than leaving it in a
commit message.

So: columns are addressed BY NAME. If the heading changes, this refuses to
guess.
"""
import re
import sys
from datetime import date

import requests
from bs4 import BeautifulSoup

from common import write_dataset

URL = "https://www.centralbank.go.ke/inflation-rates/"
TIMEOUT = 60

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}

YEAR_COL = "year"
MONTH_COL = "month"
# The one we want, and the one we must not silently take instead.
WANTED_COL = "12-month inflation"
DECOY_COL = "annual average inflation"

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}

# Observed 259 data rows on 2026-08-05. A floor rather than an equality: the
# table grows by one row a month, and demanding an exact count would fail every
# time CBK publishes. But a collapse to a handful of rows means the table
# changed shape or the page started rendering client-side, and writing that
# over a good history would destroy the series quietly.
MIN_ROWS = 200


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip().lower()


def find_table(soup: BeautifulSoup):
    """The table whose header carries the columns we need, not the first one.

    Addressing "the first table on the page" is how a parser starts reading a
    navigation menu after a redesign. The identifying feature is the header.
    """
    for table in soup.find_all("table"):
        for row in table.find_all("tr")[:3]:
            cells = [norm(c.get_text(" ")) for c in row.find_all(["th", "td"])]
            if YEAR_COL in cells and MONTH_COL in cells and WANTED_COL in cells:
                return table, cells
    return None, []


def parse(html: str, fetched_at: str | None = None) -> list:
    soup = BeautifulSoup(html, "lxml")
    table, header = find_table(soup)
    if table is None:
        raise ValueError(
            f"No table on {URL} has columns {YEAR_COL!r}, {MONTH_COL!r} and "
            f"{WANTED_COL!r}. The page changed shape; refusing to guess which "
            f"column is the year-on-year rate."
        )

    iy, im, iv = header.index(YEAR_COL), header.index(MONTH_COL), header.index(WANTED_COL)

    records = []
    seen = set()
    for row in table.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in row.find_all(["th", "td"])]
        if len(cells) <= max(iy, im, iv):
            continue
        # The page serves the header TWICE, as rows 0 and 1. A positional
        # parser reading from row 1 would take 'Month' as a year and drop it
        # on a ValueError, which looks like nothing happening. Skipping any row
        # whose year is not a year handles both that and any footer.
        year_raw, month_raw, value_raw = cells[iy], cells[im], cells[iv]
        if not re.fullmatch(r"\d{4}", year_raw.strip()):
            continue
        month = MONTHS.get(norm(month_raw))
        if month is None:
            continue
        try:
            value = float(value_raw.replace(",", "").replace("%", "").strip())
        except ValueError:
            continue

        when = f"{int(year_raw):04d}-{month:02d}-01"
        if when in seen:
            continue
        seen.add(when)
        records.append({
            "id": f"cpi-{when}",
            "indicator": "CPI",
            "value": value,
            "date": when,
            "unit": "% y/y",
            "source": "CBK",
            # Named in the data, not just in this file. A reader auditing the
            # JSON should be able to see WHICH of the two published series
            # this is without opening the scraper.
            "series": "12-Month Inflation",
            # `date` is the month the figure DESCRIBES; `fetchedAt` is when we
            # last asked. worldbank.py carries this for the reason that applies
            # here too: without it, "CBK has published nothing newer" and "our
            # scraper stopped running" are the same observation. CBK's table
            # lags a month by design, so a newest row dated last month is
            # normal and must not be readable as a fault.
            "fetchedAt": fetched_at or date.today().isoformat(),
        })

    records.sort(key=lambda r: r["date"])
    return records


def corroborates(records: list, known_value: float, known_date: str) -> bool:
    """Does the column we picked agree with the figure we already hold?

    macro_parser scrapes today's CPI off CBK's home page by regex — a wholly
    different route into the same institution's numbers. If the column chosen
    here disagrees with it, one of the two is reading the wrong thing, and
    publishing either without noticing is the failure this function exists to
    prevent. Kept as code rather than as a note in a commit message, because a
    check that lives in prose is a check nobody runs again.

    `known_date` is a YYYY-MM prefix. Absence of that month is NOT agreement and
    not disagreement — see `latest_month()` for why the caller must not pass the
    current month.
    """
    for r in records:
        if r["date"].startswith(known_date):
            return abs(r["value"] - known_value) < 0.005
    return False


def latest_month(records: list) -> str | None:
    """The newest month the series actually has, as YYYY-MM.

    WHY THIS EXISTS, AND WHY IT IS NOT A TIDY-UP
    --------------------------------------------
    The corroboration was called with TODAY'S month. CBK's table lags by one:
    on 6 August its newest row is July. So `corroborates()` looked for a month
    that does not exist, returned False, and the run printed

        DISAGREES — one of the two reads the wrong column

    against a series that was completely correct. Verified on live data: the
    same records return True for '2026-07' and False for '2026-08'.

    That is worse than no check. A guard that fires on every healthy run trains
    the reader to skip it, so on the day the columns genuinely do diverge —
    the one event this exists to catch — the warning will look like every other
    morning's noise. The project has spent this whole cycle removing guards that
    could not fire; this was the mirror image, shipped by the same hand.

    Anchoring to the newest row present also survives the lag changing. If CBK
    publishes twice in a month, or skips one, the comparison still lands on a
    month that exists.
    """
    return max((r["date"][:7] for r in records), default=None)


def scrape() -> list:
    resp = requests.get(URL, headers=UA, timeout=TIMEOUT)
    resp.raise_for_status()
    records = parse(resp.text)

    if len(records) < MIN_ROWS:
        raise ValueError(
            f"Only {len(records)} monthly CPI rows parsed from {URL}, expected at "
            f"least {MIN_ROWS}. Refusing to overwrite a good history with a "
            f"partial read — a client-rendered table or a changed layout looks "
            f"exactly like this."
        )

    print(f"Parsed {len(records)} monthly CPI rows, "
          f"{records[0]['date']} to {records[-1]['date']}", file=sys.stderr)
    return records


def main() -> int:
    records = scrape()

    # The corroboration runs on every refresh, not once at authoring time.
    # macro.json's own CPI print is scraped by a different route (regex over
    # CBK's home page) and gives a second opinion on whether we are reading the
    # year-on-year column or the rolling average. A disagreement is a finding,
    # so it is printed — but it does not block the write, because the home page
    # regex is the less reliable of the two and a stale print there should not
    # be able to withhold a good history.
    #
    # Against the newest month PRESENT, not today's. See latest_month().
    newest = latest_month(records)
    from_macro = latest_macro_cpi()
    if from_macro is not None and newest is not None:
        agrees = corroborates(records, from_macro, newest)
        print(f"[cpi-history] macro.json CPI is {from_macro}; "
              f"{newest} 12-Month Inflation "
              f"{'AGREES' if agrees else 'DISAGREES — one of the two reads the wrong column'}",
              file=sys.stderr)
    elif from_macro is None:
        # Said out loud rather than skipped in silence. No macro print means the
        # cross-check did not run, which is different from it having passed.
        print("[cpi-history] macro.json holds no CPI print — column not cross-checked",
              file=sys.stderr)

    write_dataset("cpi-history", records)
    return 0


def latest_macro_cpi() -> float | None:
    """Today's CPI as macro_parser scraped it, or None if we hold none."""
    import json

    from common import DATA_DIR

    path = DATA_DIR / "macro.json"
    if not path.exists():
        return None
    try:
        rows = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    cpi = [r for r in rows if r.get("indicator") == "CPI" and r.get("value") is not None]
    return float(cpi[-1]["value"]) if cpi else None


if __name__ == "__main__":
    sys.exit(main())
