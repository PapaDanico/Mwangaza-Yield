"""Tests for the ranked-route resolver.

No pytest dependency, matching the other scraper tests. `fetch` is injected, so
every case here runs offline and deterministically — which is the point: the
eighteen-day FX outage happened because the only way to find out whether a
route worked was to wait for 6am and read a log.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from sources import (  # noqa: E402
    Route, resolve, FX_ROUTES, FX_BAND, CBR_ROUTES, CBR_BAND, CPI_ROUTES, CPI_BAND,
)

FAILURES: list = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def fetcher(pages: dict):
    def fetch(url: str) -> str:
        if url not in pages:
            raise ConnectionError(f"unreachable: {url}")
        return pages[url]
    return fetch


A = Route("a", "https://a/", r"USD[\s\S]{0,40}?(\d{2,3}\.\d+)")
B = Route("b", "https://b/", r"USD[\s\S]{0,40}?(\d{2,3}\.\d+)")


def main() -> int:
    # The happy path: first route answers, later ones are not consulted.
    r = resolve("FX", [A, B], fetcher({"https://a/": "USD 129.50", "https://b/": "USD 999.99"}), 50, 500)
    check(r.value == 129.5, f"first route should win, got {r.value}")
    check(r.via == "a", f"via should be 'a', got {r.via}")
    check(len(r.attempts) == 1, "a later route was tried after a success")
    check(not r.used_fallback, "a first-route success is not a fallback")

    # THE CASE THAT COST EIGHTEEN DAYS: the preferred page stops matching.
    # Under the old design that was silence; here the second route answers.
    r = resolve("FX", [A, B], fetcher({"https://a/": "nothing here", "https://b/": "USD 130.25"}), 50, 500)
    check(r.value == 130.25, f"fallback should answer, got {r.value}")
    check(r.via == "b", f"via should be 'b', got {r.via}")
    check(r.used_fallback, "a fallback answer must be flagged as one")
    check(r.attempts[0].reason.startswith("no match"), f"unhelpful reason: {r.attempts[0].reason}")

    # An unreachable preferred source is a different failure from a changed
    # one, and the log must say which.
    r = resolve("FX", [A, B], fetcher({"https://b/": "USD 130.25"}), 50, 500)
    check(r.ok, "an unreachable first route must not sink the resolution")
    check("fetch failed" in r.attempts[0].reason, f"wrong reason: {r.attempts[0].reason}")

    # Every route fails: no value, and every attempt recorded.
    r = resolve("FX", [A, B], fetcher({"https://a/": "x", "https://b/": "y"}), 50, 500)
    check(not r.ok, "resolution should have failed")
    check(len(r.attempts) == 2, f"expected 2 attempts, got {len(r.attempts)}")
    check(not r.used_fallback, "a total failure is not a fallback")

    # THE PLAUSIBILITY BAND. A match that is not the quantity must be rejected,
    # not published. `USD ... 2026.0` is what a redesigned page can produce.
    r = resolve("FX", [A, B], fetcher({"https://a/": "USD 20.26", "https://b/": "USD 129.50"}), 50, 500)
    check(r.value == 129.5, f"an out-of-band match was accepted: {r.value}")
    check("outside plausible" in r.attempts[0].reason, f"wrong reason: {r.attempts[0].reason}")
    check(r.attempts[0].value == 20.26, "the rejected value should be recorded for debugging")

    # A wrong-but-in-band value is NOT caught, and pretending otherwise would
    # be the vacuous version of this test. Asserted so the limit is explicit.
    r = resolve("FX", [A], fetcher({"https://a/": "USD 111.11"}), 50, 500)
    check(r.value == 111.11, "band checks bounds, not truth — this is by design")

    # A match that is not a number at all.
    odd = Route("odd", "https://o/", r"USD\s+(\S+)")
    r = resolve("FX", [odd], fetcher({"https://o/": "USD n/a"}), 50, 500)
    check(not r.ok, "a non-numeric match must not resolve")
    check("not a number" in r.attempts[0].reason, f"wrong reason: {r.attempts[0].reason}")

    # An empty body is its own reason, distinct from a non-matching one.
    r = resolve("FX", [A], fetcher({"https://a/": ""}), 50, 500)
    check("empty response" in r.attempts[0].reason, f"wrong reason: {r.attempts[0].reason}")

    # No routes at all resolves to nothing rather than throwing.
    r = resolve("FX", [], fetcher({}), 50, 500)
    check(not r.ok and r.attempts == [], "empty route list should be inert")

    # ---- the declared routes, against realistic page text ----

    fx_page = "Key Rates USD 129.4100 Central Bank Rate 8.75 %"
    r = resolve("FX_USD_KES", FX_ROUTES,
                fetcher({FX_ROUTES[0].url: fx_page}), *FX_BAND)
    check(r.ok and 100 < r.value < 200, f"declared FX route failed on realistic text: {r.value}")
    check(r.via == "cbk-home", f"expected the measured route to answer, got {r.via}")

    # ---- THE ROUTE THAT RETURNED A HISTORICAL RATE STAYS OUT ----
    #
    # cbk-forex-page was ranked first on the reasonable assumption that a page
    # existing to publish this figure is the better source, and its own comment
    # admitted the assumption was untested. The live probe tested it:
    #
    #     cbk-forex-page -> 85.1625   (roughly the 2015 rate)
    #     cbk-home       -> 129.41    (right)
    #
    # Because the preferred route ANSWERED, the working one was never
    # consulted. Re-adding it without fixing the pattern would restore a broken
    # source outranking a sound one, so this fails if it comes back.
    names = [route.name for route in FX_ROUTES]
    check("cbk-forex-page" not in names,
          "cbk-forex-page is back in FX_ROUTES — it returned 85.1625 against a "
          "real rate of 129.41; fix the pattern before re-adding it")
    check(names[0] == "cbk-home",
          f"the measured route must rank first, got {names}")
    check(len(names) == len(set(names)), f"duplicate FX route names: {names}")

    r = resolve("CBR", CBR_ROUTES,
                fetcher({CBR_ROUTES[0].url: "Central Bank Rate (CBR) 8.75%"}), *CBR_BAND)
    check(r.value == 8.75, f"declared CBR route failed: {r.value}")

    r = resolve("CPI", CPI_ROUTES,
                fetcher({CPI_ROUTES[1].url: "Overall Inflation 6.49%"}), *CPI_BAND)
    check(r.value == 6.49 and r.via == "cbk-home", f"CPI fallback failed: {r.value} via {r.via}")
    check(r.used_fallback, "KNBS is the preferred CPI route; CBK is the fallback")

    # A year must not be mistaken for a rate on any declared band.
    r = resolve("CBR", CBR_ROUTES,
                fetcher({CBR_ROUTES[0].url: "Central Bank Rate archive 2026%"}), *CBR_BAND)
    check(not r.ok, "a year was accepted as a policy rate")

    if FAILURES:
        print(f"\n{len(FAILURES)} source-resolver test(s) FAILED:", file=sys.stderr)
        for f in FAILURES:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print("\nAll source-resolver tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
