"""Tests for the calendar merge — the part of refresh_calendar that can go wrong.

Fetching is proven in CI against the live listing; the merge is proven here,
against the SHIPPED auctions.json shapes: the hand-written multi-bond history
lines and the TBA placeholder are copied from the real file, because those are
exactly the records a wrong merge would destroy.
"""
import sys

from refresh_calendar import compute_status, keys_of, merge

failures = []


def check(label, actual, expected):
    if actual != expected:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")
    else:
        print(f"  ok  {label}")


# The real hand-written shapes from the shipped file.
TBA = {
    "id": "auc-2026-08-window",
    "issueCode": "TBA — August 2026",
    "offerOpenDate": "2026-08-03", "offerCloseDate": "2026-08-19",
    "auctionDate": "2026-08-19", "settlementDate": "2026-08-24",
    "status": "upcoming",
}
HISTORY = {
    "id": "auc-jul-2026",
    "issueCode": "FXD1/2022/10 + FXD1/2021/20 + FXD1/2026/30",
    "auctionDate": "2026-07-08", "settlementDate": "2026-07-13",
    "status": "settled",
}


def scraped(code, auction, settle="2026-08-25"):
    return {"id": f"auc-{code.replace('/', '-').lower()}-{auction}", "issueCode": code,
            "offerOpenDate": "2026-08-01", "offerCloseDate": auction,
            "auctionDate": auction, "settlementDate": settle, "status": "upcoming"}


def main():
    print("keys_of, which is what lets per-bond records find prose history")
    check("a per-bond record has one key",
          keys_of(scraped("FXD1/2021/025", "2026-08-13")),
          {("FXD1/2021/025", "2026-08-13")})
    check("a hand-written multi-bond line has one key per bond",
          keys_of(HISTORY),
          {("FXD1/2022/010", "2026-07-08"), ("FXD1/2021/020", "2026-07-08"),
           ("FXD1/2026/030", "2026-07-08")})
    check("a TBA placeholder has no keys", keys_of(TBA), set())

    print("\nstatus recomputation")
    check("past settlement is settled", compute_status(HISTORY, "2026-07-27"), "settled")
    check("between close and settlement is closed",
          compute_status(HISTORY, "2026-07-10"), "closed")
    check("inside the sale window is open",
          compute_status(scraped("FXD1/2021/025", "2026-08-13"), "2026-08-05"), "open")
    check("before the window is upcoming",
          compute_status(scraped("FXD1/2021/025", "2026-08-13"), "2026-07-27"), "upcoming")

    print("\nthe merge itself")
    # A real August prospectus arrives: two bonds, auction inside the TBA window.
    aug = [scraped("FXD1/2021/025", "2026-08-13"), scraped("IFB1/2024/8.5", "2026-08-13")]
    out = merge([TBA, HISTORY], aug, "2026-07-27")

    check("the placeholder is superseded by the real prospectus",
          any("TBA" in r["issueCode"] for r in out), False)
    check("the hand-written history survives",
          any(r["id"] == "auc-jul-2026" for r in out), True)
    check("both scraped bonds are present",
          sum(1 for r in out if r["auctionDate"] == "2026-08-13"), 2)
    check("newest first", out[0]["auctionDate"], "2026-08-13")
    check("history status stays settled",
          next(r for r in out if r["id"] == "auc-jul-2026")["status"], "settled")

    # The SAME auction re-scraped: the per-bond records replace the prose line
    # rather than duplicating it.
    july = [scraped("FXD1/2022/010", "2026-07-08", "2026-07-13"),
            scraped("FXD1/2021/020", "2026-07-08", "2026-07-13"),
            scraped("FXD1/2026/030", "2026-07-08", "2026-07-13")]
    out2 = merge([TBA, HISTORY], july, "2026-07-27")
    check("re-scraping a hand-written sale replaces it, no duplicate",
          sum(1 for r in out2 if "2026-07-08" == r.get("auctionDate")), 3)
    check("the prose line itself is gone",
          any(r["id"] == "auc-jul-2026" for r in out2), False)
    check("but a placeholder for a DIFFERENT window is untouched",
          any("TBA" in r["issueCode"] for r in out2), True)
    check("and re-scraped July records are settled by now, not 'upcoming'",
          {r["status"] for r in out2 if r["auctionDate"] == "2026-07-08"}, {"settled"})

    # A prospectus for September must NOT supersede an August placeholder.
    sep = [scraped("FXD1/2020/015", "2026-09-10")]
    out3 = merge([TBA], sep, "2026-07-27")
    check("a prospectus outside the window leaves the placeholder alone",
          any("TBA" in r["issueCode"] for r in out3), True)

    # Nothing scraped: merge is never called with [], but the guarantee that
    # matters is that existing records cannot vanish through the merge path.
    out4 = merge([TBA, HISTORY], [], "2026-09-01")
    check("an empty scrape deletes nothing", len(out4), 2)
    check("but statuses still move with the calendar",
          next(r for r in out4 if "TBA" in r["issueCode"])["status"], "settled")

    if failures:
        print(f"\n{len(failures)} FAILURE(S):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll calendar refresh tests passed.")


if __name__ == "__main__":
    main()
