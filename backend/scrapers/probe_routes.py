"""Run the REAL resolver against the REAL pages and report every attempt.

WHY THIS IS NOT ALREADY COVERED

`validate.py` asks whether a source is reachable and whether one marker string
appears in the body. Both were green for CBK throughout the seventeen days
USD/KES was frozen, and both would be green again tomorrow if the FX pattern
stopped matching, because the marker it looks for is "Central Bank Rate" —
a different indicator on the same page.

So the validator validated everything about that page except the part the
pipeline actually depends on. `test_sources.py` covers the resolver's logic
exhaustively, but against injected fixtures: it proves the machinery is right,
and cannot prove the patterns still fit a page CBK may have redesigned. Between
them they left one uncovered question, and it happened to be the only one that
mattered:

    does this regex still match this page, today?

The only thing that ever answered it was the 03:00 scrape, which answers it
into a log at 03:00. That is a bad time and a bad place to find out.

WHAT THIS DOES

Calls `resolve()` — the same function `macro_parser` calls, with the same
declared routes and the same plausibility bands — and prints every attempt:
which route, which URL, matched or not, why not, and what value came back. A
fallback answering is reported as loudly as a total failure, because a figure
arriving by the second route means the first one has broken and the value looks
fine regardless.

Exit code is 0 even when everything fails. This is a diagnostic, not a gate;
`healthcheck.py` is the gate. A probe that can fail the build is a probe people
stop dispatching.
"""
import re
import sys

from macro_parser import fetch_text, implausible_move, read_existing
from sources import (
    resolve, FX_ROUTES, FX_BAND, CBR_ROUTES, CBR_BAND, CPI_ROUTES, CPI_BAND,
)

INDICATORS = (
    ("FX_USD_KES", FX_ROUTES, FX_BAND),
    ("CBR", CBR_ROUTES, CBR_BAND),
    ("CPI", CPI_ROUTES, CPI_BAND),
)


CONTEXT_CHARS = 220


