"""Why do some 2020-2023 result PDFs parse to nothing?

The incremental parser reached 169 records across 57 bonds — and reported, on
about one file in ten from those years, `filename names 2 issue(s), parsed 0`.
The guard is behaving correctly: it refuses to hand back a tidy partial result.
But that coverage is genuinely lost, and it is concentrated in exactly the years
that would otherwise give each bond a longer auction history.

WHAT THE FIRST RUN ESTABLISHED (2026-07-25)
-------------------------------------------
Three explanations went in. Two came out dead, and the survivor was not on the
list:

  1. **A scan with no text layer** — REFUTED. Every failing file carries a real
     text layer (~1,900 characters, ~180 words on one page).
  2. **The header not found** — REFUTED, and this was my leading guess. On
     every failing file `find_header` returns BOTH issue codes with two clean
     column centres. The header parses perfectly and the file still yields
     nothing.
  3. **The codes spelled differently** — REFUTED. They read exactly as
     expected, e.g. `TENOR FXD1/2022/015 FXD1/2022/025`.

So the fault is downstream of the header, in FIELD extraction. The failures
also are NOT confined to 2020-2023: the run turned up August 2025, July 2025,
June 2025, May 2025, February 2025 and January 2025 files parsing to zero. The
"2020-2023" framing came from the first sample, not from the archive.

The surviving suspicion, which this probe now prints the evidence for:
`label_x` is a fixed guess, `min(centres) - 40`. On the failing files the
column centres are around 104 and 199, putting the label boundary at 64 — and a
row label like "Weighted Average Rate of Accepted Bids (%)" has words well to
the right of x=64. Those label words get bucketed into the value columns and
joined onto the digits by `cell_value`, so a cell reads
"AcceptedBids(%)13.9128" rather than "13.9128", fails NUMERIC_RE, and is
dropped. Every field, hence zero records from a perfectly-read header.

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
    FIELDS, NUMERIC_RE, UA, TIMEOUT, ISSUE_RE, assign_to_columns,
    auction_date_from_name, codes_in_name, find_header, find_result_pdfs,
    group_lines, parse_pdf, results_section,
)


def codes_on_line_x0(line, wanted):
    """Left edge of the first issue-code word on this line, if any.

    The header defines the column geometry, so it is also the honest place
    to learn where the LABEL column ends — rather than guessing a fixed
    offset from the first column centre.
    """
    text = " ".join(w['text'] for w in line)
    if not ISSUE_RE.search(text):
        return None
    for w in line:
        if any(ch.isdigit() for ch in w['text']) and ('/' in w['text'] or '-' in w['text']):
            return round(w['x0'], 1)
    return None

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
            # The vertical position is the datum that separates two mechanisms
            # which look identical in the line index alone:
            #
            #   (a) group_lines() clusters words whose `top` differs by at most
            #       2.5 points. If CBK renders the two codes on ONE visual row
            #       but at slightly different baselines, they split into two
            #       "lines" and the header is broken by a tolerance, not by a
            #       layout. Then the fix is a number.
            #   (b) The codes really are stacked on separate rows, and the fix
            #       is to merge header fragments across lines.
            #
            # Printing `top` for each tells them apart at a glance: a gap of a
            # point or two is (a); a gap of a whole line height is (b).
            for code in expected:
                family, year, _tenor = code.split("/")
                hits = []
                for i, line in enumerate(lines):
                    joined = " ".join(w["text"] for w in line)
                    if family in joined and year in joined:
                        hits.append((i, round(min(w["top"] for w in line), 1)))
                print(f"      {code}: (line index, top) = {hits or 'NONE'}")

            print(f"      first {MAX_LINES} reconstructed line(s):")
            for line in lines[:MAX_LINES]:
                joined = " ".join(w["text"] for w in line)
                print(f"        | {joined[:150]}")

            # find_header succeeds on these files and they still yield nothing,
            # so the fault is downstream in FIELD extraction. This shows what
            # assign_to_columns actually returns for each row we care about.
            #
            # The suspicion to confirm or kill: label_x is a fixed guess,
            # min(centres) - 40. With centres at [104, 199] that puts the label
            # boundary at 64, and a row label like "Weighted Average Rate of
            # Accepted Bids (%)" certainly has words to the right of x=64. Those
            # words would be bucketed into the value columns and joined onto the
            # digits by cell_value, so the cell reads
            # "AcceptedBids(%)13.9128" instead of "13.9128", fails NUMERIC_RE,
            # and the field is silently dropped — every field, hence zero
            # records from a file whose header parsed perfectly.
            if not codes:
                continue
            label_x = min(centres) - 40
            print(f"      label_x = {label_x:.1f} (min centre {min(centres):.1f} - 40)")
            header_x0 = None
            for line in lines:
                if codes_on_line_x0(line, codes):
                    header_x0 = codes_on_line_x0(line, codes)
                    break
            print(f"      leftmost issue-code word starts at x0 = {header_x0}")
            for key, pattern in FIELDS:
                for line in lines:
                    text = " ".join(w["text"] for w in line)
                    if not pattern.search(text):
                        continue
                    cells = assign_to_columns(line, centres, label_x)
                    verdict = {
                        i: (v, "numeric" if NUMERIC_RE.match(v) else "REJECTED")
                        for i, v in cells.items()
                    }
                    print(f"      {key}: {verdict}")
                    break


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
