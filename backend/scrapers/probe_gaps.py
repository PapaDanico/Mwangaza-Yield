"""What is still missing from records the CURRENT parser has already read.

WHY THIS IS THE RIGHT QUESTION NOW
----------------------------------
Earlier gaps in this archive had a single cause each, and each was worth a
dedicated probe: an unlabelled total column, a tap sale's private vocabulary, a
sentence mistaken for a table row. Those are gone.

What is left does not look like that. Of the rows the newest parser has read,
about one in seven is still short of a field, and the missing combinations are
scattered — coupon with price, accepted with bids, offered alone — across
2009-2012 and 2017 rather than concentrated in one layout. That pattern says
several small variants, not one more decisive fix.

So this probe is deliberately shaped differently from its predecessors. Rather
than fetching the WORST files, it groups the incomplete records by WHICH fields
they are missing and fetches one file per distinct combination. Four copies of
the same failure teach nothing the first copy did not; six different failures
are six different things to learn. The budget buys information, not volume.

A NOTE ON WHAT "READ AT THE CURRENT VERSION" MEANS
--------------------------------------------------
Only rows stamped with the newest PARSER_VERSION are considered. A row from an
older parser is not evidence about the parser — it is evidence about a queue,
and mixing the two is how a coverage figure comes to describe a half-finished
rebuild instead of a capability. That mistake was made in this project once
already: a 99% figure taken from 204 rows fell to 86% at 349, because the
re-read works newest-first through CBK's listing and recent files are the
tidiest. The sample was biased and the number was quoted as though it were not.

Read-only. Writes nothing. Never gates CI.
"""
import collections
import json
import sys
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote

import requests

from auction_results import (
    FIELDS, PARSER_VERSION, assign_to_columns, group_lines, header_candidates,
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

MAX_FILES = int(sys.argv[1]) if len(sys.argv) > 1 else 6


def gap_shapes() -> list:
    """One representative file per distinct missing-field combination.

    Returns (combination, how many records share it, how many distinct files,
    the url to read). Sorted by how many records the shape accounts for, so the
    budget goes to the failures that cost the most.
    """
    try:
        records = json.loads(ARCHIVE.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"  archive unreadable: {exc.__class__.__name__}: {exc}")
        return []

    shapes = collections.defaultdict(lambda: {"records": 0, "urls": []})
    for r in records:
        if r.get("parserVersion") != PARSER_VERSION:
            continue
        missing = tuple(f for f in CORE if not r.get(f))
        if not missing:
            continue
        s = shapes[missing]
        s["records"] += 1
        if r.get("sourceUrl") and r["sourceUrl"] not in s["urls"]:
            s["urls"].append(r["sourceUrl"])

    out = [(k, v["records"], len(v["urls"]), v["urls"][0])
           for k, v in shapes.items() if v["urls"]]
    return sorted(out, key=lambda t: -t[1])


def probe(missing: tuple, n_records: int, n_files: int, url: str) -> None:
    name = unquote(url).rsplit("/", 1)[-1]
    print(f"\n{'=' * 78}")
    print(f"MISSING {list(missing)}")
    print(f"  {n_records} record(s) across {n_files} file(s) share this shape")
    print(f"  reading: {name[:70]}")
    print("=" * 78)

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
            print(f"\n  --- page {pageno}: NO WORDS — a scanned image, not text")
            continue
        lines = results_section(group_lines(words))
        cands = header_candidates(lines, None)
        print(f"\n  --- page {pageno}: {len(lines)} line(s), {len(cands)} header candidate(s)")
        if cands:
            codes, centres, density = cands[0]
            print(f"      header codes={codes}")
            print(f"      centres={[round(c, 1) for c in centres]} density={round(density, 2)}")
        else:
            print("      >>> NO HEADER — no issue code on any line, so there is no")
            print("          column geometry and nothing can be read")
            codes, centres = [], []

        print("      lines:")
        for ln in lines[:24]:
            print(f"        | {' '.join(w['text'] for w in ln)[:86]}")

        if not centres:
            continue
        label_x = min(centres) - 40
        print("      the MISSING fields, and whether any line mentions them:")
        for key in missing:
            pattern = dict(FIELDS).get(key)
            if pattern is None:
                print(f"        [{key}] not a parsed field (it is the date)")
                continue
            hit = False
            for line in lines:
                text = " ".join(w["text"] for w in line)
                m = pattern.search(text)
                if not m:
                    continue
                hit = True
                cols = assign_to_columns(line, centres, label_x,
                                         label_word_positions(line, m.span()))
                verdict = "matched but produced NO cell" if not cols else f"buckets {cols}"
                print(f"        [{key}] {verdict}")
                print(f"              from: {text[:70]}")
                break
            if not hit:
                print(f"        [{key}] NO line matches — worded differently, or absent")


def main() -> None:
    print(f"Probing what is still missing at parser v{PARSER_VERSION}.\n"
          "One file per distinct missing-field combination, because four copies\n"
          "of one failure teach nothing the first did not.", file=sys.stderr)
    shapes = gap_shapes()
    total = sum(n for _, n, _, _ in shapes)
    print(f"=== {len(shapes)} distinct gap shape(s) covering {total} record(s); "
          f"reading {min(MAX_FILES, len(shapes))} ===")
    for missing, n_records, n_files, url in shapes[:MAX_FILES]:
        try:
            probe(missing, n_records, n_files, url)
        except Exception as exc:  # noqa: BLE001 — a probe must never take CI down
            print(f"  !! probe raised {exc.__class__.__name__}: {exc}")
    if len(shapes) > MAX_FILES:
        skipped = sum(n for _, n, _, _ in shapes[MAX_FILES:])
        print(f"\n({len(shapes) - MAX_FILES} shape(s) covering {skipped} record(s) "
              f"not read this run — raise the argument to see them)")


if __name__ == "__main__":
    main()
