"""Refresh the auction calendar from CBK's live prospectus listing.

This is the piece that has been missing between the prediction ledger and its
first recorded forecast. auctions.json was hand-maintained; nothing in the
pipeline wrote it; the ledger records a forecast only for a FUTURE auction with
NAMED bonds, and the calendar never offered one. Zero entries, ever.

The chain this completes:

    CBK publishes a prospectus
      -> this fetches it on the daily refresh
      -> calendar_parser reads one record per bond (built against the live
         layout, probed first — see probe_calendar.py for why the old parser
         would have been wrong four ways)
      -> update-predictions.mjs sees a future auction with named bonds and
         records the bid assistant's range BEFORE the auction closes
      -> auction_results.py later captures the outcome
      -> the ledger scores itself, in public

MERGE RULES, WHICH ARE WHERE THIS COULD GO WRONG
------------------------------------------------
The existing file carries hand-written history — settled multi-bond entries
whose issueCode is display prose ("FXD1/2022/10 + FXD1/2021/20") — and one
hand-written placeholder for a window CBK has announced but not yet documented.

  * Existing records are NEVER deleted. The archive of past auctions is the
    page's memory, and a fetch failure must not be able to empty it. Scraped
    records replace an existing record only when they describe the same
    auction — same normalised code, same auction date.

  * The hand-written "TBA" placeholder survives until a REAL prospectus covers
    a date within its window. The placeholder says "CBK said August"; a
    prospectus says which bonds. The second supersedes the first, and until
    then the placeholder is the best answer we have.

  * Statuses are recomputed from dates on every run, for scraped and
    hand-written records alike — "upcoming" hand-typed in June is wrong by
    September, and was: the shipped file still called an auction three weeks
    past settlement "upcoming" until effectiveAuctionStatus() patched it in
    the frontend. The data should not need the frontend to lie for it.

  * A failed fetch, an empty listing, or a listing full of tap sales leaves
    the file exactly as it was and says so. Partial truth that is stated
    beats silence that looks like health.

The per-run fetch is small and polite: the newest MAX_DOCS prospectuses only,
with a delay between requests. CBK publishes one or two a month; there is
nothing to hammer.
"""
import json
import re
import sys
import time
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, unquote

import requests

from calendar_parser import normalise_code, parse_prospectus_text

DATA_DIR = Path(__file__).resolve().parents[2] / "public" / "data"
LISTING = "https://www.centralbank.go.ke/bills-bonds/treasury-bonds/"
PROSPECTUS_PATH = "/uploads/treasury_bonds_prospectuses/"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-KE,en;q=0.9",
}
TIMEOUT = (8, 45)
POLITE_DELAY_SECONDS = 1.5
MAX_DOCS = 6

TBA_RE = re.compile(r"\bTBA\b", re.I)


def fetch_prospectus_texts() -> list:
    """[(url, text)] for the newest prospectuses, or [] with the reason printed."""
    try:
        r = requests.get(LISTING, headers=UA, timeout=TIMEOUT)
        r.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        print(f"[calendar] listing unreachable: {exc.__class__.__name__}: {exc}",
              file=sys.stderr)
        return []

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(r.text, "html.parser")
    urls, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = urljoin(LISTING, a["href"])
        if PROSPECTUS_PATH in href and href.lower().endswith(".pdf") and href not in seen:
            seen.add(href)
            urls.append(href)
    if not urls:
        print(f"[calendar] listing carried nothing under {PROSPECTUS_PATH} — "
              "markup change or move; keeping the existing calendar",
              file=sys.stderr)
        return []

    import pdfplumber
    out = []
    for url in urls[:MAX_DOCS]:
        time.sleep(POLITE_DELAY_SECONDS)
        name = unquote(url.rsplit("/", 1)[-1])
        try:
            resp = requests.get(url, headers=UA, timeout=TIMEOUT)
            resp.raise_for_status()
            with pdfplumber.open(BytesIO(resp.content)) as pdf:
                text = "\n".join((p.extract_text() or "") for p in pdf.pages)
            out.append((url, text))
            print(f"[calendar] read {name[:80]}")
        except Exception as exc:  # noqa: BLE001
            # One bad document must not stop the others.
            print(f"[calendar] skipped {name[:80]}: {exc.__class__.__name__}: {exc}",
                  file=sys.stderr)
    return out


