"""The QEBR probe must discriminate, and a half-found ratio must not read as found.

WHY THIS EXISTS

`probe_qebr.py` exists to answer whether the Quarterly Economic and Budgetary
Review can refresh the sovereign panel's seven RATIOS. A ratio needs both
halves, and the failure this file guards is subtle: a probe that reported
"government revenue: FOUND" would look like a success and be one, because
`Interest / government revenue` cannot be computed from revenue alone.

Three failure directions, all silent:

  every link scores below the threshold — the probe reports "nothing looks
  like a QEBR" forever, reading as though the Treasury stopped publishing

  every link scores at or above it — the probe opens the Budget Policy
  Statement and reports on that, which is the selection bug the debt-bulletin
  probe already shipped once

  a ratio with one half present is reported as BOTH — an invented number
  wearing the Treasury's authority

All three are asserted. The scoring cases use REAL filenames from the live
site, including the two consecutive quarters that share no convention:

    First QEBR in 2025-26 FY Fina GP PDF (1).pdf
    Second QEBR report in 2025-26 FY.pdf

Runs offline. It asserts nothing about the network — the probe itself reports
reachability, and reachability is not what this file is about.
"""
import re
import sys
from pathlib import Path

from probe_qebr import RATIOS, context, links_from, recency, reporting_period, score

THRESHOLD = 10
BASE = "https://www.treasury.go.ke/sites/default/files/"

SHOULD_SELECT = [
    (BASE + "QEBRs/Second%20QEBR%20report%20in%202025-26%20FY.pdf",
     "Second QEBR report"),
    (BASE + "First%20QEBR%20in%202025-26%20FY%20Fina%20GP%20PDF%20(1).pdf",
     "First QEBR"),
]

# Real Treasury documents that are NOT the QEBR. The Budget Policy Statement is
# the sharp case: same publisher, same year, genuinely fiscal, and not a
# quarterly review.
SHOULD_REJECT = [
    (BASE + "Latest%20updates/2026%20Budget%20Policy%20Statement.pdf",
     "2026 Budget Policy Statement"),
    (BASE + "Debt%20Monthly%20Bulletins/June%202026%20Monthly%20Bulletin.pdf",
     "June 2026 Monthly Bulletin"),
    ("https://www.treasury.go.ke/about", "About us"),
]

failures: list = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        failures.append(msg)


