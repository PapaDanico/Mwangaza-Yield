"""The AfDB licence verdict must distinguish "we looked" from "we could not look".

WHY THIS EXISTS

`probe_afdb_coverage.py` decides whether we may republish AfDB-sourced figures.
That makes its verdict the only output here with a legal consequence, and it
has exactly one dangerous failure: reporting a network problem as a fact about
the publisher.

This repo has already made that mistake in the other direction. `fiscal-context`
records PDMO written up as geo-blocked while it answered 200 on three
consecutive runs from a CI runner — a fact about a sandbox, filed as a fact
about a source. A licence check that conflated "unreachable" with "no CC BY
marker found" would make the mirror-image error, and this one ends in either an
unnecessary refusal to use an open dataset, or a republication on the strength
of a page nobody read.

So all three verdicts are asserted, by substituting the fetcher rather than by
hitting the network — the probe itself cannot run from this container, which is
the whole reason the confusion is easy to ship.

THE 404 CASE

A 404 is deliberately NOT treated as "read, and no marker present". A wrong URL
looks exactly like a page that omits the licence, and only one of those is
evidence. It lands in NOT ANSWERED with the rest.
"""
import contextlib
import io
import sys

import probe_afdb_coverage as probe

FAILURES: list = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


class FakeResponse:
    def __init__(self, status_code: int, text: str) -> None:
        self.status_code = status_code
        self.text = text


# Wording taken from what the AfDB portal is reported to say, including the
# attribution format, so a real page would match this shape.
CC_BY_PAGE = (
    "All data and datasets published by the African Development Bank Group on "
    "this Open Data Portal are provided under the Creative Commons Attribution "
    "4.0 International License (CC-BY 4.0). Attribution must be formatted in "
    "the following manner: The African Development Bank: Dataset name: Dataset link"
)

# What the portal actually served when this was last attempted: a shell that
# renders its terms client-side. Reachable, and says nothing.
CLIENT_RENDERED_SHELL = '<html><body><div id="app"></div></body></html>'


def verdict_for(fetcher) -> str:
    """Run the licence check with `fetcher` in place of the network, and return
    its verdict line."""
    original = probe.get
    probe.get = fetcher
    try:
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            probe.licence_pages_check()
    finally:
        probe.get = original
    lines = [l.strip() for l in buffer.getvalue().splitlines() if l.strip().startswith("verdict:")]
    return lines[0] if lines else "NO VERDICT PRINTED"


def main() -> int:
    confirmed = verdict_for(lambda url: (FakeResponse(200, CC_BY_PAGE), None))
    check(
        "CONFIRMED" in confirmed,
        f"a page stating CC BY 4.0 must confirm the licence, got: {confirmed}",
    )

    read_empty = verdict_for(lambda url: (FakeResponse(200, CLIENT_RENDERED_SHELL), None))
    check(
        "UNVERIFIED" in read_empty and "READ" in read_empty,
        f"a page that was read without a marker must say so, got: {read_empty}",
    )
    check(
        "CONFIRMED" not in read_empty,
        "absence of a marker must never read as permission",
    )

    unreachable = verdict_for(lambda url: (None, "ProxyError: 403 Forbidden"))
    check(
        "NOT ANSWERED" in unreachable,
        f"an unreachable page must not be a finding about the publisher, got: {unreachable}",
    )
    check(
        "UNVERIFIED" not in unreachable,
        "an unfetched page must not be reported as a page that lacked a licence — "
        "that is the PDMO error with the sign flipped",
    )

    # A wrong URL is indistinguishable from a page that omits the licence.
    not_found = verdict_for(lambda url: (FakeResponse(404, "not found"), None))
    check(
        "NOT ANSWERED" in not_found,
        f"a 404 is not evidence about the licence, got: {not_found}",
    )

    if FAILURES:
        for failure in FAILURES:
            print(f"FAIL: {failure}")
        return 1
    print("ok  all four licence verdicts distinguish looking from being unable to look")
    return 0


if __name__ == "__main__":
    sys.exit(main())
