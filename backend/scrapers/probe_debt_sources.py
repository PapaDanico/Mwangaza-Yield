"""Is Kenya's debt-to-GDP ratio readable by software anywhere we may republish from?

WHY THIS PROBE EXISTS
---------------------
`INDICATORS` in worldbank.py asks the World Bank for eight codes and the app
ships seven. The absentee is GC.DOD.TOTL.GD.ZS — general government debt as a
share of GDP — and /sources now says, in public, that the World Bank returns no
observation for Kenya against it.

That claim is about ONE API. It is not the same claim as "nobody publishes
this", and the difference matters because the ratio is quoted constantly in
Kenyan coverage: around 68% of GDP for 2025, rising through 2027. If somebody
serves it under terms we may redistribute, the honest thing is to serve it too.

WHAT THIS DOES NOT DO
---------------------
It writes nothing. It decides nothing. It reports, per candidate source: the
HTTP status, whether Kenya appears at all, how many NON-NULL observations came
back, the newest year and value, and — where the response carries it — the
licence string. Adding an indicator on the strength of "the URL returned 200"
is how a source that answers with an empty array gets mistaken for a source
that answers.

Every candidate is wrapped so one dead host cannot take the probe with it: a
network failure is a RESULT here, not a crash.
"""
import json
import sys

import requests

TIMEOUT = 30
UA = {"User-Agent": "mwangaza-yield-probe/1.0 (+https://mwangazayield.org)"}


def head(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def get(url: str):
    """Fetch, returning (status, body_text, error). Never raises."""
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=UA)
        return r.status_code, r.text, None
    except Exception as exc:  # noqa: BLE001 — the exception IS the finding
        return None, None, f"{type(exc).__name__}: {exc}"


def report_worldbank(code: str) -> None:
    """Ask the World Bank for one code and say what came back, precisely.

    The v2 API answers a query it understands but has no data for with
    `[{...pagination...}, null]` or a page of rows whose `value` is null. Both
    are 200 OK. Counting NON-NULL rows is the only reading that distinguishes
    "no data" from "data".
    """
    url = f"https://api.worldbank.org/v2/country/KE/indicator/{code}?format=json&per_page=100"
    status, body, err = get(url)
    print(f"\n-- World Bank {code}")
    print(f"   url    : {url}")
    if err:
        print(f"   FAILED : {err}")
        return
    print(f"   status : {status}")
    if status != 200 or not body:
        print(f"   body   : {(body or '')[:300]}")
        return
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        print(f"   body   : not JSON — {body[:300]}")
        return
    if not isinstance(payload, list) or len(payload) < 2:
        print(f"   shape  : unexpected — {str(payload)[:300]}")
        return
    meta, rows = payload[0], payload[1]
    if not rows:
        print(f"   rows   : NONE. meta={json.dumps(meta)[:200]}")
        print("   verdict: the API understands the code and has nothing for Kenya.")
        return
    live = [r for r in rows if r.get("value") is not None]
    print(f"   rows   : {len(rows)} returned, {len(live)} with a value")
    if live:
        live.sort(key=lambda r: r.get("date", ""), reverse=True)
        for r in live[:5]:
            print(f"   value  : {r['date']} = {r['value']}")
        print("   verdict: DATA EXISTS. /sources copy would need revisiting.")
    else:
        print("   verdict: every observation is null — the source declines to answer.")


def report_imf() -> None:
    """IMF DataMapper — the series Kenyan coverage actually quotes."""
    url = "https://www.imf.org/external/datamapper/api/v1/GGXWDG_NGDP/KEN"
    status, body, err = get(url)
    print("\n-- IMF DataMapper GGXWDG_NGDP (general government gross debt, % of GDP)")
    print(f"   url    : {url}")
    if err:
        print(f"   FAILED : {err}")
        return
    print(f"   status : {status}")
    if status != 200 or not body:
        print(f"   body   : {(body or '')[:300]}")
        return
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        print(f"   body   : not JSON — {body[:300]}")
        return
    series = (payload.get("values", {}).get("GGXWDG_NGDP", {}) or {}).get("KEN")
    if not series:
        print(f"   verdict: no KEN series. keys={list(payload.get('values', {}).keys())}")
        return
    years = sorted(series.keys())
    print(f"   years  : {years[0]}..{years[-1]} ({len(years)} points)")
    for y in years[-6:]:
        print(f"   value  : {y} = {series[y]}")
    # The IMF publishes PROJECTIONS alongside outturns in this series and does
    # not flag which is which here. A ratio for a year that has not ended is a
    # forecast, and shipping it beside World Bank outturns without saying so
    # would put a projection in a panel of measurements.
    print("   NOTE   : years at or beyond the current one are IMF projections, not outturns.")
    print(f"   licence: see https://www.imf.org/external/terms.htm — check before republishing.")


