"""Pull Kenya sovereign-health indicators from the World Bank Open Data API.

Why this source, when most of the others on the list are unusable:
  * No API key — so it can run in CI without secrets, and could even be called
    from the browser if we ever wanted live refresh.
  * Documented, stable, versioned REST/JSON (v2).
  * CC BY 4.0 licensed, so we may redistribute with attribution. Most Kenyan
    market data is either licensed (exchange feeds) or copyrighted research
    (broker notes). We take neither.

The indicators chosen are the ones that tell a BOND investor whether the
borrower is good for the money — not general development statistics.
"""
import sys
import time
from datetime import date

import requests

from common import write_dataset

BASE = "https://api.worldbank.org/v2/country/KE/indicator"

# (World Bank indicator code, human label, unit, sentiment thresholds)
# `good_below` means lower is healthier; None means context-only.
INDICATORS = [
    # (World Bank code, label, unit, note, sentiment rule)
    #
    # The note is not decoration. SovereignContext renders it as the whole
    # content of each expandable panel — the "plain-language note on what it
    # means for a lender" its docstring promises — and because the scraper
    # never wrote one, every panel opened empty. A number with no explanation
    # is exactly what this app exists not to serve.
    #
    # The sentiment rule is (threshold, direction): "good" when the value is
    # below the threshold for "lower", above it for "higher". None means the
    # figure is context, not a verdict.
    ("NY.GDP.MKTP.KD.ZG", "GDP growth", "% y/y",
     "Whether the economy behind the borrowing is still expanding. Growth is what "
     "eventually pays debt down without new borrowing.",
     (5.0, "higher")),
    ("FI.RES.TOTL.MO", "Reserves (import cover)", "months",
     "Months of imports the central bank could fund from its reserves. Below three "
     "is generally considered thin, and the statutory floor is four.",
     (4.0, "higher")),
    ("NE.EXP.GNFS.ZS", "Exports / GDP", "%",
     "How much foreign currency the economy actually earns. External debt is repaid "
     "in dollars, and exports are where they come from.",
     None),
    ("BN.CAB.XOKA.GD.ZS", "Current account / GDP", "%",
     "Negative means the country spends more abroad than it earns there and must "
     "borrow the difference. Persistent deficits pressure the shilling.",
     (-5.0, "higher")),

    # What it owes. A government bond is a loan to this borrower, so its debt
    # burden is not background colour — it is the credit risk being taken, and
    # the reason yields sit where they do. The sources page has always told
    # readers we use debt data; until now we collected none.
    ("GC.DOD.TOTL.GD.ZS", "Government debt / GDP", "%",
     "What the state owes against everything the country produces in a year. "
     "Rising debt does not itself cause default, but it narrows the room to absorb "
     "a shock.",
     (55.0, "lower")),
    ("GC.XPN.INTP.RV.ZS", "Interest / government revenue", "%",
     "The share of every shilling collected in tax already committed to interest "
     "before a single service is funded. This is the measure that tightens first, "
     "and it deteriorates long before anything is missed.",
     (30.0, "lower")),
    ("DT.DOD.DECT.GN.ZS", "External debt / GNI", "%",
     "Debt owed abroad, which must be serviced in foreign currency rather than "
     "shillings — so a weaker shilling makes it heavier without anyone borrowing "
     "more.",
     (50.0, "lower")),
    ("DT.TDS.DECT.EX.ZS", "Debt service / exports", "%",
     "What repayment costs measured against what the country earns abroad, which "
     "is the source of the currency it is repaid in.",
     (25.0, "lower")),
]

TIMEOUT = 60

# Identify ourselves rather than arriving as "python-requests/2.x".
#
# On 2026-08-04 the validate-sources probe recorded every World Bank call
# returning HTTP 400 with a 1,647-byte text/html body. The v2 API answers real
# errors in JSON; an HTML 400 is a front door refusing the request, and the
# commonest reason a front door refuses one is a default client user-agent.
#
# This is a hypothesis, not a diagnosis — it cannot be tested from the machine
# this was written on, where api.worldbank.org is unreachable through the
# outbound proxy. It costs nothing if it is wrong, it is good manners to a free
# public API either way, and the completeness guard below is what actually
# stops a refusal from reaching readers.
USER_AGENT = (
    "MwangazaYield/1.0 (+https://mwangazayield.org; sovereign context refresh)"
)

