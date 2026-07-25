"""Tests for the sovereign-context scraper. Run: python test_worldbank.py

Guards the class of defect found by auditing the TypeScript types against the
shipped data: a field the UI renders that the pipeline never writes.

`note` and `sentiment` were both declared on ContextIndicator and both consumed
by SovereignContext — the note as the entire body of its expandable panel —
while this scraper produced neither. Every panel opened onto nothing but a
citation, and every status dot silently fell back to neutral.

No type could have caught it. The JSON is read at runtime and cast, so the
compiler believes whatever the interface claims. Only the producer can be held
to it, which is what this file does.
"""
import sys

import worldbank as wb

failures = []


def check(label, actual, expected):
    if actual != expected:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")
    else:
        print(f"  ok  {label}")


def main():
    print("every indicator carries what the dashboard renders")
    for code, label, unit, note, rule in wb.INDICATORS:
        check(f"{label} has a note", bool(note and note.strip()), True)
        check(f"{label} note is a real explanation, not a stub", len(note) > 40, True)
        check(f"{label} rule is None or (threshold, direction)",
              rule is None or (isinstance(rule, tuple) and len(rule) == 2 and
                               rule[1] in ("higher", "lower")), True)

    print("\ndebt is actually collected — the sources page has always claimed it")
    labels = [i[1] for i in wb.INDICATORS]
    for wanted in ("Government debt / GDP", "Interest / government revenue",
                   "External debt / GNI", "Debt service / exports"):
        check(f"collects {wanted}", wanted in labels, True)

    print("\nsentiment_for")
    check("below a 'lower' threshold is good", wb.sentiment_for(22, (30.0, "lower")), "good")
    check("above a 'lower' threshold is caution", wb.sentiment_for(41, (30.0, "lower")), "caution")
    check("above a 'higher' threshold is good", wb.sentiment_for(4.03, (4.0, "higher")), "good")
    check("below a 'higher' threshold is caution", wb.sentiment_for(2.8, (4.0, "higher")), "caution")
    check("exactly on the threshold is good", wb.sentiment_for(30.0, (30.0, "lower")), "good")
    # Most of these figures have no line either side of which a country is fine
    # or in trouble. Neutral is the honest answer, not a guess dressed as one.
    check("no rule means no verdict", wb.sentiment_for(15.76, None), "watch")

    print("\nthe emitted record carries every field the UI reads")
    wb.latest_value = lambda code: {"value": 12.3456, "year": "2025"}
    records = wb.scrape()
    check("one record per indicator", len(records), len(wb.INDICATORS))
    required = ("id", "label", "value", "unit", "asOf", "source", "sourceUrl", "note", "sentiment")
    for rec in records:
        for field in required:
            check(f"{rec['label']} has {field}", field in rec and rec[field] not in (None, ""), True)
        check(f"{rec['label']} value is rounded", rec["value"], 12.35)

    if failures:
        print(f"\n{len(failures)} FAILURE(S):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll sovereign-context scraper tests passed.")


if __name__ == "__main__":
    main()
