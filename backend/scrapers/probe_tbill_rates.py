"""Is there a CSV of Kenya's Treasury bill rate history, or only 250 PDFs?

WHY THIS PROBE EXISTS
---------------------
The app has no Treasury bill history at all. `public/data/tbills.json` holds
three rows — today's 91, 182 and 364 — is written by no scraper, and is stuck
at whatever date it was last edited by hand. `src/lib/real-history.ts` was
built and tested to answer "did bills actually make a Kenyan money?" and sits
imported nowhere, waiting on a dataset that does not exist.

The known route to that dataset is the weekly results archive under
`/uploads/{91,182,364}_day_historical_treasury_bill_results/` — roughly 250
PDFs, each needing the same column-geometry parsing that `auction_results.py`
does for bonds, where `Coupon Rate (%) 1 1.277 1 2.873` is two numbers and a
naive regex finds four. That is weeks of parser work and a permanent
maintenance surface, for a series CBK already tabulates.

WHAT CHANGED THE QUESTION
-------------------------
Research turned up a live CSV artifact on CBK's own site:

    /uploads/interest_rates/1722065249_Central%20Bank%20Rates.csv

That single URL is the finding. It is not the series we want, but it proves
CBK's statistics tables have a CSV EXPORT that materialises static files under
`/uploads/<table_slug>/<hash>_<Table Name>.csv`. If the Treasury bill tables
export the same way, a 250-PDF parse collapses into one HTTP GET.

WHAT THIS REPORTS, AND WHAT IT DELIBERATELY DOES NOT DO
-------------------------------------------------------
Read-only. It writes nothing, gates nothing, and never fails CI — the whole
point is to answer a question before any parser is written against a guess.

Per page it reports: whether the page answers, whether a <table> is in the
SERVED HTML (rather than assembled by JavaScript we would need a browser for),
how many rows, and — the thing it exists for — every link to a `.csv`, `.xlsx`
or `.xls` under `/uploads/`, printed in full so the URL can be lifted straight
into a scraper.

It also reports the page's terms-of-use link if one is present. The licence is
genuinely unsettled: the research could not find CBK terms of use, and this
project does not redistribute data it cannot show permission for. A probe that
found the data and ignored the question would be answering the easy half.

WHY THE PAGES BELOW AND NOT A GUESSED URL
-----------------------------------------
docs/DATA-SOURCES.md §15 records the mistake this replaces: every earlier probe
hit `/securities/treasury-bonds/`, which answers HTTP 200 while serving a 2016
archive, and two roadmap items went down as blocked on the strength of it. A
live-looking page is not evidence it is the current one. These paths are the
ones CBK's own navigation and its search index actually surface, and the probe
prints what it received rather than concluding from a status code.
"""
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from common import unreachable
import tls_chain

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 60

PAGES = [
    # The exact series. Weekly, per tenor, already tabulated by the issuer.
    ("Treasury Bills Average Rates",
     "https://www.centralbank.go.ke/bills-bonds/treasury-bills-average-rates/"),
    # The deep monthly tail — CBK has published this back to the 1990s.
    ("Interest Rates (statistics)",
     "https://www.centralbank.go.ke/statistics/interest-rates/"),
    # Where the one CSV we have seen came from. If this page exports and the
    # two above do not, the difference tells us which table type is exportable.
    ("Central Bank Rates",
     "https://www.centralbank.go.ke/central-bank-rates/"),
    # The index of every exportable table, so a future probe need not guess.
    ("Statistics index", "https://www.centralbank.go.ke/statistics/"),
    # The PDF archive, for comparison: how many files would the other path cost?
    ("T-bill results (LIVE listing)",
     "https://www.centralbank.go.ke/bills-bonds/treasury-bills/"),

    # --- the other feeds the same research named as machine-readable -------
    #
    # These are here because the probe costs one HTTP GET each and the run is
    # already happening. Answering four questions in the run that answers one
    # is free; discovering in three weeks that the remittances series was a
    # CSV all along is not.
    #
    # Each is a candidate for a surface the app does not have and a saver in
    # KES-denominated paper needs:
    #   * remittances are the largest single support under the shilling, and a
    #     bond's real return is a currency story before it is a rate story
    #   * the interbank rate against the CBR says whether policy is actually
    #     transmitting, which is what makes "will yields follow the CBR?"
    #     answerable rather than a guess
    #   * the average commercial lending rate is the honest comparator — the
    #     alternative use of the money
    #   * reserves and FX are already shown from a World Bank figure two years
    #     stale; if CBK publishes them weekly in CSV, that is the fix
    ("Diaspora remittances",
     "https://www.centralbank.go.ke/diaspora-remittances/"),
    ("Interbank rates",
     "https://www.centralbank.go.ke/rates/interbank-rates/"),
    ("Commercial bank rates",
     "https://www.centralbank.go.ke/commercial-banks-weighted-average-rates/"),
    ("Daily indicative FX rates",
     "https://www.centralbank.go.ke/rates/forex-exchange-rates/"),
]

DATA_HREF_RE = re.compile(r"\.(csv|xlsx|xls)(\?|$)", re.I)
DT_RE = re.compile(r"dataTable|DataTables", re.I)
AJAX_RE = re.compile(r"""["']ajax["']\s*:\s*["']([^"']+)["']""", re.I)
TERMS_RE = re.compile(r"terms|copyright|disclaimer|privacy|conditions", re.I)
# 91/182/364 are the only tenors CBK issues. Seeing all three in the served
# HTML is what distinguishes the table we want from a page that merely links
# to it.
TENOR_RE = re.compile(r"\b(91|182|364)[\s-]*day", re.I)


