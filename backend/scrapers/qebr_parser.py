"""Read the sovereign-panel ratios the QEBR actually states, and refuse the rest.

WHAT THIS REPLACES, AND WHAT IT DOES NOT
----------------------------------------
The sovereign panel carries seven ratios, all from the World Bank, the oldest
stamped 2023. probe_qebr.py established that the Treasury's Quarterly Economic
and Budgetary Review carries some of them with figures beside their labels.

This parser takes THREE of them. It deliberately does not take the fourth, and
that refusal is the most important thing in this file.

THE THREE IT TAKES, AND WHY THEY ARE SAFE
-----------------------------------------
Each is a single figure stated next to its own label, in a sentence that says
what it is. Nothing is computed, combined or converted:

    GDP growth        "registered a real gdp growth rate of 4.6 percent"
    Import cover      "reserves represented 5.7 months of import cover"
    Current account   "deficit stood at us$ 3,298.9 million (2.4 percent of gdp)"

The last is the best case in the document: the Treasury has already divided by
GDP and printed the ratio, so we are reading a number rather than making one.

A cross-check that the extraction is sound rather than merely plausible: the
World Bank puts 2025 GDP growth at 4.63 and the QEBR says 4.6. Two independent
sources agreeing to a rounding is worth more than any regex.

THE FOURTH IS REFUSED, AND HERE IS THE EVIDENCE
-----------------------------------------------
`Interest / government revenue` is the panel's oldest figure at 1,314 days, so
it is the one most worth replacing and the one this parser most wants. Both
halves that probe_qebr.py matched are the WRONG NUMBERS, and each is wrong in a
way that reads as right:

    "36. foreign interest payments amounted to ksh. 104.7 billion"

FOREIGN interest, not total. Domestic interest is the larger share for Kenya
and is reported separately.

    "shortfall recorded in ordinary revenue of ksh. 110.6 billion"

A SHORTFALL AGAINST TARGET — the amount revenue MISSED BY, not the revenue.
Reading it as the level understates revenue by an order of magnitude.

Divide one by the other and you get 104.7 / 110.6 = 94.7%, against a real
figure nearer a third. It is not a small error: it would put a headline on the
dashboard saying Kenya spends almost every shilling it collects on interest,
sourced to the National Treasury, and it would look entirely credible.

That is why `interest_over_revenue` exists below and always returns None. A
deleted function invites reimplementation; a function that documents its own
refusal does not. It will return a figure the day somebody confirms which line
in the QEBR carries TOTAL interest and which carries the revenue LEVEL — from
the tables, not from prose that happens to contain both words.

HOW IT REFUSES IN GENERAL
-------------------------
Every extractor requires the number adjacent to its own label, and returns None
otherwise. A missing indicator is a fact the caller can act on; a guessed one
is not recoverable, because nothing downstream can tell it from a real one.
"""
import re
import sys
from io import BytesIO

import requests

TIMEOUT = 45
UA = {"User-Agent": "mwangaza-yield/1.0 (+https://mwangazayield.org)"}

SOURCE = "National Treasury, Quarterly Economic and Budgetary Review"
INDEX = "https://www.treasury.go.ke/quarterly-economic-and-budgetary-review-report"

# Enough pages to reach the macro section, few enough to stay quick. The
# figures sought sit in the opening economic review, not the annexes.
MAX_PAGES = 25

# Written as a NUMBER FOLLOWED BY ITS OWN WORDS, so a figure can only be picked
# up in a sentence that says what it is. `[\d.,]+` rather than `\d+` because
# the document writes 3,298.9 and 4.6 in the same paragraph.
NUM = r"([\d][\d,]*\.?\d*)"


def _f(s: str) -> float:
    return float(s.replace(",", ""))


