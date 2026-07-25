"""Why do some 2020-2023 result PDFs parse to nothing?

The incremental parser reached 169 records across 57 bonds — and reported, on
about one file in ten from those years, `filename names 2 issue(s), parsed 0`.
The guard is behaving correctly: it refuses to hand back a tidy partial result.
But that coverage is genuinely lost, and it is concentrated in exactly the years
that would otherwise give each bond a longer auction history.

There are three quite different explanations and they lead to three different
decisions, so guessing is worthless:

  1. **No text layer at all** — the file is a scan. Then this is over: the
     project has a standing refusal to OCR financial figures, because OCR
     confuses digits and a misread bond price is a wrong number shown with full
     confidence. We would record it and move on.
  2. **Text present, header line not found.** `find_header` looks for a line
     whose words contain the issue codes. If those years print the codes down
     the left as ROWS rather than across the top as columns, the parser is
     looking along the wrong axis — real work, but tractable.
  3. **Text present, codes present, spelled differently.** A separator or
     spacing `ISSUE_RE` does not match. Then the fix is one regex.

This prints enough to tell them apart: whether a text layer exists, whether the
issue codes appear anywhere in it, whether `find_header` finds them, and the
first page reconstructed line by line so the actual layout is visible rather
than imagined.

THE FAILING FILES ARE FOUND, NOT LISTED. The obvious way to write this probe
was to paste in the URLs the failing run named — but the run log truncates each
URL to its last sixty characters, so pasting them means reconstructing the
numeric prefix by guesswork. That exact mistake is already recorded one file
over in `discover_auction_results.py`: three invented URLs that all 404'd and
produced a confident wrong conclusion about what CBK publishes. So this probe
re-derives the listing, re-parses candidates, and reports the ones that actually
come back short. It cannot be wrong about which files are broken.

Read-only. Never gates CI.
"""
import sys
from io import BytesIO

import requests

from auction_results import (
    UA, TIMEOUT, auction_date_from_name, codes_in_name, find_header,
    find_result_pdfs, group_lines, parse_pdf, results_section,
)

FIRST_YEAR, LAST_YEAR = "2020", "2023"
MAX_CANDIDATES = 25   # files to test-parse looking for failures
MAX_REPORTED = 3      # failures to describe in full — enough to see the pattern
MAX_LINES = 30


def is_candidate(url: str) -> bool:
    """Files in the failing years that name more than one bond.

    Both halves of this are evidence, not intuition.

    The YEAR must come from the auction date in the filename, not from any
    four-digit run in the URL. Issue codes are full of years — FXD1-2019-020 —
    so a substring match tags a 2026 file as a 2020-2023 candidate, and since
    the listing is newest-first the probe would spend its whole budget
    re-reading recent files that already parse and then report, reassuringly
    and uselessly, that it found no failures.

    The BOND COUNT filter comes from the failure log: of 14 files that parsed
    short, every single one named two or three bonds and not one named a single
    bond. Whatever is wrong lives in the multi-column geometry, so single-bond
    files have nothing to teach here.
    """
    day = auction_date_from_name(url)
    if not day or not (FIRST_YEAR <= day[:4] <= LAST_YEAR):
        return False
    return len(codes_in_name(url)) >= 2


def describe(url: str, content: bytes) -> None:
    import pdfplumber

    print(f"\n--- {url[-70:]}")
    expected = codes_in_name(url)
    print(f"    filename names: {expected}")

    with pdfplumber.open(BytesIO(content)) as pdf:
        for n, page in enumerate(pdf.pages, 1):
            chars = len(page.chars)
            words = page.extract_words() or []
            print(f"    page {n}: {chars} char(s), {len(words)} word(s)")

            # Explanation (1). No characters means no text layer means a scan,
            # and the decision is settled without further investigation.
            if chars == 0:
                print("      >>> NO TEXT LAYER — a scan. See the no-OCR policy "
                      "in docs/DATA-SOURCES.md.")
                continue

            text = " ".join(w["text"] for w in words)
            for code in expected:
                family, year, tenor = code.split("/")
                present = family in text and year in text
                print(f"      {code}: family+year present in page text = {present}")

            lines = results_section(group_lines(words))
            codes, centres = find_header(lines, expected)
            print(f"      find_header returned: {codes or 'NOTHING'}")
            if codes:
                print(f"      column centres: {[round(c) for c in centres]}")

            # The leading hypothesis, stated so the output can refute it.
            #
            # find_header scores ONE line at a time and keeps the best. If a
            # file prints its two issue codes on two different visual lines —
            # a stacked or wrapped header — then no single line names both,
            # the best line names one, and the parser reads one bond out of
            # two. That is exactly the "names 2, parsed 1" signature, and it
            # would also explain why only multi-bond files fail.
            #
            # This prints which line each expected code actually landed on. If
            # they differ, the hypothesis stands and the fix is to merge
            # header fragments across lines rather than pick a winner.
            for code in expected:
                family, year, tenor = code.split("/")
                bare = str(int(tenor.split(".")[0])) if tenor.split(".")[0].isdigit() else tenor
                hits = []
                for i, line in enumerate(lines):
                    joined = " ".join(w["text"] for w in line)
                    if family in joined and year in joined:
                        hits.append(i)
                print(f"      {code}: appears on line index {hits or 'NONE'}")

            print(f"      first {MAX_LINES} reconstructed line(s):")
            for line in lines[:MAX_LINES]:
                joined = " ".join(w["text"] for w in line)
                print(f"        | {joined[:150]}")


def main() -> None:
    print("=== Why some 2020-2023 auction results parse to nothing ===")
    try:
        pdfs = [u for u in find_result_pdfs() if is_candidate(u)]
    except Exception as exc:  # noqa: BLE001 — a probe must never fail the step
        print(f"listing unreachable: {exc.__class__.__name__} — {exc}")
        return

    print(f"{len(pdfs)} multi-bond file(s) auctioned {FIRST_YEAR}-{LAST_YEAR}; "
          f"test-parsing up to {MAX_CANDIDATES} of them to find failures")
    if not pdfs:
        print("No candidates matched — check the filter before concluding "
              "the archive is clean.")
        return

    reported = 0
    tested = 0
    for url in pdfs[:MAX_CANDIDATES]:
        try:
            resp = requests.get(url, headers=UA, timeout=TIMEOUT)
            resp.raise_for_status()
            content = resp.content
            got = parse_pdf(content, url)
        except Exception as exc:  # noqa: BLE001
            print(f"  skip {url[-50:]}: {exc.__class__.__name__}")
            continue
        tested += 1
        expected = codes_in_name(url)
        if len(got) >= len(expected):
            continue  # this one is fine; nothing to learn from it
        describe(url, content)
        reported += 1
        if reported >= MAX_REPORTED:
            break

    print(f"\ntested {tested} file(s), described {reported} failure(s)")
    if reported == 0:
        print("No failures in this sample. Do NOT read that as the archive "
              "being clean: this probe reads the first "
              f"{MAX_CANDIDATES} candidates only, and the listing is "
              "newest-first, so losses further back go unseen.")
    else:
        print("Read the reconstructed lines above against the three "
              "explanations in this file's docstring BEFORE changing the parser.")


if __name__ == "__main__":
    main()
    sys.exit(0)
