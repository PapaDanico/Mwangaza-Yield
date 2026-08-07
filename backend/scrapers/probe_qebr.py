"""Can the QEBR refresh the sovereign panel's ratios, or only some of them?

WHAT THIS IS ACTUALLY ASKING, WHICH IS NARROWER THAN "IS THE QEBR USEFUL"
------------------------------------------------------------------------
The sovereign panel shows SEVEN RATIOS, all from the World Bank, the oldest
stamped 2023:

    GDP growth                       2025
    Reserves (import cover)          2024
    Exports / GDP                    2025
    Current account / GDP            2024
    Interest / government revenue    2023   <- the oldest
    External debt / GNI              2024
    Debt service / exports           2024

The Treasury's monthly Public Debt Bulletin was probed first and is a good
source, but it answers a different question: it carries debt/GDP and Ksh
absolutes, and NOT ONE of the seven above. It would add an indicator rather
than refresh these.

A ratio needs BOTH halves. That is the whole point of this probe and the reason
it does not simply grep for indicator names. `Interest / government revenue`
needs interest payments AND revenue; finding revenue alone refreshes nothing.
So each ratio is searched for as a PAIR, and the verdict per ratio is one of:

    BOTH      — the ratio could be computed from this document
    NUMERATOR — half of it; useless alone, but says where to look next
    DENOMINATOR
    NEITHER

A probe that reported "revenue: FOUND" would read like a success and be one.

WHY THE ANSWER IS EXPECTED TO BE PARTIAL, AND WHY THAT IS STILL WORTH KNOWING
-----------------------------------------------------------------------------
The QEBR is a FISCAL document, published under s.83 of the PFM Act 2012 — it
reports revenue and expenditure against budget. So government revenue and
interest payments are likely present, which would cover the oldest of the seven.

GNI, exports, the current account and import cover are BALANCE OF PAYMENTS
quantities. They belong to CBK and KNBS rather than to a budget execution
report, and they may simply not be here. Recording that clearly is a result:
it tells the next person to stop looking in the Treasury and start looking at
CBK's Monthly Economic Indicators, rather than re-probing this document.

LINKS ARE DISCOVERED, NEVER CONSTRUCTED
---------------------------------------
Real filenames from the live site:

    First QEBR in 2025-26 FY Fina GP PDF (1).pdf
    Second QEBR report in 2025-26 FY.pdf

Spaces, parentheses, a trailing "(1)", an apparent typo ("Fina"), and no shared
convention between two consecutive quarters. Nothing can construct both.

AND SCORED, NOT TAKEN IN ORDER
------------------------------
The first version of the debt-bulletin probe sorted candidates on score alone,
and among a dozen links tied at the same score it read September 2025 while
June 2026 sat further down the same list. Recency breaks the tie here for the
same reason. A quarterly document is worth less if the probe reports on one
from two years ago.

WRITES NOTHING. A keyword match is not a parser, and a ratio assembled from two
numbers that happen to appear in the same PDF is worse than an honest 2023
figure — it is a NEW number, invented here, wearing the authority of the
Treasury. Nothing is computed. The surrounding text is printed so a reader can
judge whether each figure sits next to its label.
"""
import re
import sys
from io import BytesIO

import requests

TIMEOUT = 45
UA = {"User-Agent": "mwangaza-yield-probe/1.0 (+https://mwangazayield.org)"}

# Three landing pages, because the site has moved this document at least twice
# and all three currently resolve. A single path would report "the QEBR is
# gone" the next time it moves, which is the wrong conclusion from the right
# observation.
INDEX_PAGES = [
    ("QEBR landing", "https://www.treasury.go.ke/qebr-0"),
    ("QEBR (alternate path)",
     "https://www.treasury.go.ke/quarterly-economic-budgetary-review-qebr/"),
    ("QEBR report page",
     "https://www.treasury.go.ke/quarterly-economic-and-budgetary-review-report"),
]

STRONG = ("qebr", "quarterly economic and budgetary", "quarterly economic & budgetary")
WEAK = ("quarterly", "budgetary", "economic review")
RECENT = ("2026", "2025-26", "2025/26", "2025")

QUARTER_WORDS = ("first", "second", "third", "fourth", "q1", "q2", "q3", "q4",
                 "half", "annual")
MONTHS = ("january february march april may june july august september "
          "october november december").split()