def gdp_growth(text: str):
    """"registered a real gdp growth rate of 4.6 percent"

    Anchored on "real gdp growth" so a nominal or sectoral growth rate cannot
    satisfy it — the document quotes several, and they are different numbers
    for different things.
    """
    m = re.search(rf"real gdp growth rate of\s+{NUM}\s*per\s*cent", text)
    return _f(m.group(1)) if m else None


def import_cover(text: str):
    """"reserves represented 5.7 months of import cover"

    The same sentence also carries the prior-year comparison ("compared to 4.7
    months"), so the pattern requires "months of import cover" immediately
    after the figure rather than merely nearby.
    """
    m = re.search(rf"{NUM}\s*months?\s+of\s+import\s+cover", text)
    return _f(m.group(1)) if m else None


def current_account_pct_gdp(text: str):
    """"deficit stood at us$ 3,298.9 million (2.4 percent of gdp)"

    Returned NEGATIVE when the document says deficit, which it does in every
    edition seen. The panel's World Bank series is signed the same way, and a
    deficit published as a positive number would read as a surplus — the one
    error here that flips the meaning rather than shifting the value.
    """
    # `[\s\S]` rather than `[^.]`. The first version excluded full stops to
    # stay inside one sentence, and the figure it is reaching across is
    # "us$ 3,298.9 million" — the decimal point stopped the match dead, so the
    # extractor returned None on the exact sentence it was written for. Both
    # ends are tightly anchored, so a 120-character window cannot wander into
    # a different claim.
    m = re.search(
        rf"current account (deficit|surplus)[\s\S]{{0,120}}?\(\s*{NUM}\s*per\s*cent\s+of\s+gdp\s*\)",
        text)
    if not m:
        return None
    value = _f(m.group(2))
    return -value if m.group(1) == "deficit" else value


def interest_over_revenue(text: str):
    """ALWAYS None. See the module docstring for the evidence.

    THE EVIDENCE CHANGED SHAPE TWICE. Both halves were originally believed
    absent. Diagnostics against the live Q3 FY2025/26 document settled each:

      DENOMINATOR — PRESENT, and better labelled than expected:
        "the national government revenue collection including ministerial
         appropriation in aid (a-i-a) for the period between july 2025 - march
         2026 amounted to ksh 2,278.1 billion (12.1 percent of gdp)"
      That is the LEVEL. Only the Q2 SHORTFALL sentence had been matched
      before, and the level written off from that single match.

      NUMERATOR — ABSENT from this document. Searching every occurrence of
      interest payment/paid/cost, consolidated fund, cfs, domestic interest and
      foreign interest across the Q3 text returns TWO hits, both inside the
      abbreviations table:
          "cfs consolidated fund services ebus extra budgetary units"
      No interest figure of any kind. The foreign-interest line reasoned from
      earlier (ksh 104.7 billion) is in the Q2 document, not this one.

    So the ratio is not refused because the numbers mean the wrong thing. It is
    refused because one of them is not there. Against Ksh 2,278.1bn of revenue,
    that foreign figure would give 4.6% — nowhere near a plausible total — which
    independently confirms foreign interest is not total interest.

    WHAT WOULD ACTUALLY SETTLE IT, and why it is not a regex:

    ROUND 3 — THE TABLES WERE READ, AND THE ANSWER IS STILL NO.

    The obvious next move was extract_tables over the full document, and
    probe_qebr_tables.py did it. Reported per strategy, both 2025/26 QEBRs:

        Q3 (51 pages)   lines: 1 table    text: 44 tables    33 candidate
        Q2 (44 pages)   lines: 1 table    text: 41 tables    rows in total

    The line-based default finds one table per document because these reports
    are typeset without ruling lines. The text strategy finds dozens — but they
    are PROSE, sliced into pseudo-columns by character alignment, and the rows
    come back with words split mid-token:

        "amounted to KSh. 104.7 billion, an increase f | rom KSh."
        "34. As a | proportion of G | DP, the to | tal reven | ue"

    None of the 33 rows is a fiscal-table row. Table 5, "expenditure and net
    lending" — the one the prose points at — was extracted by NEITHER strategy.
    It is likely a raster image, or needs explicit column boundaries. That is
    the specific blocker now, in place of a vague "read the tables".

    AND THE PERIODS DO NOT LINE UP ANYWAY, WHICH IS THE STRONGER REASON.

    The revenue level is July 2025 - March 2026, which is Q3. Q3's document
    carries no interest figure in prose or in any extractable table. Q2 states
    foreign interest (Ksh 104.7bn) and goes on to mention domestic interest —
    but Q2 covers July-December 2025. Pairing Q2 interest with Q3 revenue is
    exactly the same-period failure this refusal exists to prevent, so the
    apparent lead does not lead anywhere.

    WHY THIS IS NOT WORTH A FOURTH ROUND

    The panel is not missing this figure. context.json carries the World Bank's
    GC.XPN.INTP.RV.ZS at 24.28. It is OLD, not absent, and an old figure that
    says how old it is beats a current-looking one built from two numbers that
    do not belong together.

    If someone does return to this, start with a different publication — the
    Annual Public Debt Report or the Budget Review and Outlook Paper — rather
    than with better table settings on this one. Three rounds against the QEBR
    have each ended here.

    This is a function rather than an absence so that the reasoning sits where
    somebody would come looking to add it. Returning None is the correct
    output until the source lines are confirmed from the tables.
    """
    return None


