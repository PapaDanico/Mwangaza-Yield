"""Tests for the archive integrity checker. Run: python test_check_archive.py

WHY THESE ARE ADVERSARIAL RATHER THAN CONFIRMATORY
--------------------------------------------------
A check that reports OK on today's archive has proved nothing. Today's archive
is the one case we already know the answer to, and every one of these checks
returns an empty list when it is broken as readily as when it works. So each
test here feeds the checker a record set it MUST reject, and a neighbouring set
it must NOT — the second half being the one that actually costs something,
because a check that fires on everything gets switched off within a week.

This is not a hypothetical concern in this repository. Six separate safeguards
have looked present and turned out not to be, including two test fixtures that
passed for reasons they did not claim and survived their own mutants. The
column-shift bug this checker exists to catch was found by a human reading a
row label, not by any of them.
"""
import sys

from check_archive import (
    accepted_within_bids, auction_kind, duplicate_keys, implausible_cover,
    label_kept_its_value, sum_identity,
)

failures = []


def check(label, actual, expected):
    if actual != expected:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")
        print(f"  FAIL {label}: expected {expected!r}, got {actual!r}")
    else:
        print(f"  ok   {label}")


def rec(**kw):
    base = {"issueCode": "FXD1/2020/010", "sourceUrl": "http://x/f.pdf",
            "auctionDate": "2020-01-06"}
    base.update(kw)
    return base


