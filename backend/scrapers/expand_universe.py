"""Expand bonds.json from the 9 we hand-curated to every bond we can price.

Two sources, each authoritative for different facts, neither sufficient alone:

  * **The securities register** (backend/reference/dhowcsd-securities.csv) knows
    which bonds EXIST and their ISIN, issue date and maturity date. It publishes
    no coupon.
  * **Auction results** (public/data/auction-results.json) know the COUPON and
    what the auction cleared at. They do not enumerate the universe.

Joined on the issue code, they give a complete, priceable bond.

THE RULE THIS FILE EXISTS TO ENFORCE
------------------------------------
**A bond without a coupon rate is not added.** Without a coupon there is no
cash-flow schedule, so no yield, no accrued interest and no settlement cost —
every number the app exists to produce. Listing such a bond would put a row in
front of someone that silently cannot be calculated, or worse, invite a
placeholder coupon that looks like a real one. Coverage is not the goal;
coverage of bonds we can honestly price is the goal.

The nine existing bonds are preserved as-is. They already carry
register-corrected identity plus hand-verified coupons and yields, which is
better than anything derived here.
"""
import csv
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

from common import CODE_RE, DATA_DIR, display_issue_code, normalise_issue_code, tenor_years

REGISTER = Path(__file__).resolve().parents[1] / "reference" / "dhowcsd-securities.csv"

# The padding and fractional-tenor rules live in common, because this file, the
# auction parser and the register reconciler each had their own copy and all
# three assumed a whole number of years.
normalise = normalise_issue_code
display_code = display_issue_code


def load_register(today: date) -> dict:
    with REGISTER.open(encoding="utf-8-sig") as fh:
        rows = [r for r in csv.DictReader(fh) if r.get("ISIN", "").strip()]
    out = {}
    for r in rows:
        if r.get("Type", "").strip() != "Treasury Bonds":
            continue
        maturity = datetime.strptime(r["Maturity date"].strip(), "%d %b %Y").date()
        if maturity <= today:
            continue  # already redeemed; nobody can buy it
        out[normalise(r["Issue Number"])] = {
            "isin": r["ISIN"].strip(),
            "issueDate": datetime.strptime(r["Issue date"].strip(), "%d %b %Y").date().isoformat(),
            "maturityDate": maturity.isoformat(),
        }
    return out


def load_auction_facts() -> tuple:
    """The newest auction per code, plus EVERY auction per code.

    Both are needed because they answer different questions: the clearing
    yield belongs to the latest auction, while the coupon belongs to the bond
    and is cross-checked across all of them.
    """
    path = DATA_DIR / "auction-results.json"
    if not path.exists():
        print(f"[expand] {path} missing — run auction_results.py first", file=sys.stderr)
        return {}, {}
    facts: dict = {}
    every: dict = {}
    for rec in json.loads(path.read_text()):
        code = normalise(rec["issueCode"])
        every.setdefault(code, []).append(rec)
        current = facts.get(code)
        # Prefer the most recent auction: a reopened bond keeps its coupon but
        # its clearing yield moves. On the SAME date CBK sometimes publishes two
        # results files for one bond (a tap sale alongside the main auction), and
        # one may carry no clearing rate — so on a tie prefer the fuller record
        # rather than whichever happened to be read last.
        if current:
            newer = (rec.get("auctionDate") or "") > (current.get("auctionDate") or "")
            same_day = (rec.get("auctionDate") or "") == (current.get("auctionDate") or "")
            fuller = same_day and rec.get("weightedAverageRate") and not current.get("weightedAverageRate")
            if not (newer or fuller):
                continue
        facts[code] = rec
    return facts, every


def coupon_for(code: str, records: list) -> float | None:
    """The bond's coupon, taken from every auction that ever reported it.

    A fixed-coupon bond has ONE coupon for its whole life — a reopening sells
    more of the same security and inherits it. So the coupon is a property of
    the BOND, while the clearing yield is a property of an AUCTION, and reading
    both off "the most recent record" conflates them.

    That conflation shipped a wrong number. FXD1/2012/15 reported 11.0 in June
    2019 and 1.0 in December 2020, the latter being "11.000" with its leading
    digit lost to CBK's split-digit rendering. Preferring the newest record
    published the 1.0 — a 1% coupon on a fifteen-year Kenyan government bond.

    Disagreement is itself the signal, so this takes the value the auctions
    agree on most often rather than the latest one. Ties break toward the
    larger, because the failure mode is losing a leading digit, never gaining
    one.
    """
    seen = [r["couponRate"] for r in records if r.get("couponRate") is not None]
    if not seen:
        return None
    tally: dict = {}
    for value in seen:
        tally[value] = tally.get(value, 0) + 1
    best = max(tally.items(), key=lambda kv: (kv[1], kv[0]))
    if len(tally) > 1:
        print(f"[expand] {code}: auctions disagree on the coupon {sorted(tally)} "
              f"— taking {best[0]}", file=sys.stderr)
    return best[0]


