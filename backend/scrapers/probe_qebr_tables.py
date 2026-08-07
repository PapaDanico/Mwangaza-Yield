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

WHAT THE FIRST RUN ACTUALLY ESTABLISHED: NOTHING, AND THAT IS THE LESSON

It reported "matching rows: 0" for both documents and printed a conclusion —
"the figure is not in a table either" — that the measurement could not
support. Zero matching rows has two causes, and the probe counted only one of
them. Tables read and holding no interest line is evidence; no tables
extracted at all is evidence of nothing, and pdfplumber's default finds tables
by their RULING LINES, which a Treasury report largely does not draw.

So a check built to stop a conclusion being taken on plausibility stated one
of its own on plausibility. It now counts tables per strategy and says which
case it is in, because a number that cannot distinguish its own causes is not
a measurement.
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

        # TWO STRATEGIES, BECAUSE ZERO ROWS HAS TWO CAUSES.
        #
        # The first version of this probe counted matching ROWS and never
        # counted TABLES, then printed "the figure is not in a table either".
        # It returned 0 for both documents — and 0 is ambiguous between "the
        # tables were read and hold no interest line", which is evidence, and
        # "no tables were extracted at all", which is evidence of nothing.
        #
        # pdfplumber's default finds tables by their RULING LINES. A table
        # typeset without them — which is most of a Treasury report — is
        # invisible to it, so the "lines" pass can return nothing while the
        # document is full of tables. The prose in the same run cites "table 5:
        # expenditure and net lending" and "table 3: balance of payments", so
        # zero tables would have been a fact about the extractor, not the PDF.
        #
        # The text strategy infers columns from character alignment instead and
        # reads ruled and unruled tables alike. Both are run, and the counts are
        # printed, so a zero can be attributed to the right cause.
        STRATEGIES = [
            ("lines", {}),
            ("text", {"vertical_strategy": "text", "horizontal_strategy": "text"}),
        ]

        try:
            with pdfplumber.open(BytesIO(raw)) as pdf:
                total_pages = len(pdf.pages)
                print(f"  pages: {total_pages}  (the parser reads only its first 25)\n")
                hits = 0
                tables_found = {name: 0 for name, _ in STRATEGIES}
                for page_no in range(total_pages):
                    page = pdf.pages[page_no]
                    tables = []
                    for name, settings in STRATEGIES:
                        try:
                            got = page.extract_tables(settings) or []
                        except Exception:  # noqa: BLE001
                            got = []
                        tables_found[name] += len(got)
                        # The text strategy is only consulted where the line
                        # strategy found nothing, so a ruled table is not read
                        # twice and reported twice.
                        if got and (name == "lines" or not tables):
                            tables = got
                    for t_no, table in enumerate(tables):
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
                print(f"\n  tables extracted — lines: {tables_found['lines']}, "
                      f"text: {tables_found['text']}")
                print(f"  matching rows: {hits}")
                if not hits:
                    if tables_found["lines"] == 0 and tables_found["text"] == 0:
                        print("  NO TABLES WERE EXTRACTED AT ALL, by either strategy.")
                        print("  That is a fact about the extractor, not about the document —")
                        print("  it settles NOTHING about whether the figure is there.")
                    else:
                        print("  Tables WERE read, and none carries a matching row. That is")
                        print("  evidence of absence rather than absence of evidence, and it")
                        print("  is a third independent ground for the refusal in")
                        print("  qebr_parser.py.")
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
