"""Parse CBK treasury bond prospectus PDFs into auctions.json records.

Usage: python cbk_parser.py <prospectus.pdf> [<more.pdf> ...]

CBK PDFs are unstructured and reformat without notice; every extraction is
regex-based with explicit failure. Always eyeball the output diff before it
ships — CI commits data changes as a reviewable diff, never silently.
"""
import re
import sys
from datetime import datetime

import pdfplumber

from common import write_dataset

DATE_PATTERNS = {
    "offerOpenDate": r"(?:Period of Sale|Offer Opens?)[\s:]*?(\d{1,2}[/\s]\w+[/\s]\d{4})",
    "offerCloseDate": r"(?:Offer Closes?|Closing Date)[\s:]*?(\d{1,2}[/\s]\w+[/\s]\d{4})",
    "auctionDate": r"Auction Date[\s:]*?(\d{1,2}[/\s]\w+[/\s]\d{4})",
    "settlementDate": r"(?:Value|Settlement) Date[\s:]*?(\d{1,2}[/\s]\w+[/\s]\d{4})",
}
ISSUE_RE = re.compile(r"\b((?:FXD|IFB|SDB)\s?\d/\d{4}/\d+(?:\.\d+)?)\b")
AMOUNT_RE = re.compile(r"Kshs?\.?\s*([\d,]+(?:\.\d+)?)\s*(Billion|Million)", re.I)
COUPON_RE = re.compile(r"(?:Coupon|Interest)\s*Rate[\s:]*?([\d.]+)\s*%", re.I)


def parse_date(raw: str) -> str:
    raw = raw.replace("/", " ").strip()
    for fmt in ("%d %B %Y", "%d %b %Y", "%d %m %Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"unparseable date: {raw!r}")


def parse_prospectus(pdf_path: str) -> dict:
    with pdfplumber.open(pdf_path) as pdf:
        text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    issue = ISSUE_RE.search(text)
    if not issue:
        raise ValueError(f"{pdf_path}: no issue code found")
    code = re.sub(r"\s", "", issue.group(1))
    category = code.split("1")[0].rstrip("0123456789")
    tenor = float(code.rsplit("/", 1)[1])

    rec = {
        "id": f"auc-{code.replace('/', '-').lower()}",
        "issueCode": code,
        "bondName": f"{tenor:g}-Year {'Infrastructure' if code.startswith('IFB') else 'Fixed Coupon'} Bond",
        "category": code[:3],
        "tenorYears": tenor,
        "prospectusUrl": "https://www.centralbank.go.ke/securities/treasury-bonds/",
        "status": "upcoming",
    }
    for field, pattern in DATE_PATTERNS.items():
        m = re.search(pattern, text, re.I)
        if not m:
            raise ValueError(f"{pdf_path}: missing {field}")
        rec[field] = parse_date(m.group(1))

    amt = AMOUNT_RE.search(text)
    if amt:
        value = float(amt.group(1).replace(",", ""))
        rec["amountOfferedKES"] = value * (1e9 if amt.group(2).lower() == "billion" else 1e6)
    else:
        rec["amountOfferedKES"] = 0

    coupon = COUPON_RE.search(text)
    rec["couponRate"] = float(coupon.group(1)) if coupon else None

    today = datetime.now().date().isoformat()
    if rec["offerOpenDate"] <= today <= rec["offerCloseDate"]:
        rec["status"] = "open"
    elif today > rec["offerCloseDate"]:
        rec["status"] = "closed"
    return rec


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    write_dataset("auctions", [parse_prospectus(p) for p in sys.argv[1:]])
