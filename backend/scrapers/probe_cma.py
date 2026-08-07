"""What does the Capital Markets Authority actually publish, and may we use it?

THE QUESTION IS NOT "IS THERE DATA". IT IS "WHICH KIND".

`secondary.json` is empty by design. The Nairobi Securities Exchange's terms
make its data proprietary and forbid using it to build a product, and what sits
publicly on its website is covered as much as a paid feed, so the dependency
was removed outright rather than relied on as a use small enough that nobody
minds. `no-exchange-data.test.ts` enforces that, and LICENSE and SECURITY.md
both state it.

CMA is a different body — the regulator, at cma.or.ke, not the exchange — so
nothing in that rule reaches it automatically. But the rule exists to avoid
redistributing the Exchange's data, and a regulator's bulletin that reprints
Exchange figures is the same data one document removed. Whether that is
permitted is a question about CMA's own terms and the provenance of each table,
and it is a lawyer's question, not a scraper's.

So this probe sorts what CMA publishes into two piles, because they carry
completely different risk:

  AGGREGATE MARKET ACTIVITY — total bond turnover, value traded, number of
  deals, market capitalisation. A regulator compiling and publishing summary
  statistics about the market it supervises is the ordinary business of a
  regulator. This is the pile worth pursuing, and it is useful: it would tell a
  reader whether the bond market is liquid this quarter, which nothing in the
  app currently says.

  PER-SECURITY PRICES — a clean price against an ISIN on a date. This is what
  `secondary.json` needs and what the planners fall back to par 100 without.
  It is also, almost certainly, the Exchange's data reprinted. Finding it here
  would NOT make it usable; it would just move the same question to a different
  masthead.

The probe reports which pile each finding lands in and does not fetch, store or
publish anything. A yes on the second pile is not a green light — it is the
point at which somebody reads CMA's terms and the table's own provenance note
before a single line of parser is written.

WHY THIS IS WORTH ASKING AT ALL

The price book at /prices exists because we have no market prices: a reader
types what they paid or were quoted. That is honest but it is work, and every
planner falls back to par 100 — clearly labelled a placeholder, never presented
as the market. If aggregate liquidity data can be published lawfully, it does
not replace prices, but it does let the app say something true about the market
instead of nothing.
"""
import re
import sys
from io import BytesIO

import requests

UA = {"User-Agent": "mwangaza-yield-probe/1.0 (+https://mwangazayield.org)"}
TIMEOUT = 45

LANDINGS = [
    "https://www.cma.or.ke/statistics/",
    "https://www.cma.or.ke/market-statistics/",
    "https://www.cma.or.ke/statistical-bulletins/",
    "https://www.cma.or.ke/publications/",
    "https://www.cma.or.ke/",
]

PDF_RE = re.compile(r'href="([^"]+\.(?:pdf|xlsx?|csv))"', re.I)

# The safe pile: a regulator's summary of the market it supervises.
AGGREGATE_TERMS = (
    "bond turnover", "bonds turnover", "turnover", "value traded",
    "market capitalisation", "market capitalization", "number of deals",
    "traded value", "secondary market",
)

# The risky pile: a price attached to a specific security.
PER_SECURITY_TERMS = (
    "isin", "clean price", "dirty price", "closing price",
    "fxd1", "ifb1", "sdb1",  # Kenyan bond code prefixes
)

# Provenance: does the document say where its numbers came from?
PROVENANCE_TERMS = ("nairobi securities exchange", "nse", "source:", "sourced from")


def get(url: str):
    try:
        return requests.get(url, headers=UA, timeout=TIMEOUT)
    except requests.RequestException as exc:
        print(f"   FETCH FAILED: {type(exc).__name__}: {str(exc)[:110]}")
        return None