def scraped_records(docs: list) -> list:
    records = []
    for url, text in docs:
        parsed = parse_prospectus_text(text)
        if parsed["skipped"]:
            print(f"[calendar] refused {unquote(url.rsplit('/', 1)[-1])[:70]}: "
                  f"{parsed['skipped']}")
            continue
        for r in parsed["records"]:
            kind = "Infrastructure" if r["issueCode"].startswith("IFB") else "Fixed Coupon"
            records.append({
                **r,
                "bondName": f"{r['tenorYears']:g}-Year {kind} Bond"
                            + (" (re-open)" if r["issueCode"].split("/")[1] != r["auctionDate"][:4] else ""),
                # The document itself, not a listing page that reshuffles.
                "prospectusUrl": url,
            })
    return records


def compute_status(rec: dict, today: str) -> str:
    open_d = rec.get("offerOpenDate")
    close_d = rec.get("offerCloseDate") or rec.get("auctionDate")
    settle_d = rec.get("settlementDate")
    if settle_d and today > settle_d:
        return "settled"
    if close_d and today > close_d:
        return "closed"
    if open_d and close_d and open_d <= today <= close_d:
        return "open"
    return "upcoming"


def keys_of(rec: dict) -> set:
    """The auctions a record describes, as (code, auctionDate) pairs.

    Hand-written history writes several bonds into one issueCode string, so one
    record can describe several auctions; every code found in the string
    counts. That is what lets a scraped per-bond record find and replace the
    hand-written line about the same sale.
    """
    codes = re.findall(r"(?:FXD|IFB|SDB)\s?\d\s?/\s?\d{4}\s?/\s?\d+(?:\.\d+)?",
                       rec.get("issueCode", ""), re.I)
    date = rec.get("auctionDate", "")
    return {(normalise_code(c), date) for c in codes}


def merge(existing: list, scraped: list, today: str) -> list:
    """Scraped records join or replace; existing records never simply vanish."""
    scraped_keys = set()
    for s in scraped:
        scraped_keys |= keys_of(s)

    kept = []
    for old in existing:
        if keys_of(old) & scraped_keys:
            # A real prospectus now describes this auction, bond by bond.
            continue
        if TBA_RE.search(old.get("issueCode", "")):
            covered = any(
                old.get("offerOpenDate", "9999") <= s.get("auctionDate", "")
                <= old.get("offerCloseDate", "0000")
                for s in scraped
            )
            if covered:
                print("[calendar] placeholder superseded by a real prospectus")
                continue
        kept.append(old)

    merged = kept + scraped
    for rec in merged:
        rec["status"] = compute_status(rec, today)
    merged.sort(key=lambda r: r.get("auctionDate", ""), reverse=True)
    return merged


def main() -> None:
    path = DATA_DIR / "auctions.json"
    try:
        existing = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        existing = []

    docs = fetch_prospectus_texts()
    scraped = scraped_records(docs)
    today = datetime.now(timezone.utc).date().isoformat()

    if not scraped:
        # Still recompute statuses — dates keep moving even when CBK is quiet,
        # and a hand-typed "upcoming" should not outlive its own settlement.
        changed = False
        for rec in existing:
            new = compute_status(rec, today)
            if rec.get("status") != new:
                rec["status"] = new
                changed = True
        if changed:
            path.write_text(json.dumps(existing, indent=2))
            print(f"[calendar] no new prospectuses; refreshed statuses only")
        else:
            print(f"[calendar] no new prospectuses and nothing stale — unchanged")
        return

    merged = merge(existing, scraped, today)
    path.write_text(json.dumps(merged, indent=2))
    future = [r for r in merged
              if r.get("auctionDate", "") > today and not TBA_RE.search(r.get("issueCode", ""))]
    print(f"[calendar] wrote {len(merged)} records "
          f"({len(scraped)} scraped this run, {len(future)} future named auction(s) "
          f"for the ledger)")


if __name__ == "__main__":
    main()