def main() -> None:
    print("sum_identity — one bond holding what the others add to")
    # The published failure, restated with three bonds so the identity survives.
    # A discarded value column shifts every figure by one and leaves the last
    # bond holding the auction total, which IS the sum of the others.
    shifted = [
        rec(issueCode="A", bidsReceivedKESM=20.0),
        rec(issueCode="B", bidsReceivedKESM=30.0),
        rec(issueCode="C", bidsReceivedKESM=50.0),  # 20 + 30
    ]
    check("catches the shifted three-bond auction", len(sum_identity(shifted)), 1)

    # And must not fire on an auction that merely happens to have round numbers.
    clean = [
        rec(issueCode="A", bidsReceivedKESM=20.0),
        rec(issueCode="B", bidsReceivedKESM=30.0),
        rec(issueCode="C", bidsReceivedKESM=45.0),
    ]
    check("stays quiet on three unrelated figures", sum_identity(clean), [])

    # The honest limit, asserted rather than described. Two bonds cannot show
    # this shape: the shift leaves (bond2, total) with bond1 gone entirely, and
    # total-minus-bond2 is a subtraction, not a contradiction. If this test ever
    # starts failing, the docstring in check_archive is the thing to fix.
    two_bond = [
        rec(issueCode="A", bidsReceivedKESM=32916.78),
        rec(issueCode="B", bidsReceivedKESM=64248.41),
    ]
    check("is honest that two bonds are invisible to it", sum_identity(two_bond), [])

    # The three-bond floor is not just an honest limit, it is load-bearing, and
    # a mutation test is what showed the difference. `amountOfferedKESM` holds
    # the WHOLE AUCTION's offer repeated on every row, so a two-bond auction
    # reads 50,000 and 50,000 — and "one figure equals the sum of the others"
    # is trivially true of any pair of equal numbers. Drop the floor to two and
    # every ordinary two-bond auction in the archive is reported as a column
    # shift. The first version of this file asserted the floor with a fixture
    # that could not have failed either way.
    repeated_offer = [
        rec(issueCode="A", amountOfferedKESM=50000.0),
        rec(issueCode="B", amountOfferedKESM=50000.0),
    ]
    check("does not read a repeated auction-level offer as a shift",
          sum_identity(repeated_offer), [])

    # Different files are different auctions. A cross-file coincidence is not a
    # column shift, and grouping by anything coarser would invent one.
    across = [
        rec(issueCode="A", sourceUrl="http://x/1.pdf", bidsReceivedKESM=20.0),
        rec(issueCode="B", sourceUrl="http://x/2.pdf", bidsReceivedKESM=30.0),
        rec(issueCode="C", sourceUrl="http://x/3.pdf", bidsReceivedKESM=50.0),
    ]
    check("does not add up figures from different files", sum_identity(across), [])

    print("\naccepted_within_bids — you cannot accept more than was bid")
    check("catches acceptance above bids",
          len(accepted_within_bids([rec(amountAcceptedKESM=500.0, bidsReceivedKESM=400.0)])), 1)
    check("allows acceptance equal to bids",
          accepted_within_bids([rec(amountAcceptedKESM=400.0, bidsReceivedKESM=400.0)]), [])
    # A tap sale may report bids at FACE VALUE and acceptance at cost. On a
    # discount bond those are a percent or two apart with neither being wrong,
    # and bidsLabel is what says so.
    check("stays quiet when the two figures are on different bases",
          accepted_within_bids([rec(amountAcceptedKESM=404.0, bidsReceivedKESM=400.0,
                                    bidsLabel="total bids received at face value (kes million)")]), [])

    print("\nlabel_kept_its_value — the accident that revealed the bug")
    check("catches a figure left inside a row label",
          len(label_kept_its_value([rec(bidsLabel="total bids received (kshs. m) 31,331.63")])), 1)
    check("stays quiet on a clean label",
          label_kept_its_value([rec(bidsLabel="total bids received (kshs. m)")]), [])

    print("\nduplicate_keys — (issue code, value date) is the dedup key")
    check("catches the same bond twice on one date",
          len(duplicate_keys([rec(), rec()])), 1)
    check("allows one bond across two dates",
          duplicate_keys([rec(), rec(auctionDate="2020-02-03")]), [])

    print("\nimplausible_cover — arithmetic on a misread column")
    check("catches a cover far below the band",
          len(implausible_cover([rec(amountOfferedKESM=16000.0, bidsReceivedKESM=7.64)])), 1)
    check("allows an ordinary oversubscription",
          implausible_cover([rec(amountOfferedKESM=50000.0, bidsReceivedKESM=133792.51)]), [])
    # The false alarm this check shipped with. A tap sale is a top-up measured
    # against its PARENT auction's offer, so 487.50 against 20,000 is 0.024x and
    # entirely correct. Excluding it is the difference between a check that gets
    # read and one that gets ignored.
    check("does not compute a cover ratio for a tap sale",
          implausible_cover([rec(sourceUrl="http://x/452999614_July 2024 TAP SALE FXD1-2023-002.pdf",
                                 amountOfferedKESM=20000.0, bidsReceivedKESM=487.5)]), [])
    check("nor for a switch, which raises no cash at all",
          implausible_cover([rec(sourceUrl="http://x/SWITCH RESULTS FXD1-2018-015.pdf",
                                 amountOfferedKESM=20000.0, bidsReceivedKESM=487.5)]), [])

    print("\nauction_kind — the spellings that have already cost this project")
    # `_` is a word character, so `\bTAP\b` never fires here. That is the exact
    # fault that shipped once.
    check("reads TAP after an underscore", auction_kind("http://x/838376338_TAP SALE.pdf"), "tap")
    # And CBK writes it as one word about as often as two: seven files, ten
    # records, every one of them missed by the fix for the first spelling.
    check("reads TAPSALE as one word", auction_kind("http://x/TAPSALE RESULTS.pdf"), "tap")
    check("reads a percent-encoded name", auction_kind("http://x/TAP%20SALE%20RESULTS.pdf"), "tap")
    check("reads SWITCH", auction_kind("http://x/SWITCH RESULTS FXD1-2018-015.pdf"), "switch")
    # And must not swallow a longer word that merely begins with those letters.
    check("does not read TAPPED as a tap sale", auction_kind("http://x/TAPPED OUT.pdf"), "primary")
    check("an ordinary auction is primary", auction_kind("http://x/FXD1-2010-10.pdf"), "primary")
    check("a missing url is primary, not a crash", auction_kind(None), "primary")

    if failures:
        print(f"\n{len(failures)} FAILURE(S):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll archive integrity tests passed.")


if __name__ == "__main__":
    main()
