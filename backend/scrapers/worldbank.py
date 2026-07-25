"""Pull Kenya sovereign-health indicators from the World Bank Open Data API.

Why this source, when most of the others on the list are unusable:
  * No API key — so it can run in CI without secrets, and could even be called
    from the browser if we ever wanted live refresh.
  * Documented, stable, versioned REST/JSON (v2).
  * CC BY 4.0 licensed, so we may redistribute with attribution. Most Kenyan
    market data is either licensed (NSE bulk feeds) or copyrighted research
    (broker notes), which we link to instead of copying.

The indicators chosen are the ones that tell a BOND investor whether the
borrower is good for the money — not general development statistics.
"""
import sys
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


def latest_value(indicator_code: str) -> dict | None:
    """Most recent non-null observation for Kenya, with its year."""
    resp = requests.get(
        f"{BASE}/{indicator_code}",
        params={"format": "json", "per_page": 20, "mrnev": 1},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    payload = resp.json()
    # v2 returns [pagination_header, [observations]]; an error returns a dict.
    if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return None
    for obs in payload[1]:
        if obs.get("value") is not None:
            return {"value": float(obs["value"]), "year": obs["date"]}
    return None


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


def scrape() -> list:
    records = []
    for code, label, unit, note, rule in INDICATORS:
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
            "source": "World Bank Open Data (CC BY 4.0)",
            "sourceUrl": f"https://data.worldbank.org/indicator/{code}?locations=KE",
            "note": note,
            "sentiment": sentiment_for(value, rule),
        })
    return records


if __name__ == "__main__":
    print(f"[worldbank] fetching as of {date.today().isoformat()}", file=sys.stderr)
    write_dataset("context", scrape())
