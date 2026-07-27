"""Whether IMF country data can be fetched, and from where.

THE REQUEST WAS "the IMF Kenya page". THIS ASKS FOR SOMETHING ELSE.
-------------------------------------------------------------------
https://www.imf.org/en/countries/ken is a landing page: press releases, a
mission statement, links to PDFs. Scraping it would yield prose that changes
layout without notice and carries no series anybody can chart — the same
mistake as reading a listing page for numbers that live in an API.

The IMF publishes the numbers separately, as JSON, keyless, meant to be called:

    DataMapper  https://www.imf.org/external/datamapper/api/v1/{indicator}/{iso3}
    SDMX        https://dataservices.imf.org/REST/SDMX_JSON.svc/

That is the same shape as worldbank.py, which this project already runs
keylessly for sovereign context. So the question is not "can we scrape the
page" but "does the API answer, and with what".

WHY THIS RUNS IN CI
-------------------
The development container's egress policy refuses imf.org at the CONNECT stage
— a 403 from the gateway, not a failure at the far end, the same wall that
stops treasury.go.ke and knbs.or.ke. The GitHub Actions runner has open egress
and already reaches CBK for every prospectus and result sheet in the archive.
So the runner is the honest instrument, exactly as it is for the Treasury.

WHAT THIS DOES NOT DECIDE
-------------------------
Whether we may republish what comes back. Reachability and permission are
different questions, and this project has already had to unpick one dataset
(the exchange's) that was fetchable and not ours to redistribute. So this
prints the terms/attribution the API advertises alongside the data, and the
licence question gets answered before a single figure is published.

Read-only. Writes nothing. Never gates CI.
"""
import json
import sys

import requests

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = (8, 40)
DATAMAPPER = "https://www.imf.org/external/datamapper/api/v1"

# What a Kenyan bond reader would actually use, and why each earns its place.
#
#   NGDP_RPCH  real GDP growth — the denominator behind every debt ratio
#   PCPIPCH    inflation, average consumer prices — the IMF's own series,
#              which matters because KNBS is unreachable and our CPI currently
#              comes from CBK's copy with the substitution recorded
#   GGXWDG_NGDP general government gross debt / GDP — the fiscal-context card
#   BCA_NGDPD  current account / GDP
#   GGXCNL_NGDP general government net lending/borrowing — the deficit that
#              drives domestic issuance, which is what a bond ladder rolls into
INDICATORS = [
    ("NGDP_RPCH", "real GDP growth, %"),
    ("PCPIPCH", "inflation, average consumer prices, %"),
    ("GGXWDG_NGDP", "general government gross debt, % of GDP"),
    ("GGXCNL_NGDP", "general government net lending/borrowing, % of GDP"),
    ("BCA_NGDPD", "current account balance, % of GDP"),
]
ISO3 = "KEN"


def get(url: str):
    try:
        r = requests.get(url, headers=UA, timeout=TIMEOUT)
    except Exception as exc:  # noqa: BLE001
        print(f"    unreachable: {exc.__class__.__name__}: {exc}")
        return None
    print(f"    HTTP {r.status_code}, {len(r.content)} bytes, "
          f"content-type {r.headers.get('content-type', '?')}")
    if r.status_code != 200:
        return None
    try:
        return r.json()
    except ValueError:
        print(f"    not JSON — first 200 chars: {r.text[:200]!r}")
        return None


def probe_indicator(code: str, label: str) -> None:
    print(f"\n--- {code}  ({label})")
    data = get(f"{DATAMAPPER}/{code}/{ISO3}")
    if not data:
        return

    # Shape: {"values": {"NGDP_RPCH": {"KEN": {"1980": 5.6, ...}}}, ...}
    series = (data.get("values") or {}).get(code, {}).get(ISO3)
    if not isinstance(series, dict) or not series:
        print(f"    no series for {ISO3} in the response; keys: "
              f"{list(data.keys())[:6]}")
        return

    years = sorted(series)
    print(f"    {len(years)} observation(s), {years[0]} to {years[-1]}")
    # The last few actuals and the first projections matter differently: the
    # IMF publishes forecasts in the same series, and a forecast presented as
    # an observation is exactly the kind of claim this project refuses.
    tail = years[-8:]
    print("    " + "  ".join(f"{y}={series[y]}" for y in tail))

    # Whether the API distinguishes actual from projected AT ALL is the
    # decisive question for publishing any of it.
    meta_keys = [k for k in data.keys() if k != "values"]
    print(f"    non-values keys in payload: {meta_keys}")


def main() -> None:
    print("=== IMF: IS THE DATA REACHABLE, AND WHAT DOES IT SAY ABOUT ITSELF ===")

    print("\n--- the landing page the request named")
    page = None
    try:
        r = requests.get(f"https://www.imf.org/en/countries/ken", headers=UA, timeout=TIMEOUT)
        print(f"    HTTP {r.status_code}, {len(r.content)} bytes")
        page = r.status_code == 200
    except Exception as exc:  # noqa: BLE001
        print(f"    unreachable: {exc.__class__.__name__}: {exc}")
    if page:
        print("    reachable — but it is a landing page. Numbers come from the "
              "API below; scraping prose that reflows is how a figure goes "
              "stale without anybody noticing.")

    print("\n--- the country list, which also proves the API answers at all")
    countries = get(f"{DATAMAPPER}/countries")
    if countries:
        ken = (countries.get("countries") or {}).get(ISO3)
        print(f"    {ISO3} in the list: {ken}")

    for code, label in INDICATORS:
        probe_indicator(code, label)

    print("\n--- what the API says about reuse")
    for path in ("/indicators", "/terms"):
        print(f"  {DATAMAPPER}{path}")
        payload = get(f"{DATAMAPPER}{path}")
        if isinstance(payload, dict):
            for key in ("terms", "license", "licence", "copyright", "attribution"):
                if key in payload:
                    print(f"    {key}: {json.dumps(payload[key])[:300]}")

    print("\nReachability is not permission. Nothing here gets published until "
          "the terms are read — this project has already had to remove one "
          "dataset that was fetchable and not ours to redistribute.")


if __name__ == "__main__":
    sys.exit(main())