def report_imf_catalogue() -> None:
    """WHAT ELSE the IMF carries for Kenya, not just the one debt ratio.

    `report_imf` above asks a closed question — does GGXWDG_NGDP have a KEN
    series — and answers it well. It cannot tell us what we are not already
    asking for, and the sovereign panel needs denominators and fiscal
    aggregates that we currently have no permitted machine-readable source for.

    So this enumerates. It reads the DataMapper indicator catalogue, then checks
    Kenya coverage for the handful of series this project would actually use,
    and reports the LAST year of each so a reader can see immediately whether
    they are being offered an outturn or a forecast.

    It writes nothing and decides nothing. Coverage is not permission: the IMF
    terms still gate republication, and every value at or beyond the current
    year is a projection whatever the catalogue says.
    """
    catalogue = "https://www.imf.org/external/datamapper/api/v1/indicators"
    print(f"\n-- IMF DataMapper indicator catalogue")
    print(f"   url    : {catalogue}")
    status, body, err = get(catalogue)
    if err:
        print(f"   FAILED : {err}")
        print("   NOTE   : a fact about this run's egress, not about the IMF.")
        return
    print(f"   status : {status}")
    if status != 200 or not body:
        print(f"   body   : {(body or '')[:300]}")
        return
    try:
        indicators = (json.loads(body) or {}).get("indicators", {})
    except json.JSONDecodeError:
        print(f"   body   : not JSON — {body[:300]}")
        return
    print(f"   count  : {len(indicators)} indicators published")

    # Chosen because each one fills a hole the panel currently papers over,
    # not because they are interesting. Debt-to-GDP is deliberately absent —
    # report_imf already owns it.
    WANTED = {
        "NGDP_RPCH": "real GDP growth (the denominator's rate of change)",
        "PCPIPCH": "inflation, average consumer prices",
        "GGR_NGDP": "general government revenue, % of GDP",
        "GGX_NGDP": "general government expenditure, % of GDP",
        "GGXCNL_NGDP": "fiscal balance, % of GDP",
        "BCA_NGDPD": "current account balance, % of GDP",
    }
    for code, why in WANTED.items():
        known = code in indicators
        url = f"https://www.imf.org/external/datamapper/api/v1/{code}/KEN"
        status, body, err = get(url)
        line = f"   {code:12} {'in catalogue' if known else 'NOT in catalogue'}"
        if err or status != 200 or not body:
            print(f"{line} — fetch failed ({err or status})")
            continue
        try:
            series = ((json.loads(body).get("values", {}) or {}).get(code, {}) or {}).get("KEN")
        except json.JSONDecodeError:
            print(f"{line} — not JSON")
            continue
        if not series:
            print(f"{line} — no KEN series")
            continue
        years = sorted(series.keys())
        print(f"{line} — KEN {years[0]}..{years[-1]}, last = {series[years[-1]]}")
        print(f"                {why}")

    print("\n   NOTE   : the DataMapper mixes outturns and projections without")
    print("            flagging which is which. Any year at or beyond the current")
    print("            one is a forecast, and a forecast printed beside measured")
    print("            figures is the dishonest kind of accurate.")
    print("   licence: https://www.imf.org/external/terms.htm gates all of this.")
    print("            Coverage is not permission and this probe checks only coverage.")


