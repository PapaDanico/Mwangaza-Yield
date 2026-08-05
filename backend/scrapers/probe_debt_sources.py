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

    head("3. FRED, which redistributes the IMF series without a key")
    report_fred()

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
