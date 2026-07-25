"""Shared helpers for Mwangaza Yield scrapers.

Contract: each scraper writes a JSON array to public/data/<name>.json.
On ANY failure the scraper exits non-zero WITHOUT touching the existing
file — stale-but-valid data always beats empty data. CI surfaces the
failure; the app keeps serving the last good dataset.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "public" / "data"

# ---------------------------------------------------------------------------
# Issue codes
#
# Three files independently reimplemented this and all three assumed the tenor
# was a whole number of years. It usually is — and then CBK issued
# IFB1/2023/6.5 and IFB1/2024/8.5. Those codes matched as "6" and "8", so the
# auction results never joined the securities register and two TAX-FREE
# infrastructure bonds stayed invisible in an app whose whole argument is that
# tax-free infrastructure bonds are the best deal available to a Kenyan retail
# investor. The failure was silent: they simply appeared in the "no auction
# result parsed yet" list alongside genuine gaps.
#
# One definition, imported everywhere, so the next surprise only has to be
# handled once.
# ---------------------------------------------------------------------------
CODE_RE = re.compile(r"^([A-Z]+\d*)/(\d{4})/(\d{1,3}(?:\.\d+)?)$")


def normalise_issue_code(code: str) -> str:
    """Canonical form: FXD1/2022/10 -> FXD1/2022/010, IFB1/2023/6.5 -> IFB1/2023/006.5.

    The integer part is zero-padded so codes sort correctly and so the two
    spellings CBK uses for the same bond compare equal. Any fractional part is
    preserved exactly — rounding it would merge 6.5-year and 6-year bonds.
    """
    m = CODE_RE.match(code.strip().upper().replace(" ", ""))
    if not m:
        return code.strip().upper()
    family, year, tenor = m.groups()
    whole, _, frac = tenor.partition(".")
    return f"{family}/{year}/{int(whole):03d}" + (f".{frac}" if frac else "")


def display_issue_code(code: str) -> str:
    """FXD1/2022/010 -> FXD1/2022/10, which is how CBK writes it to humans."""
    m = CODE_RE.match(code)
    if not m:
        return code
    family, year, tenor = m.groups()
    whole, _, frac = tenor.partition(".")
    return f"{family}/{year}/{int(whole)}" + (f".{frac}" if frac else "")


def tenor_years(code: str) -> float | None:
    """The ISSUED tenor from the code — never derived from the dates.

    FXD1/2022/10 spans 9.97 real years and is still taxed as a ten-year bond,
    because Kenyan withholding tax keys on what was issued, not on what elapsed.
    Returns a float so 6.5 survives; callers that want a label should use int()
    only when the value is whole.
    """
    m = CODE_RE.match(normalise_issue_code(code))
    return float(m.group(3)) if m else None


def write_dataset(name: str, records: list) -> None:
    if not records:
        print(f"[{name}] no records extracted — keeping existing file", file=sys.stderr)
        sys.exit(1)
    path = DATA_DIR / f"{name}.json"
    path.write_text(json.dumps(records, indent=2))
    meta = DATA_DIR / "meta.json"
    meta.write_text(json.dumps({
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "note": "Auto-refreshed by backend/scrapers via CI.",
    }, indent=2))
    print(f"[{name}] wrote {len(records)} records to {path}")
