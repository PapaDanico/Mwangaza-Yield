"""Does the National Treasury publish, monthly, what the World Bank gives us from 2023?

WHY THIS PROBE EXISTS
---------------------
The sovereign panel's oldest figure is `Interest / government revenue`, asOf
2023, with four more at 2024. All seven come from the World Bank. The vintage
is shown on screen, so nobody is misled — but "the World Bank has not published
a newer one" is only an answer if nobody else has either.

Two candidates have already been ruled OUT, and it is worth writing down why so
this is not re-litigated:

  FRED serves Kenya's debt-to-GDP (KENGGXWDGG01GDPPT) out to 2026 = 70.08. Its
  terms put "redistribute any third party's proprietary content ... for
  commercial use without first obtaining express written permission" under
  PROHIBITED. This project licenses its engine commercially. Unusable.

  The IMF DataMapper answers with Kenya figures out to 2031, but years at or
  beyond the current one are PROJECTIONS and this panel shows measurements.

That leaves the obvious candidate nobody has probed: the debtor itself. The
National Treasury publishes a Public Debt Bulletin EVERY MONTH, and it is
already one of the three sources this project is permitted to rely on (CBK,
National Treasury, KNBS). No licence question, no projection question, and a
cadence of months rather than years.

WHY LINKS ARE DISCOVERED AND NEVER CONSTRUCTED
----------------------------------------------
The filenames are not a pattern. One real example:

    FINAL March 2026 Monthly Bulletin Reviewed & Updated 25.05.26 G.pdf

Spaces, an ampersand, an internal date in DD.MM.YY that is the REVISION date
rather than the reporting month, and a trailing "G". A constructed URL would
work until the month somebody appends "(2)" and then fail silently — which is
the worst of the available failure modes, because a scraper that 404s on a new
month looks exactly like a scraper whose source stopped publishing.

So this reads the index page and follows what is actually linked.

A DEFECT THIS PROBE IS WRITTEN TO AVOID
---------------------------------------
An earlier bulletin probe took the FIRST PDFs linked from a CBK page and
reported on those. The first links on that page were sidebar boilerplate —
AuctionRulesGuidelines.pdf and BBP.pdf — so it faithfully reported that CBK's
"bulletins" do not carry reserves or GDP growth. It had not opened a bulletin.
The output read like a negative finding and was actually a selection bug.

The fix is not "take more links". It is to SCORE links for whether they look
like the document being sought, print the score, and report loudly when nothing
scores above zero — because "the index had 109 PDFs and none looked like a debt
bulletin" is a different finding from "the bulletin does not carry this", and
only one of them is about the Treasury.

WHAT THIS DOES NOT DO
---------------------
It writes nothing, stores nothing, and adds no indicator. A keyword match is
not a parser: for a figure to move off the World Bank, it must sit ADJACENT to
its label rather than merely in the same document, and the document must carry
its own reporting month. Both are printed here so a reader can judge them.
"""
import re
import sys
from io import BytesIO

import requests

TIMEOUT = 45
UA = {"User-Agent": "mwangaza-yield-probe/1.0 (+https://mwangazayield.org)"}

INDEX_PAGES = [
    ("Monthly Bulletins index", "https://www.treasury.go.ke/monthly-bulletins"),
    ("Treasury publications", "https://www.treasury.go.ke/publications/"),
]

# Scored, not matched. A link needs to look like a DEBT bulletin, and a recent
# one. `debt` alone is too weak — the site carries debt strategy papers, debt
# sustainability analyses and the MTDS, none of which are the monthly bulletin.
STRONG = ("debt bulletin", "monthly bulletin", "debt monthly")
WEAK = ("bulletin", "debt")
RECENT_YEARS = ("2026", "2025")

MONTHS = ("january february march april may june july august september "
          "october november december").split()

