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

from common import DATA_DIR

REGISTER = Path(__file__).resolve().parents[1] / "reference" / "dhowcsd-securities.csv"
CODE_RE = re.compile(r"^([A-Z]+\d*)/(\d{4})/(\d+)$")


def normalise(code: str) -> str:
    m = CODE_RE.match(code.strip().upper().replace(" ", ""))
    if not m:
        return code.strip().upper()
    family, year, tenor = m.groups()
    return f"{family}/{year}/{int(tenor):03d}"


def display_code(code: str) -> str:
    """FXD1/2022/010 -> FXD1/2022/10, which is how CBK writes it to humans."""
    m = CODE_RE.match(code)
    return f"{m.group(1)}/{m.group(2)}/{int(m.group(3))}" if m else code


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


def load_auction_facts() -> dict:
    """Newest coupon and clearing rate per issue code."""
    path = DATA_DIR / "auction-results.json"
    if not path.exists():
        print(f"[expand] {path} missing — run auction_results.py first", file=sys.stderr)
        return {}
    facts: dict = {}
    for rec in json.loads(path.read_text()):
        code = normalise(rec["issueCode"])
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
    return facts


def build_bond(code: str, reg: dict, auction: dict) -> dict | None:
    coupon = auction.get("couponRate")
    if coupon is None:
        return None  # see the module docstring — this is the whole rule

    m = CODE_RE.match(code)
    if not m:
        return None
    family, _year, tenor_raw = m.groups()
    tenor = int(tenor_raw)  # the ISSUED tenor, which is what WHT keys on
    category = "IFB" if family.startswith("IFB") else ("SDB" if family.startswith("SDB") else "FXD")

    # The auction's weighted average accepted rate is the yield the market
    # actually paid. Fall back to the coupon only when a bond priced at par.
    ytm = auction.get("weightedAverageRate") or auction.get("marketWeightedAverageRate") or coupon

    return {
        "isin": reg["isin"],
        "issueCode": display_code(code),
        "name": f"{tenor}-Year {'Infrastructure' if category == 'IFB' else 'Fixed Coupon'} Bond",
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
    facts = load_auction_facts()
    print(f"[expand] {len(register)} outstanding bond(s) in the register, "
          f"{len(facts)} with auction facts", file=sys.stderr)

    path = DATA_DIR / "bonds.json"
    existing = json.loads(path.read_text())
    have = {normalise(b["issueCode"]) for b in existing}

    added, skipped_no_coupon = [], []
    for code, reg in sorted(register.items()):
        if code in have:
            continue
        auction = facts.get(code)
        if not auction:
            skipped_no_coupon.append(code)
            continue
        bond = build_bond(code, reg, auction)
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

    if not added:
        print("[expand] nothing to add", file=sys.stderr)
        return

    merged = existing + added
    merged.sort(key=lambda b: (b["maturityDate"], b["issueCode"]))
    path.write_text(json.dumps(merged, indent=2) + "\n")
    print(f"[expand] bonds.json now lists {len(merged)} bond(s)", file=sys.stderr)


if __name__ == "__main__":
    main()
