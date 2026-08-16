"""Is KNBS's quarterly GDP readable by software, and when does the next one land?

WHY THIS PROBE EXISTS
---------------------
The development container's gateway answers 403 to CONNECT for knbs.or.ke, as
it does for the World Bank, the IMF and FRED. That is a fact about the sandbox,
not about KNBS — and this repository has already been burned by confusing the
two: the note in public/data/fiscal-context.json records that PDMO was written
up as geo-blocked when it answered HTTP 200 on three consecutive runs from a
GitHub Actions runner. The container was the thing that could not reach it.

So the question is asked from a runner with real egress, and nowhere else.

WHAT IS BEING ASKED, IN ORDER OF WHAT IT WOULD BUY US
----------------------------------------------------
1. THE ADVANCE RELEASE CALENDAR. KNBS publishes one. It is the single most
   valuable artefact here and it is not the GDP figure at all: every stale-data
   guard in this codebase fires on a hand-set date, and a guard that knew the
   PUBLISHER's schedule would stop being a guess. If this page is fetchable and
   parseable, an expiry date stops being someone's estimate of when KNBS might
   publish next.

2. A MACHINE-READABLE QUARTERLY SERIES. The CPI work only became durable once
   there was something better than a PDF to parse. If quarterly GDP is
   PDF-only, wiring it in costs an order of magnitude more, and that is worth
   knowing BEFORE the work is scheduled rather than during it.

3. NOMINAL GDP IN SHILLINGS. This app quotes debt-to-GDP inherited from
   whichever Treasury document was last read — fiscal-context.json says
   asOf 2026-02-01, the February MTDS. A nominal GDP denominator we hold
   ourselves would let the ratio be computed rather than copied, and would age
   on a schedule we can see.

WHAT THIS DOES NOT DO
---------------------
It writes nothing. It decides nothing. It reports status, content type, size,
and whether the bytes are actually what the extension claims. A 200 is not a
source: a page that returns HTML saying "no results" is a 200, and so is a
PDF with no text layer. Every candidate is wrapped so one dead host cannot
take the probe down with it — a network failure is a RESULT here, not a crash.
"""
import re
import sys

import requests

import tls_chain

TIMEOUT = 30
UA = {"User-Agent": "mwangaza-yield-probe/1.0 (+https://mwangazayield.org)"}

CANDIDATES = [
    ("Quarterly GDP landing page", "https://www.knbs.or.ke/quarterly-gdp/"),
    ("Quarterly GDP report category", "https://www.knbs.or.ke/reports_category/quarterly-gdp-reports/"),
    ("Q1 2026 release", "https://www.knbs.or.ke/reports/quarterly-gross-domestic-product-first-quarter-2026/"),
    ("ADVANCE RELEASE CALENDAR", "https://www.knbs.or.ke/release-calendar/"),
    ("Statistical releases index", "https://www.knbs.or.ke/statistical-releases/"),
    ("Site root", "https://www.knbs.or.ke/"),
]


