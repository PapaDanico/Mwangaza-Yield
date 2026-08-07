"""The prospectus parser, which nothing tested and my own audit called covered.

HOW IT STAYED UNCOVERED

test_calendar_parser.py MENTIONS cbk_parser.py — twice, in comments, including
one that says a stale cbk_parser is "what let it go stale without anything
failing". It never imports it. A text search for the module name therefore
reports it as tested, which is exactly what my audit's coverage survey did, and
so a module with no test was recorded as having one.

That is the reason test_ci_runs_every_test.py now checks for an IMPORT rather
than a filename or a mention. This file exists because that check fired.

WHAT IS WORTH TESTING HERE

parse_date is the whole risk surface that can be tested without a PDF. CBK
writes dates four ways across its prospectuses, and the module's own docstring
says these PDFs "reformat without notice". A date parser that silently accepts
the wrong format does not throw — it returns a plausible date in the wrong
month, and every downstream figure (settlement, accrued interest, the coupon
calendar) moves with it.

The ambiguous case is the one that matters: "01 02 2026" is 1 February under
%d %m %Y and would be 2 January under a US-ordered format. Kenya writes
day-first. Nothing enforced that until now.
"""
import sys

from cbk_parser import AMOUNT_RE, COUPON_RE, ISSUE_RE, parse_date

failures: list = []


def check(cond, msg):
    if not cond:
        failures.append(msg)


def test_parse_date_accepts_what_cbk_writes():
    # The four shapes DATE_PATTERNS can hand it: full month, abbreviated
    # month, numeric, and any of those slash-separated.
    cases = [
        ("15 February 2026", "2026-02-15"),
        ("15 Feb 2026", "2026-02-15"),
        ("15/February/2026", "2026-02-15"),
        ("15/02/2026", "2026-02-15"),
        ("1 March 2026", "2026-03-01"),
    ]
    for raw, expected in cases:
        try:
            got = parse_date(raw)
        except ValueError as exc:
            failures.append(f"parse_date({raw!r}) raised {exc}")
            continue
        check(got == expected, f"parse_date({raw!r}) = {got}, expected {expected}")


def test_the_ambiguous_date_is_read_DAY_FIRST():
    """01 02 2026 is 1 February, not 2 January.

    This is the one that cannot announce itself. A month/day misreading throws
    no error and returns a real date — it just moves settlement, accrued
    interest and the whole coupon calendar by up to eleven months. Kenya writes
    day-first and so does CBK.
    """
    got = parse_date("01 02 2026")
    check(got == "2026-02-01",
          f"parse_date('01 02 2026') = {got} — a day/month swap, which throws "
          f"no error and moves every date derived from it")


def test_parse_date_refuses_rather_than_guesses():
    # An unparseable date must raise. Returning today, or None, would put a
    # confident wrong date into auctions.json.
    for bad in ("", "not a date", "2026-02-15", "February 2026", "32 Feb 2026"):
        try:
            got = parse_date(bad)
            failures.append(f"parse_date({bad!r}) returned {got!r} instead of raising")
        except ValueError:
            pass


def test_issue_codes_are_recognised_as_cbk_writes_them():
    for raw, expect in [
        ("FXD1/2026/010", "FXD1/2026/010"),
        ("IFB1/2023/6.5", "IFB1/2023/6.5"),     # fractional tenor must survive
        ("SDB1/2011/030", "SDB1/2011/030"),
        ("FXD 1/2026/010", "FXD 1/2026/010"),   # CBK sometimes spaces the family
    ]:
        m = ISSUE_RE.search(f"the bond {raw} is offered")
        check(m is not None, f"issue code {raw!r} was not recognised at all")
        if m:
            check(m.group(1) == expect, f"{raw!r} matched as {m.group(1)!r}")

    # And it must not invent one out of ordinary prose.
    check(ISSUE_RE.search("no code here, just words and 1/2026/010 alone") is None,
          "ISSUE_RE matched something that is not a bond code")


def test_amount_and_coupon_patterns():
    m = AMOUNT_RE.search("Amount Offered: Kshs. 30,000 Million")
    check(m is not None, "amount not matched")
    if m:
        check(m.group(1) == "30,000" and m.group(2).lower() == "million",
              f"amount parsed as {m.groups()}")

    m = AMOUNT_RE.search("Kshs 50 Billion")
    check(m is not None and m.group(2).lower() == "billion", "billion form not matched")

    m = COUPON_RE.search("Coupon Rate: 13.500%")
    check(m is not None and m.group(1) == "13.500", f"coupon parsed as {m and m.group(1)}")
    # "Interest Rate" is the other wording CBK uses for the same thing.
    m = COUPON_RE.search("Interest Rate : 9.75 %")
    check(m is not None and m.group(1) == "9.75", f"alternate wording parsed as {m and m.group(1)}")


def main() -> int:
    test_parse_date_accepts_what_cbk_writes()
    test_the_ambiguous_date_is_read_DAY_FIRST()
    test_parse_date_refuses_rather_than_guesses()
    test_issue_codes_are_recognised_as_cbk_writes_them()
    test_amount_and_coupon_patterns()

    for f in failures:
        print(f"FAIL: {f}", file=sys.stderr)
    print(f"cbk_parser.py: date forms, the day-first ambiguity, refusal, "
          f"issue codes and amounts — {len(failures)} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
