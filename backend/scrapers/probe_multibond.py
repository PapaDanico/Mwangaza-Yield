"""Why a multi-bond auction yields figures for only ONE of its bonds.

THE OBSERVATION
---------------
Two auctions whose correct answers we independently know, both parsed at v6:

  2026-02-16  FXD3/2019/015  accepted=54786.72  bids=133792.51
              FXD1/2018/025  accepted=None      bids=None
  2026-04-06  FXD1/2020/015  accepted=36486.54  bids=41421.65
              FXD1/2018/025  accepted=None      bids=None

In each the FIRST bond named in the filename carries the figures and the second
carries nothing. Consistent, not random — so this is one mechanism, not noise.

For February the published record says the missing leg had 79.9bn of bids and
about 45.7bn accepted (total raised 100.5 less the 54.8 we did capture). Those
numbers are in the document. We are dropping them.

WHY A PROBE
-----------
Three mechanisms could do this and they need different fixes:

  1. The header yields ONE column centre, so every value buckets to column 0
     and the second bond never receives one.
  2. Both centres exist, but the values sit closer to the first centre than the
     second — a geometry problem in assign_to_columns.
  3. Both centres exist and both values are assigned, but a later step drops
     one: rec.setdefault ignoring a second write, merge_page preferring an
     earlier page, or the row wrapping so the `break` in read_fields takes only
     the first visual line of a two-line row.

Guessing between them is how this project has gone wrong before — twice today,
once badly enough to publish a false finding. So this prints what the parser
actually sees and decides nothing.

Read-only. Writes nothing. Never gates CI.
"""
import sys
from io import BytesIO

import requests

from auction_results import (
    FIELDS, assign_to_columns, codes_on_line, group_lines, header_candidates,
    label_word_positions, results_section,
)

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}

# Specimens, not samples: for each we hold independently published figures, so
# a value the parser produces can be judged right or wrong rather than merely
# present or absent.
SPECIMENS = [
    ("2026-02-16 — published: 15y bids 133.8bn / accepted 54.8bn, 25y bids 79.9bn",
     "https://www.centralbank.go.ke//uploads/historical_treasury_bond_results/"
     "1498944725_RESULTS FXD3-2019-015 AND FXD1-2018-025 DATED 16-02-2026.pdf"),
    ("2026-04-06 — published: total bids 74.89bn against 40bn offered",
     "https://www.centralbank.go.ke//uploads/historical_treasury_bond_results/"
     "1664563265_RESULTS FXD1-2020-015 AND FXD1-2018-025 DATED 06-04-2026.pdf"),
]


def probe(label: str, url: str) -> None:
    print(f"\n{'=' * 78}\n{label}\n{'=' * 78}")
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
        for pageno, page in enumerate(pdf.pages[:3], 1):
            words = page.extract_words() or []
            if not words:
                continue
            lines = results_section(group_lines(words))
            expected = None
            cands = header_candidates(lines, expected)
            print(f"\n--- page {pageno}: {len(lines)} line(s), "
                  f"{len(cands)} header candidate(s)")
            if not cands:
                continue

            codes, centres, density = cands[0]
            print(f"    chosen header: codes={codes}")
            print(f"                   centres={[round(c, 1) for c in centres]}  density={density}")
            if len(codes) < 2:
                print("    >>> ONE COLUMN ONLY — mechanism 1. Every value buckets to code[0]")

            label_x = min(centres) - 40
            for key, pattern in FIELDS:
                if key not in ("amountOfferedKESM", "amountAcceptedKESM", "bidsReceivedKESM"):
                    continue
                hits = 0
                for line in lines:
                    text = " ".join(w["text"] for w in line)
                    m = pattern.search(text)
                    if not m:
                        continue
                    hits += 1
                    cols = assign_to_columns(
                        line, centres, label_x, label_word_positions(line, m.span())
                    )
                    xs = [(w["text"], round((w["x0"] + w["x1"]) / 2, 1))
                          for w in line if not w["text"][0].isalpha()]
                    print(f"    [{key}] match #{hits}: {text[:74]}")
                    print(f"        numeric words + x-centres: {xs}")
                    print(f"        -> buckets {cols}"
                          f"{'   <<< ONLY ONE COLUMN FILLED' if len(cols) < len(codes) else ''}")
                    if hits == 1:
                        print("        (read_fields breaks here — a wrapped second line "
                              "would never be read)")
                if hits > 1:
                    print(f"    [{key}] {hits} matching lines exist; read_fields uses the first only")


def main() -> None:
    print("Probing why multi-bond auctions yield figures for one bond only.\n"
          "This decides nothing and writes nothing — it prints what the parser sees.",
          file=sys.stderr)
    for label, url in SPECIMENS:
        try:
            probe(label, url)
        except Exception as exc:  # noqa: BLE001 — a probe must never take CI down
            print(f"  !! probe raised {exc.__class__.__name__}: {exc}")


if __name__ == "__main__":
    main()