# What the probe concluded, accumulated so it can be WRITTEN rather than only
# printed.
#
# The first run of this probe answered its question into a CI log, and the log
# turned out to be effectively unreadable after the fact: the alert step embeds
# a long inline script, so a tail of the job log lands inside that blob rather
# than on the probe's output. Two attempts to read the finding retrieved
# nothing but the alert's source.
#
# A diagnostic whose answer cannot be recovered has not answered anything. So
# the finding is written to a file the refresh commits, next to
# healthcheck-report.txt and archive-integrity.txt, which is how every other
# durable report in this pipeline already works. Anyone — including a session
# with no access to Actions logs at all — can then read it out of the
# repository.
FINDINGS: list[str] = []


def record(line: str) -> None:
    """Print for the live log, and keep for the committed report."""
    print(line)
    FINDINGS.append(line)


def probe(label: str, url: str) -> None:
    print(f"\n=== {label} ===\n  {url}")
    try:
        # tls_chain.get, not requests.get: KNBS is not the only Kenyan
        # government host that serves a leaf without its intermediate, and a
        # probe that reports "unreachable" for a chain problem would send us
        # back to the PDFs for the wrong reason.
        r = tls_chain.get(url, headers=UA, timeout=TIMEOUT)
    except requests.RequestException as exc:
        record(f"[{label}] UNREACHABLE: {exc.__class__.__name__}")
        unreachable(label, exc)
        return

    record(f"[{label}] HTTP {r.status_code}, {len(r.content)} bytes")
    if r.status_code != 200:
        return

    soup = BeautifulSoup(r.text, "lxml")

    # --- the question this probe exists for -------------------------------
    downloads = []
    for a in soup.find_all("a", href=True):
        href = urljoin(url, a["href"])
        if DATA_HREF_RE.search(href):
            downloads.append((href, " ".join(a.get_text().split())[:60]))
    if downloads:
        record(f"[{label}] {len(downloads)} MACHINE-READABLE DOWNLOAD(S):")
        for href, text in downloads[:20]:
            record(f"[{label}]     {href}")
            if text:
                record(f"[{label}]       link text: {text}")
    else:
        record(f"[{label}] no .csv/.xlsx/.xls links in the served HTML")

    # A DataTables grid with export buttons builds the file client-side, so the
    # absence of a link above does not mean the absence of an export. Say so
    # rather than letting a reader conclude "PDF only".
    if DT_RE.search(r.text):
        print("  DataTables present — an export button may build a file "
              "client-side, so a missing link above is not a 'no'")
    ajax = AJAX_RE.search(r.text)
    if ajax:
        record(f"[{label}] AJAX SOURCE DECLARED: {ajax.group(1)[:160]}")

    # --- is the series itself in the HTML? --------------------------------
    tables = soup.find_all("table")
    print(f"  tables in served HTML: {len(tables)}")
    for i, table in enumerate(tables[:3], 1):
        rows = table.find_all("tr")
        head = " | ".join(
            " ".join(c.get_text().split())[:22]
            for c in (rows[0].find_all(["th", "td"]) if rows else [])
        )
        print(f"    table {i}: {len(rows)} rows | header: {head[:150]}")

    tenors = sorted(set(m.group(1) for m in TENOR_RE.finditer(r.text)))
    if tenors:
        print(f"  tenors named in the page: {', '.join(tenors)}")
        if len(tenors) == 3 and tables:
            record(f"[{label}] all three tenors AND {len(tables)} table(s) in the "
                   "served HTML — pandas.read_html would take this even with no "
                   "CSV export")

    # --- the half it would be easy to skip --------------------------------
    terms = [
        urljoin(url, a["href"])
        for a in soup.find_all("a", href=True)
        if TERMS_RE.search(a.get_text()) or TERMS_RE.search(a["href"])
    ]
    if terms:
        print(f"  terms/copyright links (LICENCE IS UNSETTLED — read these): "
              f"{sorted(set(terms))[:4]}")


def main() -> int:
    print("Probing CBK for a machine-readable Treasury bill rate history.")
    print("Read-only. Writes nothing, gates nothing, never fails CI.")
    for label, url in PAGES:
        probe(label, url)
    Path("tbill-probe-report.txt").write_text("\n".join(FINDINGS) + "\n")
    print(f"\n[probe] wrote {len(FINDINGS)} findings to tbill-probe-report.txt")

    print(
        "\nWhat to do with this output:\n"
        "  * A .csv/.xlsx URL under /uploads/ is the ingest endpoint — lift it\n"
        "    verbatim into a scraper and the 250-PDF path is dead.\n"
        "  * All three tenors plus a table means pandas.read_html works even\n"
        "    with no export button.\n"
        "  * An AJAX source means the rows come from an endpoint we can call\n"
        "    directly, which is cheaper still.\n"
        "  * None of the above means the PDFs are genuinely the only route,\n"
        "    and auction_results.py already shows how to parse them.\n"
        "  * Whatever is found, the LICENCE is still unsettled. This project\n"
        "    does not publish data it cannot show permission to redistribute."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