def find_documents() -> list:
    print("\n" + "=" * 72)
    print("1. What does CMA publish, and can we even reach it?")
    print("=" * 72)
    found = []
    for url in LANDINGS:
        r = get(url)
        if r is None:
            continue
        print(f"\n-- {url}")
        print(f"   status : {r.status_code}, {len(r.content)} bytes")
        if r.status_code != 200:
            continue
        docs = []
        for h in PDF_RE.findall(r.text):
            if h.startswith("//"):
                h = "https:" + h
            elif h.startswith("/"):
                h = "https://www.cma.or.ke" + h
            if h not in docs:
                docs.append(h)
        print(f"   docs   : {len(docs)} linked (pdf/xls/csv)")
        for d in docs[:6]:
            print(f"            {d}")
        found.extend(d for d in docs if d not in found)
    return found


def classify(url: str) -> None:
    print(f"\n-- {url}")
    r = get(url)
    if r is None or r.status_code != 200:
        print(f"   status : {r.status_code if r else 'no response'}")
        return
    print(f"   status : 200, {len(r.content)} bytes")

    text = ""
    if url.lower().endswith(".pdf"):
        try:
            import pdfplumber
            with pdfplumber.open(BytesIO(r.content)) as pdf:
                text = " ".join((p.extract_text() or "") for p in pdf.pages[:20])
                print(f"   pages  : {len(pdf.pages)}, read first {min(len(pdf.pages), 20)}")
        except Exception as exc:  # noqa: BLE001 — a probe reports, never raises
            print(f"   could not read: {type(exc).__name__}: {str(exc)[:100]}")
            return
    else:
        text = r.text[:400_000]

    print(f"   text   : {len(text)} chars")
    if len(text) < 400:
        print("   VERDICT: no usable text layer — figures are probably an image.")
        return

    low = text.lower()
    agg = [t for t in AGGREGATE_TERMS if t in low]
    per = [t for t in PER_SECURITY_TERMS if t in low]
    prov = [t for t in PROVENANCE_TERMS if t in low]

    if agg:
        i = low.find(agg[0])
        print(f"   AGGREGATE  : {', '.join(agg[:4])}")
        print(f"                ...{' '.join(text[max(0, i-50):i+150].split())[:140]}")
    else:
        print("   AGGREGATE  : none of the summary terms appear")

    if per:
        i = low.find(per[0])
        print(f"   PER-SECURITY (RISKY): {', '.join(per[:4])}")
        print(f"                ...{' '.join(text[max(0, i-50):i+150].split())[:140]}")
        print("                This is the pile that needs a licence answer BEFORE")
        print("                anything is parsed. Finding it is not permission.")
    else:
        print("   PER-SECURITY: absent — no ISIN or per-bond price language")

    print(f"   provenance : {', '.join(prov) if prov else 'no source attribution found'}")
    if "nairobi securities exchange" in low or re.search(r'\bnse\b', low):
        print("                The document credits the Exchange. Treat every")
        print("                figure in it as Exchange-derived until shown otherwise.")


def main() -> int:
    print("=" * 72)
    print("CMA: which kind of data, and whose is it?")
    print("=" * 72)
    print("Writes nothing, stores nothing, publishes nothing.")
    print("secondary.json stays empty until a LICENCE question is answered,")
    print("not until a source is found.")

    docs = find_documents()
    if not docs:
        print("\nNo documents reachable. That is an answer about access, not")
        print("about whether the data exists or may be used.")
    else:
        print("\n" + "=" * 72)
        print("2. Sorting what was found into the two piles")
        print("=" * 72)
        for d in docs[:4]:
            classify(d)

    print("\n" + "=" * 72)
    print("How to read this")
    print("=" * 72)
    print("AGGREGATE findings are the pursuable ones: a regulator summarising")
    print("the market it supervises. They cannot fill secondary.json — that")
    print("needs a price per ISIN per date — but they would let the dashboard")
    print("say something true about liquidity instead of nothing.")
    print()
    print("PER-SECURITY findings are NOT a route around the Exchange's terms.")
    print("The same data reprinted by a regulator is the same data. Before any")
    print("of it is used, somebody reads CMA's terms of use AND the table's own")
    print("provenance note, and the answer goes in writing next to the parser.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
