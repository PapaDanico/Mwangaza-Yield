"""Why not one tap sale in the archive has ever parsed completely.

THE MEASUREMENT THAT PROMPTED THIS
----------------------------------
Completeness across the archive, split by what kind of sale the file records:

    switch     6/6    100%
    primary  226/307   74%
    tap        0/41     0%

Zero. Not one tap sale carries all six core fields, and they are 41 of the 354
records — a third of everything still incomplete, concentrated in 2022-2026,
which is exactly the period a reader would look at first.

A rate of literally 0% is not a scattering of hard files. It is a table this
parser has never been able to read, and it went unnoticed because the archive-
wide figure averaged it away against primary auctions doing fine.

WHY A PROBE AND NOT A PATCH
---------------------------
A tap sale re-opens a bond already sold at auction, at a price fixed in advance.
So the questions the results table answers are different ones, and plausible
guesses about how differ:

  - There may be no "Total Amount Offered" row at all, because the size is the
    tap's, not an auction target.
  - "Coupon Rate" may be absent, because the bond's coupon was set at its
    original auction and the document has no reason to restate it.
  - "Price per Kshs 100" may be a fixed input rather than a cleared result.
  - The table may be laid out per TRANCHE rather than per bond, so the column
    geometry the parser derives from issue codes in a header may not apply.

Each of those wants a different fix, and two of them are not fixes at all — if
CBK genuinely does not print a coupon on a tap sale results page, then those
records are complete in every sense that matters and the SCORE is what is wrong,
not the parse. Marking a field absent-by-design is a different act from
extracting it, and choosing between them by guesswork is how this project
published a false finding once already.

So this prints the reconstructed lines of real tap-sale documents and decides
nothing.

Read-only. Writes nothing. Never gates CI.
"""
import json
import re
import sys
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote

import requests

from auction_results import (
    FIELDS, assign_to_columns, group_lines, header_candidates,
    label_word_positions, results_section,
)

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}

ARCHIVE = Path(__file__).resolve().parents[2] / "public" / "data" / "auction-results.json"

CORE = ["auctionDate", "couponRate", "pricePer100",
        "amountOfferedKESM", "amountAcceptedKESM", "bidsReceivedKESM"]

# Both spellings. CBK writes TAPSALE as one word about as often as TAP SALE, and
# a pattern that demanded a boundary on both sides missed seven files.
TAP_RE = re.compile(r"(?<![A-Z])TAP(?:SALE)?(?![A-Z])")

MAX_FILES = int(sys.argv[1]) if len(sys.argv) > 1 else 4


def tap_sources() -> list:
    """Tap-sale PDFs, worst-parsed first — the ones with most to explain."""
    try:
        records = json.loads(ARCHIVE.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"  archive unreadable: {exc.__class__.__name__}: {exc}")
        return []
    by_url = {}
    for r in records:
        u = r.get("sourceUrl")
        if not u or not TAP_RE.search(unquote(u).upper()):
            continue
        gaps = sum(1 for f in CORE if not r.get(f))
        prev = by_url.get(u, (0, r))
        by_url[u] = (max(prev[0], gaps), r)
    ranked = sorted(by_url.items(), key=lambda kv: -kv[1][0])
    return [(u, g) for u, (g, _) in ranked]


def probe(url: str, gaps: int) -> None:
    name = unquote(url).rsplit("/", 1)[-1]
    print(f"\n{'=' * 78}\n{name[:76]}\n  worst record here is missing {gaps} of 6 core fields\n{'=' * 78}")

    try:
        r = requests.get(url, headers=UA, timeout=60)
        r.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        print(f"  unreachable: {exc.__class__.__name__}: {exc}")
        return
    try:
        import pdfplumber
    except Exception:
        print("  pdfplumber unavailable")
        return

    with pdfplumber.open(BytesIO(r.content)) as pdf:
        pages = [p.extract_words() or [] for p in pdf.pages[:2]]

    for pageno, words in enumerate(pages, 1):
        if not words:
            print(f"\n  --- page {pageno}: NO WORDS — a scanned image, not a text PDF")
            continue
        lines = results_section(group_lines(words))
        cands = header_candidates(lines, None)
        print(f"\n  --- page {pageno}: {len(lines)} line(s), {len(cands)} header candidate(s)")

        if cands:
            codes, centres, density = cands[0]
            print(f"      header: codes={codes}")
            print(f"              centres={[round(c, 1) for c in centres]} density={round(density, 2)}")
        else:
            print("      >>> NO HEADER CANDIDATE — no issue code on any line, so the")
            print("          parser has no column geometry and can read nothing at all.")
            codes, centres = [], []

        # Every reconstructed line, so a row whose LABEL differs from what FIELDS
        # expects is visible as text rather than inferred from its absence.
        print("      reconstructed lines:")
        for ln in lines[:26]:
            print(f"        | {' '.join(w['text'] for w in ln)[:88]}")

        if not centres:
            continue

        # Which of the six the parser finds here, and which rows it never matches.
        label_x = min(centres) - 40
        print("      field rows the parser DOES match:")
        matched = set()
        for key, pattern in FIELDS:
            for line in lines:
                text = " ".join(w["text"] for w in line)
                m = pattern.search(text)
                if not m:
                    continue
                matched.add(key)
                cols = assign_to_columns(line, centres, label_x,
                                         label_word_positions(line, m.span()))
                print(f"        [{key}] -> {cols}   from: {text[:56]}")
                break
        missing = [k for k, _ in FIELDS if k not in matched]
        if missing:
            print(f"      field rows with NO matching line: {missing}")
            print("        (absent from the document, or worded differently — the lines")
            print("         above are the evidence for which)")


def main() -> None:
    print("Probing why no tap sale has ever parsed completely.\n"
          "This decides nothing and writes nothing. A field CBK does not print on a\n"
          "tap-sale results page is absent by design, and marking it so is a\n"
          "different act from extracting it.", file=sys.stderr)
    srcs = tap_sources()
    print(f"=== {len(srcs)} tap-sale PDF(s) in the archive; reading the {MAX_FILES} worst ===")
    for url, gaps in srcs[:MAX_FILES]:
        try:
            probe(url, gaps)
        except Exception as exc:  # noqa: BLE001 — a probe must never take CI down
            print(f"  !! probe raised {exc.__class__.__name__}: {exc}")


if __name__ == "__main__":
    main()
