"""Can we get a CPI SERIES, rather than the single print we hold today?

WHY THIS BLOCKS REAL WORK
-------------------------
`macro.json` carries exactly one CPI record. `real-terms.ts` is built and
inert because of it: `realSeries()` opens with

    if (!points.length || cpiByDate.size === 0) return null;

and the map it wants is a CPI reading dated to EACH rate, not one print reused
across a decade. Its own header says why that refusal is correct — pairing a
2015 Treasury bill with a 2026 CPI print "would answer nothing at all". So
every "what this leaves you in real terms" surface on both platforms currently
renders nothing, and will keep rendering nothing until a series exists.

There is a second problem underneath the first. The one CPI record we hold is
marked `"fallback": true`, meaning it came from CBK because KNBS — the body
that actually compiles the index — fails TLS verification from CI with an
incomplete chain. We do not disable verification for financial data. So the
primary source is unreachable by policy, and any series has to come from
somewhere else.

WHAT THIS ASKS
--------------
Four candidate routes to a monthly series, in descending order of how much we
would trust them:

  1. CBK's own inflation-rates table, if it exists as HTML — the same shape
     `cbr_history_parser.py` already reads successfully for the CBR.
  2. CBK's Monthly Economic Indicators, which is where a series would live.
  3. KNBS, to record precisely HOW it fails today rather than assuming the
     2026-07-25 TLS finding still holds.
  4. The World Bank's FP.CPI.TOTL.ZG — annual, not monthly, and therefore not
     a substitute; but it is keyless, CC BY 4.0, and already in our pipeline,
     so it bounds what we could ship without any new source at all.

It writes nothing. For each candidate it reports the status, and where a page
comes back, whether the text actually contains month-and-percentage pairs —
because a 200 from a page with no series on it is the failure mode that looks
most like success.
"""
import re
import sys
from collections import Counter

import requests

TIMEOUT = 45
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}

MONTHS = ("january", "february", "march", "april", "may", "june", "july",
          "august", "september", "october", "november", "december")

# A month name, then a percentage within a short distance. Deliberately loose:
# the question is "is there a series shaped like this on the page", not "parse
# it correctly". A parser is the NEXT step and only worth writing if this says
# yes.
SERIES_PAT = re.compile(
    r"(" + "|".join(MONTHS) + r")\s*,?\s*(\d{4})?[\s\S]{0,40}?(\d{1,2}\.\d{1,2})\s*%?",
    re.I,
)


def head(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def probe(name: str, url: str) -> None:
    print(f"\n-- {name}")
    print(f"   url    : {url}")
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=UA)
    except requests.exceptions.SSLError as exc:
        # Named separately because it is a DIFFERENT finding from a 404. A TLS
        # failure means the source exists and we are refusing it on purpose;
        # recording it as "unreachable" would lose the reason.
        print(f"   TLS    : verification FAILED — {type(exc).__name__}")
        print("   (we do not disable verification for financial data)")
        return
    except Exception as exc:  # noqa: BLE001 — the exception is the finding
        print(f"   FAILED : {type(exc).__name__}: {exc}")
        return

    print(f"   status : {r.status_code}, {len(r.content)} bytes, {r.headers.get('content-type','?')}")
    if r.status_code != 200:
        return

    try:
        from bs4 import BeautifulSoup
        text = BeautifulSoup(r.text, "lxml").get_text(" ")
    except Exception:
        text = r.text
    text = re.sub(r"\s+", " ", text)

    tables = r.text.lower().count("<table")
    print(f"   tables : {tables} <table> elements")

    hits = SERIES_PAT.findall(text)
    months_seen = Counter(h[0].lower() for h in hits)
    print(f"   pairs  : {len(hits)} month+percentage pairs, {len(months_seen)} distinct months")
    if not hits:
        print("   verdict: no series-shaped text. A 200 with nothing on it.")
        return
    for h in hits[:8]:
        print(f"   sample : {h[0]} {h[1] or '(no year)'} -> {h[2]}")
    # Distinct months is the discriminator. A page quoting THIS month's
    # inflation in prose produces a handful of pairs on one month; a table of
    # monthly history produces many months. Counting raw pairs would not tell
    # the two apart, and the whole point of this probe is telling them apart.
    if len(months_seen) >= 6:
        print(f"   verdict: LOOKS LIKE A SERIES — {len(months_seen)} distinct months present.")
    else:
        print(f"   verdict: probably a single print in prose, not a series "
              f"({len(months_seen)} distinct months).")