def report_fred() -> None:
    """FRED redistributes the IMF series; its CSV endpoint needs no key."""
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=KENGGXWDGG01GDPPT"
    status, body, err = get(url)
    print("\n-- FRED KENGGXWDGG01GDPPT (IMF series, redistributed)")
    print(f"   url    : {url}")
    if err:
        print(f"   FAILED : {err}")
        return
    print(f"   status : {status}")
    if status != 200 or not body:
        print(f"   body   : {(body or '')[:300]}")
        return
    lines = [ln for ln in body.strip().splitlines() if ln.strip()]
    print(f"   rows   : {len(lines)} (including header)")
    for ln in lines[:1] + lines[-6:]:
        print(f"   csv    : {ln}")


def report_terms() -> None:
    """The condition that failed for the least defensible reason.

    Three things had to hold before an IMF figure could ship. Two failed on the
    data itself: two copies of the series disagree by 1.5 points on 2026, and
    outturns arrive undifferentiated from forecasts running to 2031. Those are
    honest grounds to decline.

    The third — "the licence is unread" — failed only because the terms page
    cannot be fetched from the development sandbox, where the gateway answers
    403 to CONNECT. That is a fact about our proxy, not about the IMF, and
    declining to publish on the strength of it would be dressing an obstacle up
    as a finding. This runner can reach the page, so it reads it.

    It prints what the page SAYS about redistribution rather than a verdict.
    A licence decision is not a scraper's to make, and a probe that answered
    "yes, we may republish" would be the one part of this file worth
    distrusting.
    """
    for name, url, markers in (
        (
            "IMF terms and conditions",
            "https://www.imf.org/external/terms.htm",
            ("redistribut", "reproduc", "commercial", "attribut", "copyright",
             "creative commons", "permission"),
        ),
        (
            "FRED terms of use",
            "https://fred.stlouisfed.org/legal/",
            ("copyright", "third party", "redistribut", "permission", "source"),
        ),
    ):
        status, body, err = get(url)
        print(f"\n-- {name}")
        print(f"   url    : {url}")
        if err:
            print(f"   FAILED : {err}")
            continue
        print(f"   status : {status}")
        if status != 200 or not body:
            continue
        # Crude, and deliberately so: strip tags, then quote every sentence
        # carrying a word that bears on republishing. Summarising a licence is
        # how a licence gets misread — the sentences go in the log verbatim so
        # a human reads the source's own words.
        import re

        text = re.sub(r"<[^>]+>", " ", body)
        text = re.sub(r"\s+", " ", text).strip()
        print(f"   length : {len(text)} chars of text")
        # Two different findings that a single "no matches" message would blur
        # into one. An empty body means the page carries no prose we can read —
        # a frameset, or content assembled by script — and says NOTHING about
        # what the licence permits. A populated body with no matching sentence
        # is a real negative: the terms are there and none of them mention
        # redistribution. Reporting the first as though it were the second is
        # how "we checked" comes to mean "we failed to check".
        if len(text) < 200:
            print("   NO READABLE TEXT — 200 with an effectively empty body.")
            print("   This is NOT evidence about the licence. The page is likely")
            print("   script-rendered; it must be read by a human in a browser.")
            continue
        sentences = re.split(r"(?<=[.;])\s+", text)
        hits = [s.strip() for s in sentences
                if any(m in s.lower() for m in markers) and 40 < len(s) < 600]
        if not hits:
            print("   Terms present, but no sentence mentions redistribution.")
            print("   A real negative, not a failure to fetch — read by hand to confirm.")
            continue
        for s in hits[:12]:
            print(f"   > {s}")
        if len(hits) > 12:
            print(f"   ... {len(hits) - 12} further matching sentences not shown")


