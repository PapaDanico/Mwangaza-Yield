"""Getting the latest available figure, from whichever source actually has it.

WHY THE OLD SHAPE KEPT LOSING UPDATES
-------------------------------------
Every scraper here hardcodes ONE url and ONE regex, and when the regex stops
matching it appends nothing. `carry_forward` then preserves the last good
record, the run exits 0, and the dashboard shows a figure that has quietly
stopped moving.

That is not hypothetical. USD/KES — a rate CBK republishes every trading day —
sat unchanged for eighteen days because a single pattern on the CBK home page
stopped matching. Nothing in the pipeline was wrong except that it had no
second thing to try and no way to say which of its assumptions had failed.

This gives each indicator a RANKED LIST of routes instead of one. The first
route that yields a plausible value wins, the rest are not tried, and the
record carries `via` so the data itself says how it was obtained. A layout
change on the preferred page then costs a fallback rather than an outage, and
shows up as a route demotion in the log rather than as silence.

WHY A PLAUSIBILITY BAND, NOT JUST A MATCH
-----------------------------------------
The FX pattern is `(?:USD|US Dollar)[\\s\\S]{0,60}?(\\d{2,3}\\.\\d+)` — sixty
characters of anything, then any two-or-three digit decimal. On a page that has
been redesigned that can match a year, a phone fragment, a percentage from an
adjacent table. A wrong number that looks right is worse than no number: the
stale one is at least dated and carried forward on purpose.

So a route must produce a value inside a declared band or it is rejected and
the next route is tried. The band is a statement about the quantity, not about
the page, so it stays true when the page changes.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from typing import Callable, Iterable


@dataclass(frozen=True)
class Route:
    """One way to obtain one indicator."""

    name: str
    url: str
    pattern: str
    #: re.IGNORECASE etc.
    flags: int = 0
    #: Which capture group holds the number.
    group: int = 1


@dataclass
class Attempt:
    route: str
    url: str
    ok: bool
    reason: str
    value: float | None = None


@dataclass
class Resolution:
    indicator: str
    value: float | None
    via: str | None
    attempts: list[Attempt] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.value is not None

    @property
    def used_fallback(self) -> bool:
        """True when the preferred route failed and a later one answered.

        Worth surfacing on its own: the figure is correct but the primary
        source has broken, and nobody finds out from a value that looks fine.
        """
        if not self.ok or not self.attempts:
            return False
        return self.attempts[0].route != self.via


def resolve(
    indicator: str,
    routes: Iterable[Route],
    fetch: Callable[[str], str],
    low: float,
    high: float,
) -> Resolution:
    """Try each route in order; first plausible value wins.

    `fetch` is injected so this is testable without a network, and so a caller
    can cache a page fetched once across several indicators.
    """
    out = Resolution(indicator=indicator, value=None, via=None)
    for route in routes:
        try:
            text = fetch(route.url)
        except Exception as exc:  # noqa: BLE001 — the failure is the finding
            out.attempts.append(Attempt(route.name, route.url, False,
                                        f"fetch failed: {type(exc).__name__}"))
            continue
        if not text:
            out.attempts.append(Attempt(route.name, route.url, False, "empty response"))
            continue
        m = re.search(route.pattern, text, route.flags)
        if not m:
            out.attempts.append(Attempt(route.name, route.url, False,
                                        f"no match in {len(text)} chars"))
            continue
        try:
            value = float(m.group(route.group).replace(",", ""))
        except (ValueError, IndexError):
            out.attempts.append(Attempt(route.name, route.url, False,
                                        f"matched {m.group(0)[:40]!r} but not a number"))
            continue
        if not (low <= value <= high):
            # The most dangerous outcome: a match that is not the quantity.
            out.attempts.append(Attempt(route.name, route.url, False,
                                        f"{value} outside plausible {low}-{high}", value))
            continue
        out.attempts.append(Attempt(route.name, route.url, True, "ok", value))
        out.value = value
        out.via = route.name
        return out
    return out


def report(res: Resolution, stream=sys.stderr) -> None:
    """Say what happened in terms someone debugging at 6am can act on."""
    if res.ok and not res.used_fallback:
        print(f"[{res.indicator}] {res.value} via {res.via}", file=stream)
        return
    if res.ok:
        print(
            f"[{res.indicator}] {res.value} via FALLBACK {res.via} — "
            f"the preferred route failed and this figure is right, "
            f"but the primary source needs fixing",
            file=stream,
        )
    else:
        print(f"[{res.indicator}] NO VALUE from any of {len(res.attempts)} routes", file=stream)
    for a in res.attempts:
        mark = "ok  " if a.ok else "FAIL"
        print(f"    {mark} {a.route}: {a.reason}  <{a.url}>", file=stream)


# ---------------------------------------------------------------------------
# Declared routes and bands.
#
# Bands are statements about the QUANTITY, chosen wide enough that a real move
# never trips them and narrow enough that a mis-parse does. USD/KES has traded
# between roughly 100 and 165 in the last decade; 50-500 rejects a year, a
# percentage or a page number without ever rejecting a rate.
# ---------------------------------------------------------------------------

CBK_HOME = "https://www.centralbank.go.ke/"

FX_ROUTES = (
    # THE HOME PAGE IS PREFERRED BECAUSE IT IS THE ONE THAT WAS MEASURED.
    #
    # This list used to open with CBK's dedicated forex page, on the reasonable
    # assumption that a page existing to publish exactly this figure is the
    # better source. Its own comment conceded the assumption was untested:
    # "Unverified against the live page at the time of writing."
    #
    # The live probe tested it on 2026-08-07 and both routes answered:
    #
    #     cbk-forex-page  ->  85.1625     wrong
    #     cbk-home        ->  129.41      right
    #
    # 85.16 is roughly where USD/KES sat in 2015, so the forex page's pattern
    # was matching a historical row rather than today's. Nothing we had could
    # tell: the page was reachable, the regex matched, the number parsed, and
    # 85.1625 sits comfortably inside the 50-500 band. Because the preferred
    # route ANSWERED, the working fallback was never consulted — a broken
    # source outranking a sound one, silently, and the value it produced would
    # have been published as the current rate.
    #
    # So the ordering is now evidence rather than inference. The measured route
    # goes first.
    Route("cbk-home", CBK_HOME,
          r"(?:USD|US Dollar)[\s\S]{0,60}?(\d{2,3}\.\d+)", re.I),

    # The forex page is REMOVED rather than demoted.
    #
    # Demoting it would leave a route known to return a wrong-but-plausible
    # number sitting behind a working one, waiting for the day cbk-home fails.
    # `implausible_move` would refuse it on any dataset that already holds a
    # rate — but it compares against the last trusted value, and on a fresh
    # dataset there is no last trusted value, so 85.1625 would publish. A guard
    # that protects every case except the empty one is not the place to put a
    # source we know to be broken.
    #
    # Losing it costs nothing today: a cbk-home failure means staleness, and a
    # bad second route means a refused value, which is also staleness.
    #
    # To restore it, fix the pattern — do not simply re-add the route. Dispatch
    # validate-sources and read probe_routes.py's output: on a suspect match it
    # now prints the surrounding page text, which is the evidence needed to
    # write a pattern that anchors on the current row instead of the first one
    # it finds. That evidence did not exist when this route was written, which
    # is how it came to be ranked first on a guess.
)
FX_BAND = (50.0, 500.0)

CBR_ROUTES = (
    Route("cbk-home", CBK_HOME, r"Central Bank Rate[\s\S]{0,80}?([\d.]+)\s*%", re.I),
)
# The CBR has ranged 7-18% in the last decade. 0-40 rejects a year or a
# shilling figure while never rejecting a policy rate.
CBR_BAND = (0.0, 40.0)

CPI_ROUTES = (
    Route("knbs-home", "https://www.knbs.or.ke/",
          r"(?:inflation|CPI)[\s\S]{0,80}?([\d.]+)\s*%", re.I),
    Route("cbk-home", CBK_HOME,
          r"(?:Inflation Rate|Overall Inflation)[\s\S]{0,80}?([\d.]+)\s*%", re.I),
)
# Kenyan headline inflation has ranged roughly 3-20% since 2005 and hit 46% in
# 1993. 0-60 admits a genuine crisis and rejects a year.
CPI_BAND = (0.0, 60.0)