# EACH RATIO AS A PAIR. Several phrasings per half, because one absent phrase
# reads as "the document does not carry this" — the wrong conclusion drawn from
# the right observation, which is the mistake the debt probe's header warns
# about and which this file inherits deliberately.
RATIOS = [
    ("Interest / government revenue",
     ("interest payment", "interest on debt", "debt service cost",
      "domestic interest", "external interest"),
     ("ordinary revenue", "total revenue", "revenue collection",
      "revenue performance")),
    ("Debt service / exports",
     ("debt service", "principal repayment", "external debt service"),
     ("exports of goods", "total exports", "export earnings")),
    ("External debt / GNI",
     ("external debt", "external public debt"),
     ("gross national income", "gni", "gross domestic product", "gdp")),
    ("Current account / GDP",
     ("current account", "balance of payments"),
     ("gross domestic product", "gdp", "percent of gdp")),
    ("Exports / GDP",
     ("exports of goods", "total exports", "export earnings"),
     ("gross domestic product", "gdp", "percent of gdp")),
    ("Reserves (import cover)",
     ("import cover", "months of import", "usable foreign exchange reserves",
      "official reserves"),
     ("months of import", "import cover")),
    ("GDP growth",
     ("gdp growth", "real gdp", "economic growth", "growth rate"),
     ("gdp growth", "real gdp", "economic growth")),
]


def head(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def get(url: str):
    """Fetch, returning (status, bytes, text, error). Never raises.

    A dead host is a RESULT, not a crash — one unreachable landing page must
    not take the other two with it.
    """
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=UA)
        return r.status_code, r.content, r.text, None
    except Exception as exc:  # noqa: BLE001 — the exception IS the finding
        return None, None, None, f"{type(exc).__name__}: {exc}"


def score(href: str, label: str) -> int:
    hay = f"{href} {label}".lower().replace("%20", " ").replace("-", " ")
    n = 0
    if any(s in hay for s in STRONG):
        n += 10
    n += sum(2 for w in WEAK if w in hay)
    if any(y in hay for y in RECENT):
        n += 3
    if any(q in hay for q in QUARTER_WORDS):
        n += 2
    if ".pdf" not in hay:
        n -= 5
    return n


def recency(href: str) -> tuple:
    """(year, quarter) named in the link, for breaking score ties.

    Only ORDERS candidates. The period a figure is stamped with still comes
    from reading the document, because a filename may carry the FY rather than
    the quarter — "2025-26 FY" says nothing about which quarter it covers.
    """
    hay = href.lower().replace("%20", " ").replace("-", " ")
    years = [int(y) for y in re.findall(r"\b(20\d\d)\b", hay)]
    q = 0
    for i, w in enumerate(("first", "second", "third", "fourth")):
        if w in hay or f"q{i + 1}" in hay:
            q = i + 1
    return (max(years) if years else 0, q)


def links_from(html: str):
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
    best: dict = {}
    for s, href, label in out:
        if href not in best or s > best[href][0]:
            best[href] = (s, label)
    # RECENCY FIRST, THEN SCORE — and the order matters more than it looks.
    #
    # This was (score, recency), which reads sensibly and is wrong. Score and
    # recency measure different things, and sorting on score first means
    # recency only ever breaks an EXACT tie. It never fired.
    #
    # Observed on the runner: the probe opened QEBRs from 2017/2018 while
    # 2025/26 documents sat in the same list. The Treasury renamed the series
    # somewhere in between, and the old files spell the title out —
    #
    #   Quarterly-Economic-and-Budgetary-Review-First-Quarter-...-2017-2018  16
    #   Second QEBR report in 2025-26 FY                                     15
    #
    # — so verbose-and-nine-years-stale outranked terse-and-current by one
    # point, and the tie-break was never reached. A probe arguing that the
    # Treasury is fresher than a 2023 World Bank figure, reporting on 2017.
    #
    # Sorting recency first says what was actually meant: among documents that
    # look enough like a QEBR to qualify, read the NEWEST. Score still decides
    # what qualifies — that is the threshold's job, applied by the caller —
    # and still breaks ties between documents of the same period.
    return sorted(((s, u, l) for u, (s, l) in best.items()),
                  key=lambda t: (recency(t[1]), t[0]), reverse=True)


