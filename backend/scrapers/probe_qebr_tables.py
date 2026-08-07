"""Read the QEBR's fiscal TABLES, looking for total interest.

WHY A SEPARATE PROBE AND NOT A WIDER REGEX

`Interest / government revenue` is the sovereign panel's oldest figure at
1,314 days, so it is the one most worth replacing — and therefore the one most
likely to be forced. qebr_parser.py refuses it, and the refusal has already
survived two rounds of evidence:

  DENOMINATOR — present. "the national government revenue collection including
  ministerial appropriation in aid (a-i-a) for the period between july 2025 –
  march 2026 amounted to ksh 2,278.1 billion (12.1 percent of gdp)".

  NUMERATOR — absent from the prose. Every occurrence of interest payment /
  paid / cost, consolidated fund, cfs, domestic interest and foreign interest
  across the extracted text returns two hits, both inside the abbreviations
  table.

The parser reads MAX_PAGES = 25 of 51, and Q2's prose references "table 5:
expenditure and net lending". extract_text FLATTENS table cells — a row's
label and its number can end up on different lines, or run together — so a
figure sitting in a fiscal table is not reliably reachable by any pattern over
that text. That is why the answer is "read the tables", not "widen the regex".

WHAT THIS PRINTS, AND WHY IT PRINTS RATHER THAN DECIDES

Nothing here writes a dataset or feeds the parser. It reports what the tables
actually contain so the decision to publish a ratio can be made against
evidence instead of against a plausible-looking match. The last time a number
was taken on plausibility in this repository it was a bank-discount formula
marked "verified".

The specific things that must be true before any ratio is computed, and which
this probe is designed to expose or refute:

  1. A TOTAL interest figure exists — not foreign-only, not domestic-only.
  2. It covers the SAME PERIOD as the revenue level (July 2025 - March 2026).
  3. It is on the same BASIS: actual, not target; cumulative, not quarterly.

Failing any of those, the honest output is still None, and this probe will
have earned its place by saying so with the table in front of it.
"""
import re
import sys
from io import BytesIO

import requests

INDEX = "https://www.treasury.go.ke/quarterly-economic-and-budgetary-review-report"
TIMEOUT = 60
UA = {"User-Agent": "Mwangaza-Yield/1.0 (+https://mwangazayield.org)"}

# Row labels worth reporting. Deliberately broad: the point is to SEE what the
# document calls things, not to assume. A narrow list here would reproduce the
# original error — searching for the phrasing I expected and concluding absence.
LABELS = re.compile(
    r"interest|consolidated fund|c\.?f\.?s|debt service|redemption|"
    r"total (revenue|expenditure)|ordinary revenue|appropriation in aid|a-i-a",
    re.I,
)

NUM = re.compile(r"\d[\d,]*\.?\d*")


def cell(value) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def main() -> int:
    print("QEBR TABLE PROBE — reads tables, writes nothing\n")
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
        print("no QEBR links on the index page")
        return 0

    def recency(u: str):
        hay = u.lower().replace("%20", " ").replace("-", " ")
        years = [int(y) for y in re.findall(r"\b(20\d\d)\b", hay)]
        q = next((i + 1 for i, w in enumerate(("first", "second", "third", "fourth"))
                  if w in hay), 0)
        return (max(years) if years else 0, q)

    # The two newest, because the numerator and denominator have already turned
    # out to live in different quarters' documents once.
    targets = sorted(set(qebrs), key=recency, reverse=True)[:2]

    import pdfplumber

    for target in targets:
        print("=" * 70)
        print(f"DOCUMENT: {target}")
        try:
            raw = requests.get(target, timeout=TIMEOUT, headers=UA).content
        except Exception as exc:  # noqa: BLE001
            print(f"  unreachable: {type(exc).__name__}: {exc}")
            continue

        try:
            with pdfplumber.open(BytesIO(raw)) as pdf:
                total_pages = len(pdf.pages)
                print(f"  pages: {total_pages}  (the parser reads only its first 25)\n")
                hits = 0
                for page_no in range(total_pages):
                    page = pdf.pages[page_no]
                    for t_no, table in enumerate(page.extract_tables() or []):
                        header = None
                        for row in table:
                            cells = [cell(c) for c in (row or [])]
                            if not any(cells):
                                continue
                            line = " | ".join(cells)
                            # The first row carrying several non-empty cells is
                            # the closest thing to a header, and the header is
                            # what says whether a column is actual or target.
                            if header is None and sum(1 for c in cells if c) >= 3:
                                header = line
                                continue
                            if not LABELS.search(line):
                                continue
                            if not NUM.search(line):
                                continue  # a label with no figure settles nothing
                            hits += 1
                            print(f"  p{page_no + 1} table{t_no}")
                            if header:
                                print(f"    HEADER: {header[:200]}")
                            print(f"    ROW   : {line[:260]}")
                if not hits:
                    print("  NO MATCHING TABLE ROWS ANYWHERE IN THIS DOCUMENT.")
                    print("  If both documents report this, the figure is not in a table")
                    print("  either, and the refusal in qebr_parser.py stands on a third")
                    print("  independent ground rather than on an unchecked assumption.")
                print(f"\n  matching rows: {hits}")
        except Exception as exc:  # noqa: BLE001
            print(f"  unreadable: {type(exc).__name__}: {exc}")

    print("\nRead the HEADER beside each row before believing any number:")
    print("  - actual or target?")
    print("  - cumulative (Jul-Mar) or the quarter alone?")
    print("  - total interest, or foreign/domestic only?")
    print("Revenue to pair against, from the prose: Ksh 2,278.1bn, Jul 2025 - Mar 2026.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
