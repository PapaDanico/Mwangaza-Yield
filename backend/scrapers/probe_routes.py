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
import sys

from macro_parser import fetch_text
from sources import (
    resolve, FX_ROUTES, FX_BAND, CBR_ROUTES, CBR_BAND, CPI_ROUTES, CPI_BAND,
)

INDICATORS = (
    ("FX_USD_KES", FX_ROUTES, FX_BAND),
    ("CBR", CBR_ROUTES, CBR_BAND),
    ("CPI", CPI_ROUTES, CPI_BAND),
)


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

    for name, routes, band in INDICATORS:
        print(f"{name}  (plausible range {band[0]}-{band[1]})")
        if not routes:
            print("    NO ROUTES DECLARED")
            broken.append(name)
            print()
            continue
        res = resolve(name, routes, fetch, *band)
        for i, a in enumerate(res.attempts):
            mark = "OK  " if a.ok else "FAIL"
            rank = "preferred" if i == 0 else f"fallback {i}"
            print(f"    {mark} [{rank}] {a.route}")
            print(f"         {a.url}")
            print(f"         {a.reason}" + (f"  (value {a.value})" if a.value is not None else ""))
        untried = len(routes) - len(res.attempts)
        if untried > 0:
            print(f"    -- {untried} later route(s) not tried, the above answered")

        if not res.ok:
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
    if broken:
        print("\nA broken indicator means macro.json will carry the previous value")
        print("forward. That is now visible in the data as `attemptFailed`, and")
        print("healthcheck.py raises it — but the fix is a route, not a wait.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