def reporting_period(text: str) -> str | None:
    """The quarter the document describes, read from the document."""
    # READ FROM THE COVER PAGE, WHICH SAYS IT BETTER THAN A QUARTER LABEL DOES.
    #
    # This took three attempts and the first two are worth recording, because
    # each was a reasonable guess and each was wrong in a different direction.
    #
    #   1. Quarter and fiscal year matched SEPARATELY and joined. Every QEBR
    #      compares against the prior year, so "fy 2024/25" appears in the
    #      prose first — Q2 2025/26 figures were stamped FY 2024/25. A whole
    #      year wrong, assembled from two correct matches.
    #
    #   2. Over-corrected: required "quarter fy YYYY/YYYY" as one adjacent
    #      phrase. Returned None on the real document, so every record was
    #      "asOf unknown" and nothing could be published. Safe, but useless.
    #
    # The document itself, read on a runner rather than guessed at, opens:
    #
    #     quarterly economic and budgetary review third quarter, financial
    #     year 2025/2026 period ending 31st march 2026 may 2026 edition
    #
    # Two things attempt 2 could not have known: there is a COMMA after the
    # quarter, and it writes "financial year" rather than "fy". Guessing the
    # wording was the mistake both times; this is the wording.
    #
    # "period ending 31st march 2026" is better than any quarter label. It is
    # an exact date, so a reader sees how old a figure is rather than having to
    # know when Q3 of a Kenyan fiscal year falls, and it sorts.
    ending = re.search(
        r"period\s+ending\s+(\d{1,2})\s*(?:st|nd|rd|th)?\s+"
        r"(january|february|march|april|may|june|july|august|september|"
        r"october|november|december)\s+(20\d\d)", text[:4000])
    if ending:
        month = ("january february march april may june july august september "
                 "october november december").split().index(ending.group(2)) + 1
        return f"{ending.group(3)}-{month:02d}-{int(ending.group(1)):02d}"

    # Fallback: the quarter label, with the comma and the spelled-out words the
    # cover page actually uses. Still one phrase — never assembled from parts.
    joint = re.search(
        r"\b(first|second|third|fourth)\s+quarter\s*,?\s*"
        r"(?:financial\s+year|fy)\s*(20\d\d)\s*[/-]\s*(\d{2,4})\b", text[:8000])
    if joint:
        return f"{joint.group(1).title()} Quarter FY {joint.group(2)}/{joint.group(3)}"
    # No third fallback that guesses. A figure under the wrong date is worse
    # than a figure with no date, which is what attempt 1 proved.
    return None