# How many of the eight indicators must survive a run for it to count.
#
# WHY A FLOOR AT ALL
#
# `write_dataset` refuses only a COMPLETELY empty result. Anything else is a
# success, so a run that lost seven of eight indicators wrote the survivor,
# exited 0, and told the workflow nothing was wrong.
#
# That is not hypothetical. It is the shipped state as this is written:
# public/data/context.json holds ONE record — External debt / GNI, vintage 2024
# — against eight defined here. The Sovereign Context panel promises a credit
# picture and has been showing an eighth of one. Nothing alarmed, because
# staleness was the only thing anyone was measuring, and the survivor was
# keeping the file's date alive.
#
# Six of eight, not eight: the World Bank genuinely lacks some series for some
# countries in some years, and a scraper that demands perfection raises an
# alarm nobody can clear — the wolf-crying this project widened the
# context.json budget to avoid. Six leaves room for two real gaps and still
# catches a collapse.
MIN_INDICATORS = 6


# How the observations are asked for, most convenient first.
#
# `mrnev=1` ("most recent non-empty value") is one round trip and exactly the
# question being asked, so it stays first. The plain date window is the same
# question the long way round: ask for a span of years and take the newest
# non-null from the reply, which is what the loop below already does.
#
# WHY THERE IS A SECOND SHAPE AT ALL
#
# On 2026-08-04 seven of the eight indicators came back 400 Bad Request while
# GC.DOD.TOTL.GD.ZS returned a perfectly good 200 with no observation in it.
# That asymmetry is the whole clue. A blocked client is blocked for every
# indicator; a rejected QUERY is rejected wherever the API dislikes it, and one
# indicator answering proves the host, the network and the credentials are all
# fine. Adding a user-agent on the previous attempt changed nothing, which
# eliminated the other candidate.
#
# So `mrnev` is the suspect — retired, narrowed, or newly refused for series
# whose most recent non-empty value is far enough back. It cannot be confirmed
# from the machine this was written on, where api.worldbank.org is unreachable
# through the outbound proxy.
#
# This is deliberately NOT a bet on that diagnosis. Both shapes are tried, so
# the scraper recovers if `mrnev` is the problem and is no worse off if it is
# not: the fallback costs one extra request per indicator, only on failure,
# only until the first shape works again.
QUERY_SHAPES = (
    {"format": "json", "per_page": 20, "mrnev": 1},
    # Twelve years is enough to reach the newest vintage of an annual series
    # that lags its reference year, without asking for the entire history.
    {"format": "json", "per_page": 100, "date": f"{date.today().year - 12}:{date.today().year}"},
)