# What the sovereign panel actually shows, and the phrasings each might carry.
# Several per indicator on purpose: a single absent phrase reads as "the
# bulletin does not carry this", which is the wrong conclusion drawn from the
# right observation.
WANTED = [
    ("Debt / GDP", ("debt to gdp", "debt-to-gdp", "per cent of gdp",
                    "percent of gdp", "% of gdp")),
    ("Total public debt", ("total public and publicly guaranteed",
                           "total public debt", "public debt stock")),
    ("External vs domestic", ("external debt", "domestic debt")),
    ("Debt service", ("debt service", "interest payment", "principal repayment")),
    ("Government revenue", ("ordinary revenue", "total revenue")),
]


def head(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def get(url: str):
    """Fetch, returning (status, bytes, text, error). Never raises.

    A dead host is a RESULT here, not a crash — one unreachable page must not
    take the rest of the probe with it.
    """
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=UA)
        return r.status_code, r.content, r.text, None
    except Exception as exc:  # noqa: BLE001 — the exception IS the finding
        return None, None, None, f"{type(exc).__name__}: {exc}"


def score(href: str, label: str) -> int:
    """How much does this link look like a recent monthly debt bulletin?"""
    hay = f"{href} {label}".lower().replace("%20", " ").replace("-", " ")
    n = 0
    if any(s in hay for s in STRONG):
        n += 10
    n += sum(2 for w in WEAK if w in hay)
    if any(y in hay for y in RECENT_YEARS):
        n += 3
    if any(m in hay for m in MONTHS):
        n += 2
    if not hay.strip().endswith(".pdf") and ".pdf" not in hay:
        n -= 5
    return n


def recency(href: str) -> tuple:
    """(year, month) named in the link, for breaking score ties. (0, 0) if none.

    Scores tie constantly — every monthly bulletin looks equally like a monthly
    bulletin, which is the scorer working correctly. But the first run of this
    probe sorted on score alone, so among a dozen links all scoring 19 it took
    whichever three the dict happened to yield first and reported on September,
    October and November 2025 while May and June 2026 sat further down the same
    list. Reporting on a bulletin nine months stale is a strange way to argue
    that this source is fresher than a 2023 World Bank figure.

    This reads the month from the URL, which is safe HERE because it only
    orders candidates. The month a figure is STAMPED with still comes from
    reporting_month() reading the cover page — a filename may carry a revision
    date instead, and getting that wrong would put a real number under a wrong
    date.
    """
    hay = href.lower().replace("%20", " ").replace("-", " ")
    y = re.search(r"\b(20\d\d)\b", hay)
    m = next((i + 1 for i, name in enumerate(MONTHS) if name in hay), 0)
    return (int(y.group(1)) if y else 0, m)


def links_from(html: str, base: str):
    """Every PDF link on the page, with its anchor text, scored and sorted."""
    out = []
    for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html,
                         re.I | re.S):
        href, label = m.group(1), re.sub(r"<[^>]+>", " ", m.group(2))
        if ".pdf" not in href.lower():
            continue
        if href.startswith("/"):
            href = "https://www.treasury.go.ke" + href
        if not href.startswith("http"):
            continue
        out.append((score(href, label), href, " ".join(label.split())[:70]))
    # Deduplicate on URL, keeping the best-scoring anchor for each.
    best: dict = {}
    for s, href, label in out:
        if href not in best or s > best[href][0]:
            best[href] = (s, label)
    # Score first, then RECENCY. Without the second key a dozen bulletins all
    # scoring 19 come back in arbitrary order and the newest is not read.
    return sorted(((s, u, l) for u, (s, l) in best.items()),
                  key=lambda t: (t[0], recency(t[1])), reverse=True)