def head(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def get(url: str):
    """Fetch, returning (response, error). Never raises."""
    try:
        # tls_chain.get, not requests.get: KNBS serves its leaf certificate
        # WITHOUT the intermediate that links it to a trusted root, so a plain
        # request dies with "unable to get local issuer certificate". This
        # follows the AIA pointer in KNBS's own certificate, fetches the
        # missing intermediate and retries against a COMPLETED bundle.
        #
        # Verification is never disabled. If the chain still cannot be built
        # the original SSLError is raised, and this probe reports it — a source
        # we cannot authenticate is a source we do not publish.
        return tls_chain.get(url, timeout=TIMEOUT, headers=UA), None
    except Exception as exc:  # noqa: BLE001 — the exception IS the finding
        return None, f"{type(exc).__name__}: {exc}"


def describe(label: str, url: str) -> str | None:
    """Report one URL. Returns the body text when it is HTML we could parse."""
    print(f"\n-- {label}")
    print(f"   url    : {url}")
    resp, err = get(url)
    if err:
        print(f"   FAILED : {err}")
        # "Unreachable" and "reachable but presenting an unverifiable chain" are
        # different findings with different lifetimes: a missing intermediate
        # certificate can be fixed by the publisher tomorrow, a network block
        # cannot. Saying the wrong one closes a question that is still open.
        if "SSL" in err or "CERTIFICATE" in err.upper():
            print("   verdict: REACHABLE, but the TLS chain does not verify — almost")
            print("            certainly a missing intermediate. Browsers paper over")
            print("            this by fetching the issuer themselves; requests does")
            print("            not, and we do not disable verification for financial")
            print("            data. Re-run later: this is the publisher's to fix.")
        else:
            print("   verdict: unreachable FROM THIS RUNNER. That is a real finding.")
        return None
    ctype = resp.headers.get("content-type", "?")
    print(f"   status : {resp.status_code}")
    print(f"   type   : {ctype}")
    print(f"   bytes  : {len(resp.content)}")
    if resp.status_code != 200:
        return None
    # A PDF that is really an HTML error page is a 200 with the wrong bytes.
    if resp.content[:4] == b"%PDF":
        print("   magic  : %PDF- (genuinely a PDF)")
        return None
    if "html" in ctype.lower():
        return resp.text
    return None


def report_links(body: str) -> None:
    """What downloadable artefacts does this page actually offer?

    Extension is the question, not decoration: xlsx/csv is a different project
    from pdf-only, and the difference decides whether this is worth scheduling.
    """
    links = re.findall(r'href="([^"]+\.(?:pdf|xlsx|xls|csv))"', body, re.I)
    if not links:
        print("   files  : no .pdf/.xlsx/.xls/.csv links found on this page")
        return
    by_ext: dict[str, list[str]] = {}
    for href in links:
        by_ext.setdefault(href.rsplit(".", 1)[-1].lower(), []).append(href)
    for ext, hrefs in sorted(by_ext.items()):
        print(f"   files  : {len(hrefs)} x .{ext}")
        for h in hrefs[:4]:
            print(f"            {h}")
    if any(e in by_ext for e in ("xlsx", "xls", "csv")):
        print("   verdict: MACHINE-READABLE format offered. This is the cheap path.")
    else:
        print("   verdict: PDF only. Parsing cost is an order of magnitude higher.")


def report_dates(body: str, label: str) -> None:
    """Any forward-looking dates? On the calendar page this is the whole point."""
    dates = re.findall(
        r"\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d\d)\b",
        body,
    )
    if dates:
        seen = list(dict.fromkeys(dates))[:12]
        print(f"   dates  : {len(dates)} found, first {len(seen)} unique: {seen}")
        if "CALENDAR" in label.upper():
            print(
                "   verdict: a PUBLISHED SCHEDULE exists. Every expiry guard in this\n"
                "            repo currently uses a hand-set date; this would replace\n"
                "            the guess with the publisher's own commitment."
            )
    else:
        print("   dates  : none matched (the page may render them client-side)")


def main() -> int:
    head("Can this runner reach KNBS at all?")
    print(
        "The development container cannot — its gateway 403s the CONNECT. If the\n"
        "results below are also failures, that is a real finding about KNBS. If\n"
        "they are 200s, the block was ours, exactly as it was for PDMO."
    )

    for label, url in CANDIDATES:
        body = describe(label, url)
        if body:
            report_links(body)
            report_dates(body, label)

    head("Read this before wiring anything in")
    print(
        "A 200 is not a source. Before quarterly GDP is added, three things must\n"
        "hold and be visible above: the bytes must be what the extension claims;\n"
        "there must be a format software can read without OCR; and the release\n"
        "calendar must give a NEXT date, because a figure with no known refresh\n"
        "schedule cannot be given an honest expiry guard — and an expiry guard\n"
        "that fires on a guess is the thing this repo keeps having to correct.\n"
        "\n"
        "Note also: KNBS is the ORIGINATOR of the CPI this app already shows, but\n"
        "that figure is READ FROM CBK and lib/provenance.ts is deliberate about\n"
        "saying so. Anything added here must credit where it was actually read."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