def build_bond(code: str, reg: dict, auction: dict,
               coupon: float | None = None) -> dict | None:
    if coupon is None:
        coupon = auction.get("couponRate")
    if coupon is None:
        return None  # see the module docstring — this is the whole rule

    m = CODE_RE.match(code)
    if not m:
        return None
    family = m.group(1)
    tenor = tenor_years(code)  # the ISSUED tenor, which is what WHT keys on
    if tenor is None:
        return None
    category = "IFB" if family.startswith("IFB") else ("SDB" if family.startswith("SDB") else "FXD")
    # 10.0 should read "10-Year", but 6.5 must stay "6.5-Year" — CBK issues both.
    tenor_label = f"{tenor:g}"

    # The auction's weighted average accepted rate is the yield the market
    # actually paid. Fall back to the coupon only when a bond priced at par.
    ytm = auction.get("weightedAverageRate") or auction.get("marketWeightedAverageRate") or coupon

    return {
        "isin": reg["isin"],
        "issueCode": display_code(code),
        "name": f"{tenor_label}-Year {'Infrastructure' if category == 'IFB' else 'Fixed Coupon'} Bond",
        "category": category,
        "issueDate": reg["issueDate"],
        "maturityDate": reg["maturityDate"],
        "tenorYears": tenor,
        "couponRate": round(coupon, 4),
        "couponFrequencyPerYear": 2,
        "ytmGross": round(ytm, 4),
        "minInvestmentKES": 50_000,
        "taxExempt": category == "IFB",
        "ytmAsOf": auction.get("auctionDate"),
        "source": auction.get("sourceUrl"),
    }


def main() -> None:
    today = date.today()
    register = load_register(today)
    facts, every = load_auction_facts()
    print(f"[expand] {len(register)} outstanding bond(s) in the register, "
          f"{len(facts)} with auction facts", file=sys.stderr)

    path = DATA_DIR / "bonds.json"
    existing = json.loads(path.read_text())
    have = {normalise(b["issueCode"]) for b in existing}

    # Correct bonds we listed on an earlier run. Without this the file only
    # ever grows: a value captured under a looser guard stays forever, because
    # nothing revisits a bond once it is in the list. That is how a 1% coupon
    # on a fifteen-year government bond survived into production — the record it
    # came from was later rejected, and the listing never noticed.
    for bond in existing:
        code = normalise(bond["issueCode"])
        agreed = coupon_for(code, every.get(code, []))
        if agreed is None or agreed == bond.get("couponRate"):
            continue
        print(f"[expand] {bond['issueCode']}: correcting coupon "
              f"{bond.get('couponRate')} -> {agreed}", file=sys.stderr)
        # The yield was solved from the wrong coupon, so it is no better.
        if bond.get("ytmGross") == bond.get("couponRate"):
            bond["ytmGross"] = agreed
        bond["couponRate"] = agreed

    added, skipped_no_coupon = [], []
    for code, reg in sorted(register.items()):
        if code in have:
            continue
        auction = facts.get(code)
        if not auction:
            skipped_no_coupon.append(code)
            continue
        bond = build_bond(code, reg, auction, coupon_for(code, every.get(code, [])))
        if bond is None:
            skipped_no_coupon.append(code)
            continue
        added.append(bond)

    print(f"[expand] adding {len(added)}; {len(skipped_no_coupon)} outstanding bond(s) "
          f"have no coupon rate yet and are deliberately NOT listed", file=sys.stderr)
    # Name them. A count tells you coverage is incomplete; the names tell you
    # WHICH auctions still need reading, which is the actionable half.
    for code in sorted(skipped_no_coupon)[:25]:
        print(f"[expand]  - {code} (no auction result parsed yet)", file=sys.stderr)
    if len(skipped_no_coupon) > 25:
        print(f"[expand]  - ... and {len(skipped_no_coupon) - 25} more", file=sys.stderr)
    for b in added:
        print(f"[expand]  + {b['issueCode']:<16} coupon {b['couponRate']}%  "
              f"ytm {b['ytmGross']}%  matures {b['maturityDate']}", file=sys.stderr)

    merged = existing + added
    merged.sort(key=lambda b: (b["maturityDate"], b["issueCode"]))
    path.write_text(json.dumps(merged, indent=2) + "\n")
    print(f"[expand] bonds.json now lists {len(merged)} bond(s)", file=sys.stderr)


if __name__ == "__main__":
    main()