def latest_value(indicator_code: str) -> dict | None:
    """Most recent non-null observation for Kenya, with its year.

    Tries each query shape in turn and gives up only when the API has refused
    all of them. A connection-level failure is NOT retried here — a second
    identical request to a host that would not talk to us buys nothing and
    doubles the time a broken run takes to say so.
    """
    last_http_error: requests.HTTPError | None = None

    for params in QUERY_SHAPES:
        try:
            resp = requests.get(
                f"{BASE}/{indicator_code}",
                params=params,
                headers={"User-Agent": USER_AGENT},
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
        except requests.HTTPError as exc:
            last_http_error = exc
            continue

        payload = resp.json()
        # v2 returns [pagination_header, [observations]]; an error returns a dict.
        if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
            return None
        # Newest first, so the first non-null is the most recent one.
        for obs in payload[1]:
            if obs.get("value") is not None:
                return {"value": float(obs["value"]), "year": obs["date"]}
        return None

    # Every shape was refused. Raise so scrape() records it as a failure rather
    # than as "no observation", which would read as the World Bank simply not
    # holding the series — a very different thing from being unable to ask.
    raise last_http_error  # type: ignore[misc]


def sentiment_for(value: float, rule) -> str:
    """'good' | 'caution' | 'watch' for one observation.

    "watch" is the honest default: most of these figures do not have a line
    either side of which a country is fine or in trouble, and colouring them as
    though they did would be a credit judgement this app has no business making.
    Only where a widely used threshold exists is a verdict offered at all.
    """
    if not rule:
        return "watch"
    threshold, direction = rule
    ok = value >= threshold if direction == "higher" else value <= threshold
    return "good" if ok else "caution"


# A WALL CLOCK THIS SCRAPER IMPOSES ON ITSELF.
#
# Eight indicators, up to three query shapes each, sixty seconds per request:
# the worst case is about twenty-four minutes. The CI step allows six. So on a
# day when the World Bank API is slow this step was GUARANTEED to blow its
# bound — which is what happened on 2026-08-07, at 6m12s.
#
# Being killed externally is the worst of the options. The process dies before
# it can report, the step is marked failed, and — until the bound was moved
# into the shell — six later scrapers and the freshness gate were skipped with
# it. Stopping ourselves is strictly better: whatever came back is assessed by
# refuse_if_collapsed(), which either writes a complete-enough file or exits 1
# deliberately so the pipeline records `failed=worldbank` and carries on.
#
# Deliberately well under the step's own 360s so this fires FIRST. A
# self-imposed budget larger than the external one could never fire, which is
# the defect this repository keeps finding in itself.
BUDGET_SECONDS = 240


def scrape(budget_seconds: float = BUDGET_SECONDS) -> list:
    records = []
    started = time.monotonic()
    for code, label, unit, note, rule in INDICATORS:
        if time.monotonic() - started > budget_seconds:
            print(
                f"[worldbank] budget of {budget_seconds:.0f}s spent after "
                f"{len(records)} of {len(INDICATORS)} indicators — stopping here "
                "rather than being killed mid-request. What came back is judged "
                "by refuse_if_collapsed().",
                file=sys.stderr,
            )
            break
        try:
            obs = latest_value(code)
        except requests.RequestException as exc:
            print(f"[worldbank] {code} failed: {exc}", file=sys.stderr)
            continue
        if not obs:
            print(f"[worldbank] {code}: no observation", file=sys.stderr)
            continue
        value = round(obs["value"], 2)
        records.append({
            "id": f"wb-{code.lower().replace('.', '-')}",
            "label": label,
            "value": value,
            "unit": unit,
            "asOf": obs["year"],
            # WHEN WE ASKED, as distinct from what the answer was about.
            #
            # `asOf` is the VINTAGE — the reference year of the observation —
            # and it is the only date these records carried. That made a whole
            # class of failure invisible: the healthcheck reads the newest
            # `asOf` across the file, so two indicators with a 2025 vintage
            # made the file look 582 days old while Interest / government
            # revenue sat at a 2023 vintage, 1313 days, and nothing could tell
            # whether that was the World Bank having no newer figure or our
            # fetch for that series having quietly broken.
            #
            # Those are different problems with different fixes and the data
            # could not distinguish them. `fetchedAt` can: it moves every time
            # this scraper successfully reads the indicator, whatever vintage
            # comes back. A stale vintage with a fresh fetchedAt is the World
            # Bank's answer and nothing to do; a stale fetchedAt is ours.
            "fetchedAt": date.today().isoformat(),
            "source": "World Bank Open Data (CC BY 4.0)",
            "sourceUrl": f"https://data.worldbank.org/indicator/{code}?locations=KE",
            "note": note,
            "sentiment": sentiment_for(value, rule),
        })
    return records


def refuse_if_collapsed(records: list) -> None:
    """Exit non-zero rather than publish a fraction of the picture.

    Keeping the previous file is the right failure here: it is complete and
    merely old, where a partial write is incomplete AND looks current. The
    non-zero exit is what the CI step's `|| echo "failed=worldbank"` reads, so
    this is also what turns a silent collapse into the pipeline alert that a
    reader-facing gap deserves.
    """
    if len(records) >= MIN_INDICATORS:
        return
    got = ", ".join(r["label"] for r in records) or "nothing"
    print(
        f"[worldbank] only {len(records)} of {len(INDICATORS)} indicators came back "
        f"({got}) — refusing to overwrite a fuller file with a partial one. "
        "The existing context.json is kept.",
        file=sys.stderr,
    )
    sys.exit(1)


if __name__ == "__main__":
    print(f"[worldbank] fetching as of {date.today().isoformat()}", file=sys.stderr)
    records = scrape()
    refuse_if_collapsed(records)
    write_dataset("context", records)