def report_afdb() -> None:
    """The AfDB's Africa Information Highway — the only candidate so far whose
    LICENCE is not the objection.

    Why it is worth asking at all. Of the sources already probed, FRED bars
    commercial redistribution and the IMF mixes outturns with forecasts to
    2031, so both fail on terms or on honesty rather than on availability. The
    AfDB's country portals state CC BY 4.0 — the same licence as the World Bank
    series already in this pipeline — which would make republishing a question
    of data quality alone.

    Why the endpoints below are GUESSES, and are labelled as such. The AIH
    portals are Knoema-hosted, and Knoema's REST shape is not documented by the
    AfDB. So this tries several plausible paths and reports which, if any,
    answer with JSON. A probe that assumed one shape and reported "AfDB is
    unavailable" when it guessed wrong would be worse than no probe: it would
    close a question it never actually asked.

    It prints what came back. It does not decide. Kenya's portal carrying a
    200 is not the same as Kenya's portal carrying quarterly GDP, and the
    difference is exactly what this file exists to keep visible.
    """
    for name, url in (
        ("Kenya country portal (root)", "https://kenya.opendataforafrica.org/"),
        ("AIH data portal (root)", "https://dataportal.opendataforafrica.org/"),
        ("Kenya portal — dataset metadata (guess)",
         "https://kenya.opendataforafrica.org/api/1.0/meta/dataset"),
        ("AIH portal — dataset metadata (guess)",
         "https://dataportal.opendataforafrica.org/api/1.0/meta/dataset"),
        ("Kenya portal — search for GDP (guess)",
         "https://kenya.opendataforafrica.org/api/1.0/search?query=gross%20domestic%20product"),
        ("AfDB statistics landing", "https://www.afdb.org/en/knowledge/statistics"),
    ):
        print(f"\n-- AfDB {name}")
        print(f"   url    : {url}")
        status, body, err = get(url)
        if err:
            print(f"   FAILED : {err}")
            continue
        print(f"   status : {status}")
        if not body:
            print("   body   : empty")
            continue
        print(f"   bytes  : {len(body)}")
        stripped = body.lstrip()
        if stripped[:1] in "[{":
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                print("   shape  : starts like JSON but does not parse")
            else:
                if isinstance(payload, list):
                    print(f"   shape  : JSON array, {len(payload)} entries")
                else:
                    print(f"   shape  : JSON object, keys={list(payload)[:12]}")
                print("   verdict: MACHINE-READABLE. This endpoint shape is the live one.")
                continue
        else:
            print("   shape  : HTML (a portal page, not an API response)")
        # The licence claim is the whole reason AfDB is on this list, so read it
        # off the page rather than repeating it from memory.
        low = body.lower()
        for marker in ("creative commons", "cc-by", "cc by", "attribution 4.0", "licen"):
            idx = low.find(marker)
            if idx != -1:
                print(f"   licence: ...{body[max(0, idx - 90): idx + 130].strip()!r}")
                break


def main() -> int:
    head("Does anybody serve Kenya's debt-to-GDP in a form software can parse?")
    print("Writes nothing. Reports what each candidate actually answers.")

    head("1. The World Bank code we already ask for, and its neighbours")
    # The first is the absentee /sources names. The rest are the plausible
    # alternatives — if one of them carries the same quantity under a different
    # code, "the World Bank has no Kenya debt-to-GDP" is the wrong sentence.
    for code in (
        "GC.DOD.TOTL.GD.ZS",   # general government debt / GDP — the absentee
        "GC.DOD.TOTL.CN",      # same debt, local currency level
        "DT.DOD.DECT.CD",      # external debt stock, current US$
        "DT.DOD.DPPG.GD.ZS",   # public & publicly guaranteed external debt / GDP
        "DT.DOD.PVLX.GN.ZS",   # present value of external debt / GNI
    ):
        report_worldbank(code)

    head("2. The IMF, which is what Kenyan coverage is quoting")
    report_imf()

    head("2b. What else the IMF carries for Kenya")
    report_imf_catalogue()

    head("3. FRED, which redistributes the IMF series without a key")
    report_fred()

    head("4. The AfDB, whose licence is CC BY 4.0 rather than an objection")
    report_afdb()

    head("5. What the terms actually say about republishing")
    report_terms()

    head("Read this before wiring anything in")
    print(
        "A 200 is not a source. Before an indicator is added, three things must\n"
        "hold and be visible above: non-null observations for Kenya; a licence\n"
        "that permits redistribution; and a way to tell an outturn from a\n"
        "projection, because this app's sovereign panel shows measurements and\n"
        "an IMF forecast dressed as one would be the dishonest kind of accurate."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