def context(text: str, needle: str, width: int = 110) -> str:
    i = text.lower().find(needle)
    if i < 0:
        return ""
    lo, hi = max(0, i - width // 2), min(len(text), i + width)
    return "..." + " ".join(text[lo:hi].split()) + "..."


def reporting_month(text: str) -> str:
    """The month the document DESCRIBES, which is not its revision date.

    The filename carries a DD.MM.YY revision stamp; the cover page carries the
    reporting month. Attaching the wrong one to a figure is worse than a World
    Bank figure that is honestly three years old, so this reads the document.
    """
    m = re.search(r"\b(" + "|".join(MONTHS) + r")\s+(20\d\d)\b", text[:4000],
                  re.I)
    return f"{m.group(1).title()} {m.group(2)}" if m else "NOT FOUND on page 1"


def inspect(url: str, label: str) -> None:
    print(f"\n-- {label or '(no anchor text)'}")
    print(f"   {url}")
    status, raw, _, err = get(url)
    if err:
        print(f"   FAILED : {err}")
        return
    print(f"   status : {status}, {len(raw or b'')} bytes")
    if status != 200 or not raw:
        return
    try:
        # pdfplumber, because that is what backend/requirements.txt installs
        # and what auction_results.py already reads CBK PDFs with. The first
        # version of this probe imported pypdf, which is not a dependency —
        # so every document reported "UNREADABLE as PDF" and the probe was
        # answering a question about its own imports while looking like it
        # was answering one about the Treasury.
        import pdfplumber
        with pdfplumber.open(BytesIO(raw)) as pdf:
            pages = len(pdf.pages)
            read = min(pages, 12)
            text = "\n".join((pdf.pages[i].extract_text() or "")
                             for i in range(read))
    except Exception as exc:  # noqa: BLE001
        print(f"   UNREADABLE as PDF: {type(exc).__name__}: {exc}")
        return

    print(f"   pages  : {pages}, read first {read}")
    print(f"   text   : {len(text)} chars extracted")
    if len(text) < 500:
        print("   NO TEXT LAYER — the figures are an image. A scanned "
              "bulletin cannot be parsed and is a NO regardless of content.")
        return
    print(f"   month  : {reporting_month(text)}")

    low = text.lower()
    for name, phrasings in WANTED:
        hit = next((p for p in phrasings if p in low), None)
        if hit:
            print(f"   FOUND  {name:22} via '{hit}'")
            print(f"          {context(low, hit)}")
        else:
            print(f"   absent {name:22} (tried {', '.join(phrasings)})")


def main() -> int:
    head("Does the Treasury publish monthly what the World Bank gives us from 2023?")
    print("Writes nothing, stores nothing, adds no indicator.")
    print("The National Treasury is ALREADY a permitted source — so unlike")
    print("FRED and the IMF, the only open question here is whether the")
    print("document is machine-readable, not whether we may read it.")

    candidates: list = []
    for label, url in INDEX_PAGES:
        head(f"1. {label}")
        print(f"   {url}")
        status, raw, html, err = get(url)
        if err:
            print(f"   FAILED : {err}")
            continue
        print(f"   status : {status}, {len(raw or b'')} bytes")
        if status != 200 or not html:
            continue
        found = links_from(html, url)
        print(f"   pdfs   : {len(found)} linked")
        if not found:
            continue
        print("   top-scoring links (score, url):")
        for s, u, lab in found[:8]:
            print(f"      {s:4}  {u}")
            if lab:
                print(f"            anchor: {lab}")
        # Only pursue links that actually look like the document sought.
        strong = [(s, u, lab) for s, u, lab in found if s >= 10]
        if not strong:
            print("   NOTHING SCORES >= 10. That is a finding about this INDEX")
            print("   PAGE, not about the Treasury: it means no link here")
            print("   looks like a monthly debt bulletin. Do NOT read the")
            print("   inspections below as 'the bulletin lacks these figures'.")
        candidates.extend(strong[:3])

    head("2. Inspecting the documents that actually look like debt bulletins")
    if not candidates:
        print("NONE. No index page yielded a link scoring >= 10.")
        print("This is inconclusive, NOT a no. Next step is to widen the")
        print("index list or read the site by hand — not to write a parser.")
        return 0
    seen = set()
    for _, url, label in candidates:
        if url in seen:
            continue
        seen.add(url)
        inspect(url, label)

    head("Read this before writing a parser")
    print("A keyword match is not a parser. Before an indicator moves off the")
    print("World Bank, three things must hold and be visible above: a text")
    print("layer, the figure ADJACENT to its label rather than merely in the")
    print("same document, and the document's own reporting month — not the")
    print("revision date in its filename.")
    print()
    print("The prize if all three hold: these are OUTTURNS from the debtor,")
    print("published monthly. That beats an IMF projection and a World Bank")
    print("figure stamped 2023 on every axis that matters.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
