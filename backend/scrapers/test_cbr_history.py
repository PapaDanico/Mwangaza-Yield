"""Tests for the CBR history parser. Run with: python test_cbr_history.py

No pytest dependency — this runs anywhere the scrapers run. The fixture mirrors
the real markup CBK serves at /press/, including the two quirks the live probe
found: the same MPC decision appears in two separate tables, and the listing
mixes rate decisions with unrelated press releases.
"""
import sys

from cbr_history_parser import annotate_moves, extract_decisions, parse_date

# Abridged from the live page: an "all press releases" table and an "MPC only"
# table, both present in the served HTML, overlapping in content.
FIXTURE = """
<html><body>
<table id="all-press">
  <tr><th>Date</th><th>Title</th></tr>
  <tr><td>02/10/2008</td><td><a href="/uploads/microfinance.pdf">Official Launch of the Microfinance Act</a></td></tr>
  <tr><td>05/02/2025</td><td><a href="/uploads/mpc-feb-2025.pdf">MPC Lowers CBR to 10.75 percent</a></td></tr>
  <tr><td>09/06/2026</td><td><a href="/uploads/mpc-jun-2026.pdf">MPC Retains CBR at 8.75 percent</a></td></tr>
</table>
<table id="mpc-only">
  <tr><th>Date</th><th>Title</th></tr>
  <tr><td>05/02/2025</td><td><a href="/uploads/mpc-feb-2025.pdf">MPC Lowers CBR to 10.75 percent</a></td></tr>
  <tr><td>08/04/2025</td><td><a href="/uploads/mpc-apr-2025.pdf">Monetary Policy Committee Meeting - Central Bank Rate (CBR) at 10.00 percent</a></td></tr>
  <tr><td>03/12/2011</td><td><a href="/uploads/mpc-dec-2011.pdf">MPC Raises CBR to 18.00 percent</a></td></tr>
</table>
</body></html>
"""

failures = []


def check(label: str, actual, expected) -> None:
    if actual != expected:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")
    else:
        print(f"  ok  {label}")


def main() -> None:
    print("parse_date")
    # CBK prints dd/mm/yyyy — 24/02 is unambiguous proof it is not mm/dd.
    check("dd/mm/yyyy is read day-first", parse_date("24/02/2009"), "2009-02-24")
    check("a title is not a date", parse_date("MPC Retains CBR at 8.75"), None)
    check("an impossible date is rejected", parse_date("32/01/2020"), None)

    print("extract_decisions")
    rows = extract_decisions(FIXTURE)
    check("non-rate press releases are ignored", len(rows), 4)
    check("results are date-ordered", [r["date"] for r in rows],
          ["2011-12-03", "2025-02-05", "2025-04-08", "2026-06-09"])
    check("the duplicated Feb 2025 row appears once",
          sum(1 for r in rows if r["date"] == "2025-02-05"), 1)
    check("'CBR to' is read", rows[1]["rate"], 10.75)
    check("'(CBR) at' is read", rows[2]["rate"], 10.0)
    check("the press release link is kept",
          rows[3]["url"].endswith("/uploads/mpc-jun-2026.pdf"), True)

    print("annotate_moves")
    moves = annotate_moves(rows)
    check("the first decision has no prior to compare", moves[0]["move"], "start")
    check("a fall is a cut", moves[1]["move"], "cut")
    # 18.00 -> 10.75 is 725 basis points. Computed, never parsed from the verb.
    check("the change is measured in basis points", moves[1]["changeBps"], -725)
    check("a rise is a hike", annotate_moves([
        {"date": "a", "rate": 9.0}, {"date": "b", "rate": 9.5}])[1]["move"], "hike")
    check("an unchanged rate is a hold", annotate_moves([
        {"date": "a", "rate": 8.75}, {"date": "b", "rate": 8.75}])[1]["move"], "hold")

    print("reconcile_macro")
    import json as _json
    import tempfile
    from pathlib import Path

    import cbr_history_parser as mod

    original = mod.DATA_DIR
    with tempfile.TemporaryDirectory() as tmp:
        mod.DATA_DIR = Path(tmp)
        macro = Path(tmp) / "macro.json"
        macro.write_text(_json.dumps([
            {"id": "cbr-2026-07-25", "indicator": "CBR", "value": 8.75, "date": "2026-07-25",
             "unit": "%", "source": "CBK"},
            {"id": "cpi-2026-07", "indicator": "CPI", "value": 6.4, "date": "2026-06-30",
             "unit": "% y/y", "source": "KNBS"},
        ]))
        mod.reconcile_macro({"date": "2026-06-09", "rate": 8.75})
        out = _json.loads(macro.read_text())
        check("the CBR record carries the decision date, not the scrape date",
              out[0]["date"], "2026-06-09")
        check("its id follows the corrected date", out[0]["id"], "cbr-2026-06-09")
        check("other indicators are untouched", out[1]["date"], "2026-06-30")

        # A missing or unreadable macro.json must not cost us the history.
        mod.DATA_DIR = Path(tmp) / "nope"
        mod.reconcile_macro({"date": "2026-06-09", "rate": 8.75})
        print("  ok  a missing macro.json fails soft")
    mod.DATA_DIR = original

    print("guards")
    # A rate outside Kenya's historical band means we misread the row.
    check("an implausible rate is dropped", extract_decisions(
        '<table><tr><td>01/01/2020</td><td>Report on CBR at 250.00 pages</td></tr></table>'), [])

    print("publisher filenames")
    # CBK NAMED THE 9 JUNE 2026 RELEASE "...Meeting of June 9 2025.pdf".
    #
    # A 2026 decision citing a 2025 filename reads like a scraping bug. It is
    # not: the day is right for 2026 (the 2025 MPC met on the 10th), the upload
    # prefix differs from the June 2025 release's, and the rate recorded is the
    # 8.75 hold rather than 2025's 9.75. It is the publisher's typo, and their
    # URL is the only one that resolves.
    #
    # This is the guard against somebody "correcting" the year to agree with
    # the date column, which would turn a working citation into a 404. It tests
    # BEHAVIOUR — the href is taken verbatim — rather than pinning the exact
    # string, so CBK renaming the file tomorrow does not fail the build.
    mismatched = extract_decisions(
        '<table><tr><td>09/06/2026</td>'
        '<td><a href="/uploads/mpc_press_release/897442093_MPC Press Release '
        '- Meeting of June 9 2025.pdf">The Committee retains the CBR at 8.75 pc</a></td>'
        '</tr></table>'
    )
    check("a decision with a contradictory filename is still captured", len(mismatched), 1)
    check("the publisher's filename is kept verbatim, year mismatch and all",
          mismatched[0]["url"].endswith("Meeting of June 9 2025.pdf"), True)
    check("the record's own date comes from the date column, not the filename",
          mismatched[0]["date"], "2026-06-09")

    if failures:
        print(f"\n{len(failures)} FAILURE(S):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll CBR history parser tests passed.")


if __name__ == "__main__":
    main()
