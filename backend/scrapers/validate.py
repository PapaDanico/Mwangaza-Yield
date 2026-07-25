"""Probe every live data source and report what we can actually reach.

Run this on a network-open machine (or the CI runner) BEFORE trusting any
scraper. It makes no changes and writes no files — it answers one question per
source: can we fetch it, and does the response look like what the parser
expects?

Exit code is 0 even when sources fail: the point is the report, not a gate.
"""
import json
import re
import sys

import requests

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = 45

CHECKS = [
    # (name, url, a regex/marker the parser depends on finding)
    ("CBK home (CBR, FX)", "https://www.centralbank.go.ke/", r"Central Bank Rate"),
    ("CBK treasury bonds", "https://www.centralbank.go.ke/securities/treasury-bonds/", r"(?i)treasury bond"),
    ("CBK prospectus list", "https://www.centralbank.go.ke/securities/treasury-bonds/treasury-bonds-prospectuses/", r"(?i)prospectus"),
    ("CBK treasury bills", "https://www.centralbank.go.ke/securities/treasury-bills/", r"(?i)treasury bill"),
    ("KNBS", "https://www.knbs.or.ke/", r"(?i)inflation|consumer price"),
    ("NSE bonds statistics", "https://www.nse.co.ke/bonds-statistics/", r"(?i)bond"),
    ("World Bank API (GDP growth)",
     "https://api.worldbank.org/v2/country/KE/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=5&mrnev=1",
     None),
]


def probe(name: str, url: str, marker: str | None) -> dict:
    result = {"source": name, "url": url}
    try:
        r = requests.get(url, headers=UA, timeout=TIMEOUT)
        result["status"] = r.status_code
        result["bytes"] = len(r.content)
        result["content_type"] = r.headers.get("Content-Type", "")[:60]
        if r.status_code != 200:
            result["verdict"] = "UNREACHABLE"
            return result
        if url.startswith("https://api.worldbank.org"):
            payload = r.json()
            ok = isinstance(payload, list) and len(payload) > 1 and payload[1]
            result["verdict"] = "OK" if ok else "SHAPE CHANGED"
            if ok:
                obs = payload[1][0]
                result["sample"] = {"date": obs.get("date"), "value": obs.get("value")}
            return result
        if marker and not re.search(marker, r.text):
            result["verdict"] = "REACHABLE, MARKER MISSING"
            result["note"] = f"expected /{marker}/ in body — page may have been restructured"
            return result
        result["verdict"] = "OK"
    except requests.RequestException as exc:
        result["status"] = None
        result["verdict"] = "ERROR"
        result["note"] = str(exc)[:160]
    return result


def main() -> None:
    results = [probe(*c) for c in CHECKS]
    print(json.dumps(results, indent=2))
    print("\n=== SUMMARY ===", file=sys.stderr)
    for r in results:
        print(f"{r['verdict']:<26} {r['source']}  (HTTP {r.get('status')})", file=sys.stderr)
    reachable = sum(1 for r in results if r["verdict"] == "OK")
    print(f"\n{reachable}/{len(results)} sources usable as-is", file=sys.stderr)


if __name__ == "__main__":
    main()