def dump_table(name: str, url: str) -> None:
    """Print the table's HEADERS and first rows, so a parser is written against
    what is there rather than what it would be convenient for it to be.

    The loose scan says the CBK inflation page carries a series. It does not
    say WHICH series. The samples it returned descend smoothly — 5.08, 4.88,
    4.66, 4.42 — which is the signature of a twelve-month rolling average, not
    of a year-on-year rate that moves with the months. CBK's table carries both
    columns, and they are different numbers answering different questions.

    Picking the wrong one silently would be worse than parsing nothing: every
    real-terms figure on the site would be computed against an average when it
    claimed to use the annual rate, and no test could catch it because both
    columns are plausible percentages. So the headers get read by a human
    first, and the parser addresses columns BY NAME afterwards.
    """
    print(f"\n-- {name} — structure")
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=UA)
        r.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        print(f"   FAILED : {type(exc).__name__}: {exc}")
        return
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(r.text, "lxml")
    tables = soup.find_all("table")
    print(f"   tables : {len(tables)}")
    for ti, table in enumerate(tables):
        rows = table.find_all("tr")
        print(f"\n   [table {ti}] {len(rows)} rows")
        for ri, row in enumerate(rows[:6]):
            cells = [c.get_text(" ", strip=True) for c in row.find_all(["th", "td"])]
            if cells:
                print(f"     r{ri}: {cells}")
        if len(rows) > 6:
            last = [c.get_text(" ", strip=True) for c in rows[-1].find_all(["th", "td"])]
            print(f"     r{len(rows)-1} (last): {last}")
        # Whether the table is paginated matters as much as its shape. A
        # DataTable rendering 25 of 300 rows server-side looks complete here
        # and silently truncates the history a parser would collect.
        cls = " ".join(table.get("class") or [])
        print(f"     class : {cls or '(none)'}")
    for hint in ("dataTable", "paginate", "wp-block-table", "ajax", "sSource"):
        if hint.lower() in r.text.lower():
            print(f"   pagination hint present in page source: {hint!r}")


def probe_worldbank_cpi() -> None:
    """Annual inflation from a source we already read, as the floor case."""
    url = ("https://api.worldbank.org/v2/country/KE/indicator/FP.CPI.TOTL.ZG"
           "?format=json&per_page=100")
    print("\n-- World Bank FP.CPI.TOTL.ZG (annual inflation, % y/y)")
    print(f"   url    : {url}")
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=UA)
        payload = r.json()
    except Exception as exc:  # noqa: BLE001
        print(f"   FAILED : {type(exc).__name__}: {exc}")
        return
    print(f"   status : {r.status_code}")
    if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        print(f"   verdict: no rows — {str(payload)[:200]}")
        return
    live = [x for x in payload[1] if x.get("value") is not None]
    print(f"   rows   : {len(payload[1])} returned, {len(live)} with a value")
    live.sort(key=lambda x: x["date"], reverse=True)
    for x in live[:6]:
        print(f"   value  : {x['date']} = {round(x['value'], 2)}")
    if live:
        print(f"   span   : {live[-1]['date']}..{live[0]['date']}")
    print("   NOTE   : ANNUAL. Not a substitute for a monthly series — but it is")
    print("            keyless, CC BY 4.0 and already in our pipeline, so it")
    print("            bounds what could ship with no new source at all.")


def main() -> int:
    head("Is there a CPI SERIES we can honestly read?")
    print("macro.json holds ONE CPI print, and it is a CBK fallback because")
    print("KNBS fails TLS. realSeries() returns null until a series exists.")

    head("1. CBK — the source we already parse successfully for the CBR")
    for name, url in (
        ("CBK inflation rates page", "https://www.centralbank.go.ke/inflation-rates/"),
        ("CBK monthly economic indicators", "https://www.centralbank.go.ke/monthly-economic-indicators/"),
        ("CBK statistics landing", "https://www.centralbank.go.ke/statistics/"),
        ("CBK home (what macro_parser reads today)", "https://www.centralbank.go.ke/"),
    ):
        probe(name, url)

    head("1b. The one that looked like a series — what is it actually?")
    dump_table("CBK inflation rates page", "https://www.centralbank.go.ke/inflation-rates/")

    head("2. KNBS — record HOW it fails, do not assume the old finding holds")
    probe("KNBS home", "https://www.knbs.or.ke/")
    probe("KNBS CPI releases", "https://www.knbs.or.ke/consumer-price-index-and-inflation-rates/")

    head("3. The World Bank, as the floor case")
    probe_worldbank_cpi()

    head("What a yes would mean")
    print(
        "A page with many distinct months is a candidate for a parser, not a\n"
        "parser. The next step after a yes is a `cpi_history_parser.py` with\n"
        "its own tests, plus a decision about what `realSeries` should do with\n"
        "an ANNUAL series if that is all we can get — because pairing a 2019\n"
        "bill with a 2019 annual average is defensible in a way that pairing it\n"
        "with a 2026 monthly print is not, and those are different claims that\n"
        "must be labelled differently on screen."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