def main() -> int:
    picked = [(lab, score(u, lab)) for u, lab in SHOULD_SELECT]
    dropped = [(lab, score(u, lab)) for u, lab in SHOULD_REJECT]

    for lab, s in picked:
        check(s >= THRESHOLD,
              f"a real QEBR scored {s}, below the {THRESHOLD} threshold, so "
              f"the probe would never open it: {lab}")
    for lab, s in dropped:
        check(s < THRESHOLD,
              f"'{lab}' scored {s} and would be opened and reported on as "
              f"though it were a QEBR")

    lo = min(s for _, s in picked)
    hi = max(s for _, s in dropped)
    check(lo > hi,
          f"no separation: worst QEBR scored {lo}, best non-QEBR {hi}. The "
          f"threshold is arbitrary between them.")

    # RECENCY. Quarterly documents tie on score constantly — that is the
    # scorer working. Without a tie-break the probe reports on whichever the
    # dict yields first, which is how the debt probe read September 2025 while
    # June 2026 sat in the same list.
    second = recency(SHOULD_SELECT[0][0])
    first = recency(SHOULD_SELECT[1][0])
    check(second > first,
          f"Second Quarter must sort ahead of First: got {second} vs {first}")

    # PERIOD comes from the document, and must carry a YEAR. An earlier regex
    # required a four-digit second half, so "2025/26" produced the bare string
    # "First Quarter" — a label that cannot tell 2025 from 2019.
    for text, want in (
        ("QEBR First Quarter 2025/26", "2025/26"),
        ("QEBR Second Quarter 2025/2026", "2025/2026"),
    ):
        got = reporting_period(text)
        check(want in got, f"reporting_period({text!r}) = {got!r}, lost the year")
    check(reporting_period("no period here").startswith("NOT FOUND"),
          "reporting_period invented a period from a document that has none")

    # THE PAIR LOGIC — the reason this probe is not a keyword grep.
    check(len(RATIOS) == 7,
          f"expected the panel's seven ratios, got {len(RATIOS)}")
    for name, nums, dens in RATIOS:
        check(bool(nums) and bool(dens),
              f"{name} has an empty half, so it can never report BOTH")
        # A ratio whose two halves share every phrasing would report BOTH from
        # a single match — half a ratio dressed as a whole one. GDP growth is
        # legitimately self-referential (it is not a constructed ratio); the
        # rest must differ.
        if name != "GDP growth":
            check(set(nums) != set(dens),
                  f"{name}: numerator and denominator phrasings are identical, "
                  f"so one match would report BOTH")

    # THE NEWEST MUST WIN EVEN WHEN IT SCORES LOWER.
    #
    # Observed on the runner: the probe opened QEBRs from 2017/2018 while
    # 2025/26 documents sat in the same list. The Treasury renamed the series,
    # and the old files spell the title out while the new ones say "QEBR", so
    # verbose-and-nine-years-stale scored 16 against terse-and-current at 15.
    # Sorting on score first meant recency only ever broke an EXACT tie, so it
    # never fired. These are the two real URLs, with the real inversion intact.
    old = ("https://www.treasury.go.ke/sites/default/files/QEBRs/Quarterly-"
           "Economic-and-Budgetary-Review-First-Quarter-Financial-Year-"
           "2017-2018-Period-ending-30th-September-2017.pdf")
    new = BASE + "QEBRs/Second%20QEBR%20report%20in%202025-26%20FY.pdf"
    check(score(old, "Quarterly Economic and Budgetary Review First Quarter")
          > score(new, "Second QEBR report"),
          "the scoring inversion this ordering exists to survive is gone — "
          "if scores no longer invert, re-derive the ordering rather than "
          "assuming it is still needed")
    html = (f'<a href="{old}">Quarterly Economic and Budgetary Review First Quarter</a>'
            f'<a href="{new}">Second QEBR report</a>')
    order = [u for _, u, _ in links_from(html)]
    check(bool(order) and "2025-26" in order[0],
          f"a 2017 QEBR is read before a 2025/26 one; got {order[:1]}")

    # A LABEL WITH NO NUMBER IS NOT A FIGURE.
    #
    # Every QEBR opens with an abbreviations table, and the first run of this
    # probe matched 'gross domestic product' there — proving the document
    # DEFINES the term, not that it reports a value. Two such matches would
    # report BOTH and yield a ratio invented from a glossary.
    glossary = ("gdp gross domestic product ict information communication and "
                "technology imf international monetary fund knbs kenya")
    figure = ("the current account balance was at a deficit of us$ 5,110.1 "
              "million (7.0 per cent of gdp) in the year to august")
    check(context(glossary, "gross domestic product")[1] is False,
          "a glossary-only match was reported as carrying a number")
    check(context(figure, "current account")[1] is True,
          "a real figure was reported as having no number nearby")
    check(context(glossary + " ... " + figure.replace("current account",
                                                      "gross domestic product"),
                  "gross domestic product")[1] is True,
          "with both a glossary entry and a real figure present, the probe "
          "must prefer the occurrence carrying a number")

    # The probe must import only what the runner installs. An earlier probe
    # imported pypdf, which is not a dependency, so every document reported
    # UNREADABLE while its test suite stayed green.
    src = Path(__file__).with_name("probe_qebr.py").read_text()
    reqs = (Path(__file__).parents[1] / "requirements.txt").read_text().lower()
    for mod in sorted(set(re.findall(r"^\s*import\s+([a-z_][a-z0-9_]*)", src, re.M))):
        if mod in ("re", "sys", "io"):
            continue
        check(mod in reqs,
              f"probe imports '{mod}', absent from requirements.txt — it will "
              f"fail on the runner with ModuleNotFoundError")

    for f in failures:
        print(f"FAIL: {f}", file=sys.stderr)
    print(f"QEBR {[s for _, s in picked]} vs others {[s for _, s in dropped]}, "
          f"threshold {THRESHOLD}, {len(RATIOS)} ratios, {len(failures)} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