INDICATORS = [
    ("qebr-gdp-growth", "GDP growth", gdp_growth, "% y/y",
     "Whether the economy behind the borrowing is still expanding. Growth is "
     "what eventually pays debt down without new borrowing."),
    ("qebr-import-cover", "Reserves (import cover)", import_cover, "months",
     "How many months of imports the reserves would cover. The buffer that "
     "decides whether a shilling shock has to be met by borrowing."),
    ("qebr-current-account", "Current account / GDP", current_account_pct_gdp,
     "% of GDP",
     "What the country earns abroad against what it spends there. A persistent "
     "deficit has to be financed, and financing it is what borrowing is for."),
]


def extract(text: str, period: str | None = None) -> list:
    """Records for whatever is confidently present. Never guesses."""
    low = text.lower()
    period = period or reporting_period(low)
    out = []
    for ident, label, fn, unit, note in INDICATORS:
        value = fn(low)
        if value is None:
            continue
        out.append({
            "id": ident,
            "label": label,
            "value": value,
            "unit": unit,
            "asOf": period or "unknown",
            "source": SOURCE,
            "sourceUrl": INDEX,
            "note": note,
        })
    return out


def read_pdf(raw: bytes) -> str:
    import pdfplumber
    with pdfplumber.open(BytesIO(raw)) as pdf:
        n = min(len(pdf.pages), MAX_PAGES)
        return "\n".join((pdf.pages[i].extract_text() or "") for i in range(n))