def match_context(route, text: str) -> list:
    """The page text surrounding a route's match, wrapped for a CI log.

    Returns a short list of lines, or a single line saying why there is
    nothing to show. Never raises: this runs inside a diagnostic, and a probe
    that dies while explaining a failure is worse than one that says little.
    """
    if not text:
        return ["(no page text)"]
    try:
        m = re.search(route.pattern, text, route.flags)
    except re.error as exc:
        return [f"(pattern itself is invalid: {exc})"]
    if not m:
        return ["(no match to show)"]
    start = max(0, m.start() - CONTEXT_CHARS // 2)
    end = min(len(text), m.end() + CONTEXT_CHARS // 2)
    # Collapse runs of whitespace: the page arrives via get_text(" ") and is
    # mostly padding, which would push the interesting part off the line.
    snippet = " ".join(text[start:end].split())
    return [snippet[i:i + 100] for i in range(0, len(snippet), 100)]


def main() -> int:
    # Pages are shared across indicators exactly as macro_parser shares them,
    # so this probe puts the same load on CBK that a real run does — and
    # exercises the caching rather than a different code path.
    cache: dict[str, str] = {}

    def fetch(url: str) -> str:
        if url not in cache:
            try:
                cache[url] = fetch_text(url)
            except Exception as exc:  # noqa: BLE001 — a probe reports, never raises
                print(f"    fetch raised {type(exc).__name__}: {str(exc)[:160]}")
                cache[url] = ""
        return cache[url]

    print("=== LIVE ROUTE PROBE ===")
    print("Exercises the declared routes against the live pages. Reports only.\n")

    healthy, degraded, broken = [], [], []
    suspects, disagreeing = [], []
    existing = read_existing()

    for name, routes, band in INDICATORS:
        held = next((r.get("value") for r in existing
                     if isinstance(r, dict) and r.get("indicator") == name), None)
        print(f"{name}  (plausible range {band[0]}-{band[1]}"
              + (f", currently holding {held})" if held is not None else ")"))
        if not routes:
            print("    NO ROUTES DECLARED")
            broken.append(name)
            print()
            continue

        # EVERY route is tried, not just up to the first success.
        #
        # The ranked resolver stops as soon as one answers, which is right for
        # the pipeline and wrong for a diagnostic. On 2026-08-07 the preferred
        # FX route answered 85.1625 — a historical rate, ~34% below the real
        # one — and because it answered, the fallback was never consulted and
        # this probe printed a confident "OK". Trying them all turns two routes
        # into a cross-check: if they disagree, at least one is wrong, and that
        # is knowable here without knowing which.
        values = {}
        for i, route in enumerate(routes):
            one = resolve(name, [route], fetch, *band)
            a = one.attempts[0] if one.attempts else None
            mark = "OK  " if one.ok else "FAIL"
            rank = "preferred" if i == 0 else f"fallback {i}"
            print(f"    {mark} [{rank}] {route.name}")
            print(f"         {route.url}")
            if a is not None:
                print(f"         {a.reason}"
                      + (f"  (value {a.value})" if a.value is not None else ""))
            if one.ok:
                values[route.name] = one.value
                suspect = implausible_move(name, one.value, existing)
                if suspect:
                    print(f"         SUSPECT: {suspect}")
                    suspects.append(f"{name} via {route.name} -> {one.value}")
                    # WHAT DID IT ACTUALLY MATCH?
                    #
                    # Knowing a route returned 85.1625 says it is broken. It
                    # does not say how to fix it, and without that the only
                    # options are to guess at a new pattern or to delete the
                    # route — and guessing at a pattern against a page nobody
                    # has read is exactly how this route came to be ranked
                    # first on an assumption in the first place.
                    #
                    # So print the page text around the match. Whoever repairs
                    # the pattern can then see whether it caught a historical
                    # row, a different currency, or a table header, and anchor
                    # on something that distinguishes them.
                    print(f"         --- what it matched, in context ---")
                    for line in match_context(route, fetch(route.url)):
                        print(f"         | {line}")

        if len(set(values.values())) > 1:
            print(f"    !! ROUTES DISAGREE: {values} — at least one is wrong")
            disagreeing.append(name)

        res = resolve(name, routes, fetch, *band)
        # A value the pipeline would REFUSE must never be summarised as
        # healthy. The first version of this probe reported exactly that — "OK:
        # 85.1625" — and a verdict that contradicts itself two lines later is
        # how a diagnostic gets skimmed and its warning missed.
        if res.ok and implausible_move(name, res.value, existing):
            print(f"    => SUSPECT: {res.value} via '{res.via}' — in band, present, "
                  f"and too far from what we hold to be a real move. "
                  f"macro_parser will refuse this and keep the previous figure.")
        elif not res.ok:
            print(f"    => BROKEN: no route produced a usable {name}")
            broken.append(name)
        elif res.used_fallback:
            print(f"    => DEGRADED: {res.value} via '{res.via}' — the preferred route "
                  f"has broken and the value still looks fine")
            degraded.append(name)
        else:
            print(f"    => OK: {res.value} via '{res.via}'")
            healthy.append(name)
        print()

    print("=== SUMMARY ===")
    print(f"  healthy  : {', '.join(healthy) or '(none)'}")
    print(f"  degraded : {', '.join(degraded) or '(none)'}")
    print(f"  broken   : {', '.join(broken) or '(none)'}")
    print(f"  SUSPECT  : {', '.join(suspects) or '(none)'}")
    print(f"  DISAGREE : {', '.join(disagreeing) or '(none)'}")
    if suspects or disagreeing:
        print("\nA suspect value is the dangerous case: it is present, in band, and")
        print("wrong. macro_parser refuses these (see implausible_move) and carries")
        print("the previous figure forward, so the site stays stale rather than")
        print("becoming wrong -- but the ROUTE still needs fixing.")
    if broken:
        print("\nA broken indicator means macro.json will carry the previous value")
        print("forward. That is now visible in the data as `attemptFailed`, and")
        print("healthcheck.py raises it — but the fix is a route, not a wait.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
