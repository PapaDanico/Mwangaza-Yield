"""Shared helpers for Mwangaza Yield scrapers.

Contract: each scraper writes a JSON array to public/data/<name>.json.
On ANY failure the scraper exits non-zero WITHOUT touching the existing
file — stale-but-valid data always beats empty data. CI surfaces the
failure; the app keeps serving the last good dataset.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "public" / "data"


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
