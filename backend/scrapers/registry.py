"""Correct bonds.json against CBK's own securities register.

Source: the Securities list on DhowCSD (https://dhowcsd.centralbank.go.ke/),
CBK's central securities depository. The list sits OUTSIDE the login — it is
published alongside "Create account", not behind it — so this is public
reference data, not anyone's holdings. It carries no account, name or balance.

It is authoritative for three things we were previously guessing at:

    ISIN · issue date · maturity date

Our maturity dates were off by up to 119 days. That is not cosmetic: maturity
drives the cash-flow schedule, so it moves yield to maturity, the coupon
calendar, ladder rungs and every goal projection built on them.

WHAT THIS DELIBERATELY DOES NOT TOUCH
-------------------------------------
**tenorYears.** It is tempting to recompute it as (maturity - issue) / 365.25,
and it is wrong. FXD1/2022/10 works out to 9.97 years that way, which would
flip it from the 10% withholding band to the 15% band and understate its net
yield for every user. The bond is ISSUED as a ten-year bond and taxed as one;
the missing days are settlement and business-day conventions, not a shorter
loan. The issue code carries the legal tenor, so the issue code wins.

**couponRate and ytmGross.** The register does not publish them. They come
from prospectuses and auction results and are left untouched.
"""
import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from common import DATA_DIR, normalise_issue_code

REGISTER = Path(__file__).resolve().parents[1] / "reference" / "dhowcsd-securities.csv"
# The register zero-pads the tenor: our FXD1/2022/10 is its FXD1/2022/010.
# It can also be fractional (IFB1/2023/6.5), which is why the rule lives in
# common rather than being spelled out again here.
normalise = normalise_issue_code


def load_register(path: Path) -> dict:
    with path.open(encoding="utf-8-sig") as fh:
        rows = [r for r in csv.DictReader(fh) if r.get("ISIN", "").strip()]
    out = {}
    for r in rows:
        out[normalise(r["Issue Number"])] = {
            "isin": r["ISIN"].strip(),
            "issueDate": datetime.strptime(r["Issue date"].strip(), "%d %b %Y").date().isoformat(),
            "maturityDate": datetime.strptime(r["Maturity date"].strip(), "%d %b %Y").date().isoformat(),
            "type": r["Type"].strip(),
            "minInvestmentKES": int(r["Individual Nominal Value"].strip().replace(",", "") or 0),
        }
    return out


def reconcile(bonds: list, register: dict) -> tuple:
    """Apply register facts to each bond; return (bonds, changes, unmatched)."""
    changes, unmatched = [], []
    for b in bonds:
        entry = register.get(normalise(b["issueCode"]))
        if not entry:
            unmatched.append(b["issueCode"])
            continue

        # Sanity gate: if the register's dates disagree wildly with the tenor
        # in the issue code, we have matched the wrong security. Skip rather
        # than write a confident error.
        span_years = (
            datetime.fromisoformat(entry["maturityDate"]).date()
            - datetime.fromisoformat(entry["issueDate"]).date()
        ).days / 365.25
        if abs(span_years - b["tenorYears"]) > 1.0:
            print(f"[registry] {b['issueCode']}: register span {span_years:.2f}y vs coded tenor "
                  f"{b['tenorYears']}y — refusing to apply, check the match", file=sys.stderr)
            unmatched.append(b["issueCode"])
            continue

        for field in ("isin", "issueDate", "maturityDate"):
            if b.get(field) != entry[field]:
                changes.append((b["issueCode"], field, b.get(field), entry[field]))
                b[field] = entry[field]
        # minInvestmentKES is NOT taken from the register. Its "Individual
        # Nominal Value" column reads 50,000 for most securities — which
        # matches the known CBK minimum — but 1 for a handful, including
        # IFB1/2018/15. A nominal value of 1 almost certainly denotes the
        # unit denomination rather than the smallest permitted subscription,
        # and writing it through would tell someone they can buy that bond
        # for one shilling. Two plausible readings of a column is not enough
        # to overwrite a user-facing figure, so we leave ours alone.
        # tenorYears is NOT touched either — see the module docstring.
    return bonds, changes, unmatched


def main() -> None:
    if not REGISTER.exists():
        print(f"[registry] no register at {REGISTER} — nothing to reconcile", file=sys.stderr)
        sys.exit(1)

    register = load_register(REGISTER)
    print(f"[registry] {len(register)} securities in the register", file=sys.stderr)

    path = DATA_DIR / "bonds.json"
    bonds = json.loads(path.read_text())
    bonds, changes, unmatched = reconcile(bonds, register)

    for code, field, old, new in changes:
        print(f"[registry] {code}: {field} {old} -> {new}", file=sys.stderr)
    if unmatched:
        print(f"[registry] {len(unmatched)} bond(s) not reconciled: {', '.join(unmatched)}",
              file=sys.stderr)

    if not changes:
        print("[registry] already consistent with the register", file=sys.stderr)
        return

    path.write_text(json.dumps(bonds, indent=2) + "\n")
    print(f"[registry] applied {len(changes)} correction(s) to {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
