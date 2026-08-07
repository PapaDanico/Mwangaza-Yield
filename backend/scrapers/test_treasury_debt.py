"""The link scorer must discriminate, and it must be seen to discriminate.

WHY THIS EXISTS

`probe_treasury_debt.py` chooses which PDFs to open by scoring links and taking
those at or above 10. That threshold is the whole probe: everything downstream
is a report on whatever it selected.

The failure it was written to prevent already happened once. An earlier
bulletin probe took the FIRST PDFs linked from a CBK page — sidebar boilerplate,
as it turned out — and reported that CBK's bulletins carry no reserves or GDP
growth figures. It had never opened a bulletin. The output read like a negative
finding about the source and was a selection bug in the probe.

A scorer can fail in two opposite directions and both are silent:

  scores everything BELOW 10 — the probe reports "nothing looked like a debt
  bulletin" forever, and reads as though the Treasury stopped publishing

  scores everything AT OR ABOVE 10 — the probe opens complaints policies and
  strategy papers and reports on those, which is the original bug restored

So both directions are asserted, against real URLs taken from the live site
rather than invented ones. The positives are genuine filenames, including the
awkward one that motivated discovering links instead of constructing them:

    FINAL March 2026 Monthly Bulletin Reviewed & Updated 25.05.26 G.pdf

Spaces, an ampersand, and an internal DD.MM.YY that is the revision date rather
than the reporting month.

This runs offline. It asserts nothing about the network, so a Treasury outage
cannot turn it red — the probe itself reports reachability, and reachability is
not what this file is about.
"""
import re
import sys
from pathlib import Path

from probe_treasury_debt import links_from, recency, reporting_month, score

THRESHOLD = 10

# Real, from the live site. The first is the filename that motivated the whole
# discover-don't-construct approach.
SHOULD_SELECT = [
    ("https://www.treasury.go.ke/sites/default/files/Debt%20Monthly%20Bulletins/"
     "FINAL%20March%202026%20Monthly%20Bulletin%20Reviewed%20&%20Updated%2025.05.26%20G.pdf",
     "March 2026 Monthly Bulletin"),
    ("https://www.treasury.go.ke/x/November%202025%20Monthly%20Bulletin.pdf",
     "November 2025 Monthly Bulletin"),
]

# Real documents from the same site that are NOT the monthly debt bulletin.
# The MTDS is the sharp case: it is a Treasury debt publication, it is recent,
# and it is emphatically not a monthly outturn bulletin.
SHOULD_REJECT = [
    ("https://www.treasury.go.ke/sites/default/files/2026%20MTDS%20FINAL.pdf",
     "2026 MTDS"),
    ("https://www.treasury.go.ke/wp-content/uploads/COMPLAINTS-POLICY.pdf",
     "Complaints policy"),
    ("https://www.treasury.go.ke/about", "About us"),
]

FAILURES: list = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def main() -> int:
    picked = [(u, lab, score(u, lab)) for u, lab in SHOULD_SELECT]
    dropped = [(u, lab, score(u, lab)) for u, lab in SHOULD_REJECT]

    for _, lab, s in picked:
        check(s >= THRESHOLD,
              f"a real monthly bulletin scored {s}, below the {THRESHOLD} "
              f"threshold, so the probe would never open it: {lab}")

    for _, lab, s in dropped:
        check(s < THRESHOLD,
              f"'{lab}' scored {s} and would be opened and reported on as "
              f"though it were a monthly debt bulletin")

    # The mirror-image guard. If every input scored identically the assertions
    # above could still pass by accident on a differently-broken scorer; a
    # scorer that does not SEPARATE its inputs is not scoring.
    lo = min(s for _, _, s in picked)
    hi = max(s for _, _, s in dropped)
    check(lo > hi,
          f"no separation: the worst real bulletin scored {lo} and the best "
          f"non-bulletin scored {hi}. The threshold is arbitrary between them.")

    # The reporting month must come from the document, not the filename. The
    # filename above says 25.05.26; the document describes March 2026.
    check(reporting_month("PUBLIC DEBT BULLETIN MARCH 2026\n1. Introduction")
          == "March 2026",
          "reporting_month did not read the month off the cover page")
    check(reporting_month("no month here at all").startswith("NOT FOUND"),
          "reporting_month invented a month from a document that has none")

    # THE TIE-BREAK. Every monthly bulletin scores the same, correctly. The
    # first run of this probe sorted on score alone and reported on September,
    # October and November 2025 while May and June 2026 sat in the same list.
    # These are the real filenames from that run, deliberately including both
    # the hyphenated and the space-separated forms the site actually mixes.
    base = "https://www.treasury.go.ke/sites/default/files/Debt%20Monthly%20Bulletins/"
    html = "".join(
        f'<a href="{base}{n}">Download</a>' for n in (
            "September-2025-Monthly-Bulletin-1.pdf",
            "October%202025%20Monthly%20Bulletin.pdf",
            "May%202026%20Monthly%20Bulletin.pdf",
            "June%202026%20Monthly%20Bulletin.pdf",
            "July-2025-Monthly-Bulletin.pdf",
        ))
    order = [u for _, u, _ in links_from(html, base)]
    check(bool(order) and "June%202026" in order[0],
          f"the newest bulletin is not read first; got {order[:1]}")
    check(len(order) > 1 and "May%202026" in order[1],
          f"second place is not the second-newest; got {order[1:2]}")
    check(recency(base + "June%202026%20Monthly%20Bulletin.pdf") == (2026, 6),
          "recency misread a space-separated filename")
    check(recency(base + "September-2025-Monthly-Bulletin-1.pdf") == (2025, 9),
          "recency misread a hyphenated filename")

    # THE IMPORT GUARD. The first run of this probe imported pypdf, which is
    # not in backend/requirements.txt, so every document reported "UNREADABLE
    # as PDF" — and this test file passed green throughout, because it only
    # ever exercised the scorer. A probe that cannot open its documents is
    # answering a question about its own imports.
    src = Path(__file__).with_name("probe_treasury_debt.py").read_text()
    reqs = (Path(__file__).parents[1] / "requirements.txt").read_text().lower()
    for mod in sorted(set(re.findall(r"^\s*import\s+([a-z_][a-z0-9_]*)",
                                     src, re.M))):
        if mod in ("re", "sys", "io"):
            continue
        check(mod in reqs,
              f"probe imports '{mod}', which is not in requirements.txt — "
              f"it will fail on the runner with ModuleNotFoundError")

    for f in FAILURES:
        print(f"FAIL: {f}", file=sys.stderr)
    print(f"bulletins {[s for _, _, s in picked]} vs "
          f"others {[s for _, _, s in dropped]}, "
          f"threshold {THRESHOLD}, {len(FAILURES)} failures")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