def context(text: str, needle: str, width: int = 120):
    """Return (context, numeric) for the best occurrence of `needle`.

    PREFERS AN OCCURRENCE WITH A NUMBER NEAR IT, AND SAYS WHEN THERE IS NONE.

    The first version took the FIRST occurrence, and on the real documents that
    was reliably the worst one. Every QEBR opens with an abbreviations table, so
    'gross domestic product' matched here:

        gdp gross domestic product ict information, communication and
        technology imf international monetary fund knbs kenya national...

    That is a glossary entry. It proves the document defines the term, not that
    it reports a figure — precisely the "merely in the same document" failure
    this probe's own doctrine warns against, reproduced by the probe.

    A label with no number beside it cannot populate an indicator, so
    occurrences are scanned and one carrying a digit within the window wins.
    `numeric` is returned rather than inferred by the reader, because a match
    with no number anywhere is a materially different finding from a match with
    one, and the two must not print identically.
    """
    best = None
    start = 0
    while True:
        i = text.find(needle, start)
        if i < 0:
            break
        lo, hi = max(0, i - width // 2), min(len(text), i + width)
        window = text[lo:hi]
        snippet = "..." + " ".join(window.split()) + "..."
        if re.search(r"\d", window):
            return snippet, True
        if best is None:
            best = snippet
        start = i + 1
    return (best, False) if best else ("", False)


def reporting_period(text: str) -> str:
    """The period the document DESCRIBES, read from the document itself."""
    m = re.search(r"\b(first|second|third|fourth)\s+quarter\b", text[:6000], re.I)
    # The second half may be two digits or four — "2025/26" and "2025/2026"
    # both appear in Treasury documents, sometimes in the same one. An earlier
    # pattern required four and silently dropped the year from every document
    # using the short form, leaving the period reported as "First Quarter" with
    # no year at all: a period label that cannot distinguish 2025 from 2019.
    fy = re.search(r"\b(20\d\d)\s*[/-]\s*(\d{2,4})\b", text[:6000])
    parts = []
    if m:
        parts.append(f"{m.group(1).title()} Quarter")
    if fy:
        parts.append(f"FY {fy.group(1)}/{fy.group(2)}")
    if not parts:
        m2 = re.search(r"\b(" + "|".join(MONTHS) + r")\s+(20\d\d)\b", text[:6000], re.I)
        if m2:
            parts.append(f"{m2.group(1).title()} {m2.group(2)}")
    return " ".join(parts) if parts else "NOT FOUND in the first pages"


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
        import pdfplumber
        with pdfplumber.open(BytesIO(raw)) as pdf:
            pages = len(pdf.pages)
            read = min(pages, 25)
            text = "\n".join((pdf.pages[i].extract_text() or "")
                             for i in range(read))
    except Exception as exc:  # noqa: BLE001
        print(f"   UNREADABLE as PDF: {type(exc).__name__}: {exc}")
        return

    print(f"   pages  : {pages}, read first {read}")
    print(f"   text   : {len(text)} chars extracted")
    if len(text) < 500:
        print("   NO TEXT LAYER — a scanned document cannot be parsed. This is")
        print("   a NO regardless of what the figures say.")
        return
    print(f"   period : {reporting_period(text)}")

    low = text.lower()
    for name, nums, dens in RATIOS:
        n_hit = next((p for p in nums if p in low), None)
        d_hit = next((p for p in dens if p in low), None)
        if n_hit and d_hit:
            verdict = "BOTH      "
        elif n_hit:
            verdict = "NUMERATOR "
        elif d_hit:
            verdict = "DENOM     "
        else:
            verdict = "NEITHER   "
        print(f"   {verdict} {name}")
        for role, hit in (("num", n_hit), ("den", d_hit)):
            if not hit or (role == "den" and hit == n_hit):
                continue
            snip, numeric = context(low, hit)
            # A label with no digit beside it anywhere in the document is a
            # glossary or contents entry, not a figure. Flagged loudly rather
            # than printed identically, because a BOTH assembled from two
            # glossary entries would be a ratio invented from a table of
            # contents — which is what the first run of this probe reported.
            flag = "" if numeric else \
                "  [NO NUMBER NEARBY — glossary or contents entry, not a figure]"
            print(f"        {role} '{hit}'{flag}: {snip}")


def main() -> int:
    head("Can the QEBR refresh the sovereign panel's RATIOS?")
    print("Writes nothing, computes nothing, adds no indicator.")
    print()
    print("A ratio needs BOTH halves. Finding 'revenue' alone refreshes")
    print("nothing, so each is searched as a pair and reported as")
    print("BOTH / NUMERATOR / DENOM / NEITHER.")
    print()
    print("The Treasury is ALREADY a permitted source, so the open question")
    print("is what the document contains — not whether we may read it.")

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
        found = links_from(html)
        print(f"   pdfs   : {len(found)} linked")
        for s, u, lab in found[:6]:
            print(f"      {s:4}  {u}")
            if lab:
                print(f"            anchor: {lab}")
        strong = [(s, u, lab) for s, u, lab in found if s >= 10]
        if not strong:
            print("   NOTHING SCORES >= 10 — a finding about THIS PAGE, not")
            print("   about the QEBR. Do not read the section below as")
            print("   'the QEBR lacks these figures'.")
        candidates.extend(strong[:2])

    head("2. Inspecting the documents that look like a QEBR")
    if not candidates:
        print("NONE. No landing page yielded a link scoring >= 10.")
        print("INCONCLUSIVE, not a no. Widen the index list or read the site")
        print("by hand — do not write a parser off this.")
        return 0

    seen = set()
    for _, url, label in sorted(candidates, key=lambda t: (t[0], recency(t[1])),
                                reverse=True):
        if url in seen:
            continue
        seen.add(url)
        inspect(url, label)

    head("How to read this")
    print("BOTH is the only verdict that makes a ratio computable, and even")
    print("then it is a candidate for a parser rather than a parser: the two")
    print("figures must be the SAME PERIOD and on the same basis, which a")
    print("keyword match cannot tell you. Read the printed context.")
    print()
    print("NEITHER across the balance-of-payments ratios would be the expected")
    print("result, not a failure. The QEBR reports budget execution under s.83")
    print("of the PFM Act; GNI, exports, the current account and import cover")
    print("belong to CBK and KNBS. Recording that sends the next search to the")
    print("right institution instead of back to this document.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