def main() -> int:
    """Dry run: fetch the newest QEBR, print what would be extracted.

    Writes nothing. Wiring these into context.json is a separate decision from
    proving they can be read, and the World Bank figures they would replace are
    honest about their own age in the meantime.
    """
    print("QEBR parser — DRY RUN, writes nothing")
    try:
        r = requests.get(INDEX, timeout=TIMEOUT, headers=UA)
    except Exception as exc:  # noqa: BLE001
        print(f"index unreachable: {type(exc).__name__}: {exc}")
        return 0
    if r.status_code != 200:
        print(f"index returned {r.status_code}")
        return 0

    links = re.findall(r'href="([^"]+\.pdf)"', r.text, re.I)
    qebrs = [u if u.startswith("http") else "https://www.treasury.go.ke" + u
             for u in links if "qebr" in u.lower()]
    if not qebrs:
        print("no QEBR links found on the index page")
        return 0

    def recency(u: str):
        hay = u.lower().replace("%20", " ").replace("-", " ")
        years = [int(y) for y in re.findall(r"\b(20\d\d)\b", hay)]
        q = next((i + 1 for i, w in enumerate(("first", "second", "third", "fourth"))
                  if w in hay), 0)
        return (max(years) if years else 0, q)

    target = sorted(qebrs, key=recency, reverse=True)[0]
    print(f"newest QEBR: {target}")
    try:
        raw = requests.get(target, timeout=TIMEOUT, headers=UA).content
        text = read_pdf(raw)
    except Exception as exc:  # noqa: BLE001
        print(f"could not read it: {type(exc).__name__}: {exc}")
        return 0

    print(f"text: {len(text)} chars, period: {reporting_period(text.lower())}")
    records = extract(text)
    for rec in records:
        print(f"  {rec['label']:26} {rec['value']:>8}  {rec['unit']}  asOf {rec['asOf']}")
    missing = [lbl for _, lbl, fn, _, _ in INDICATORS if fn(text.lower()) is None]
    for lbl in missing:
        print(f"  {lbl:26}    NOT FOUND — refusing rather than guessing")
    print("\nInterest / government revenue      REFUSED BY DESIGN — the matches "
          "are FOREIGN interest and a revenue SHORTFALL, not totals.")

    # --diagnose: print the raw text behind the two open questions.
    #
    # Both remaining problems are questions about what the DOCUMENT says, and
    # neither can be answered from a development container — the proxy refuses
    # treasury.go.ke. Guessing the wording is how reporting_period acquired its
    # first bug and then its second, so this prints the evidence instead:
    #
    #   1. reporting_period returned None on the real Q3 file, so every record
    #      is stamped "asOf unknown". The fix for the year-wrong bug required
    #      the quarter and fiscal year to be adjacent, and evidently they are
    #      not. What IS the phrasing?
    #
    #   2. current_account_pct_gdp returned -3.0 from Q3, and probe_qebr.py
    #      found no number-adjacent current-account match in the same document.
    #      One of them is wrong. Which sentence produced -3.0?
    if "--diagnose" in sys.argv:
        low = text.lower()
        print("\n" + "=" * 68)
        print("DIAGNOSE 1 — how this document states its own period")
        print("=" * 68)
        print(" ".join(low[:900].split()))

        print("\n" + "=" * 68)
        print("DIAGNOSE 2 — every 'current account', with room to see the figure")
        print("=" * 68)
        for m in re.finditer(r"current account", low):
            lo, hi = max(0, m.start() - 90), min(len(low), m.end() + 190)
            print(f"  @{m.start()}: ...{' '.join(low[lo:hi].split())}...")

        print("\n" + "=" * 68)
        print("DIAGNOSE 3 — every 'percent of gdp', which is what the pattern ends on")
        print("=" * 68)
        for m in re.finditer(r"per\s*cent\s+of\s+gdp", low):
            lo, hi = max(0, m.start() - 200), min(len(low), m.end() + 40)
            print(f"  @{m.start()}: ...{' '.join(low[lo:hi].split())}...")

        # DIAGNOSE 4 — is TOTAL interest stated anywhere?
        #
        # This is the one thing standing between the panel's oldest figure
        # (Interest / government revenue, 1,314 days) and a current one. The
        # denominator turned up in DIAGNOSE 3 by accident:
        #
        #   "the national government revenue collection including ministerial
        #    appropriation in aid (a-i-a) for the period between july 2025 -
        #    march 2026 amounted to ksh 2,278.1 billion (12.1 percent of gdp)"
        #
        # That is the LEVEL, not the shortfall I had been matching. So the
        # denominator is readable and only the numerator is missing.
        #
        # What was found before is FOREIGN interest at ksh 104.7 billion —
        # 4.6% of that revenue, which is nowhere near a plausible total and
        # settles that foreign is not total.
        #
        # In Kenyan budget documents interest sits under CONSOLIDATED FUND
        # SERVICES, usually split domestic and foreign. So this prints every
        # occurrence of the words that would carry it, with enough room to see
        # whether a figure follows and whether it is labelled total, domestic
        # or foreign. Printing all of them rather than the first: the earlier
        # error was reading one match and generalising from it.
        print("\n" + "=" * 68)
        print("DIAGNOSE 4 — every mention of interest, to find a TOTAL")
        print("=" * 68)
        for m in re.finditer(r"interest\s+(?:payment|paid|cost)|consolidated fund"
                             r"|\bcfs\b|domestic interest|foreign interest", low):
            lo, hi = max(0, m.start() - 150), min(len(low), m.end() + 220)
            print(f"  @{m.start()}: ...{' '.join(low[lo:hi].split())}...")

        # DIAGNOSE 5 — the denominator, confirmed rather than assumed.
        #
        # Found once, in passing, while looking for something else. Before it
        # can be a parser it has to be shown to be a stable, labelled line
        # rather than a sentence that happened to appear in this edition.
        print("\n" + "=" * 68)
        print("DIAGNOSE 5 — revenue LEVEL lines (not shortfalls)")
        print("=" * 68)
        for m in re.finditer(r"revenue collection|ordinary revenue|total revenue", low):
            lo, hi = max(0, m.start() - 120), min(len(low), m.end() + 250)
            print(f"  @{m.start()}: ...{' '.join(low[lo:hi].split())}...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
