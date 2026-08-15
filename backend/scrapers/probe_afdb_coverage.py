"""Does the AfDB's Kenya portal actually CARRY quarterly GDP — and under what licence?

WHAT THE LAST PROBE SETTLED, AND WHAT IT DID NOT
------------------------------------------------
probe_debt_sources established connectivity: all six AfDB URLs answer 200, and
`/api/1.0/meta/dataset` returns a JSON array — 202 entries for the Kenya portal,
36 for the continental one. The Knoema REST shape is live.

It settled nothing about CONTENT. 202 datasets is not 202 useful datasets, and
"the AfDB publishes Kenyan statistics" is not "the AfDB publishes Kenya's
QUARTERLY GDP". Those are the sentences that get confused when a probe stops at
a 200, which is the failure this file exists to avoid.

It also did NOT confirm the licence. The CC BY 4.0 claim came from a search
result, and the licence markers were absent from the fetched HTML — almost
certainly rendered client-side. A licence read off a search snippet is not a
licence check, and republishing on the strength of one would be exactly the
kind of borrowed confidence this codebase keeps having to unwind.

WHY THIS MATTERS EVEN IF THE ANSWER IS YES
------------------------------------------
The AfDB is an AGGREGATOR. Its Kenyan figures originate with KNBS and the
National Treasury, so republishing from here means republishing a copy of a
copy. lib/provenance.ts is deliberate that the CPI shown today "originates with
KNBS but is READ FROM CBK" — anything sourced here would need the same
treatment, naming the AfDB as the read-from and KNBS as the originator. A
second-hand series is not disqualifying, but it is a downgrade against CBK's
first-hand tables and should be chosen with that priced in, not by accident.

THE SCHEMA IS NOT ASSUMED
-------------------------
Knoema's metadata field names are not documented by the AfDB. So this prints
the KEY SET of the first record before filtering on anything, and falls back to
scanning the whole JSON blob when an expected field is missing. A probe that
hard-coded `dataset["name"]`, got a KeyError, and reported "no GDP data" would
be worse than useless: it would answer a question it never asked, and close it.
"""
import json
import sys

import requests

TIMEOUT = 45
UA = {"User-Agent": "mwangaza-yield-probe/1.0 (+https://mwangazayield.org)"}

KENYA_META = "https://kenya.opendataforafrica.org/api/1.0/meta/dataset"

# What we are actually hunting, in priority order. Quarterly GDP first: it is
# the thing KNBS publishes that we cannot reach, and the thing a debt ratio
# needs a denominator from.
WANTED = ("gdp", "gross domestic", "national account", "debt", "quarterly")


def head(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def get(url: str):
    try:
        return requests.get(url, timeout=TIMEOUT, headers=UA), None
    except Exception as exc:  # noqa: BLE001 — the exception IS the finding
        return None, f"{type(exc).__name__}: {exc}"


def text_of(record) -> str:
    """Every string in a record, flattened — used because the field names are
    not ours to predict. Matching on the whole blob cannot miss a title that
    lives under a key we did not guess."""
    return json.dumps(record, default=str).lower()


def licence_pages_check() -> None:
    head("LICENCE (A). The licence, read from the pages that actually govern it")
    # The previous run of this probe ended with "read the terms in a browser
    # and record where". This is the where. Two candidates, because the Kenya
    # portal is Knoema-hosted for the AfDB and either could carry the notice:
    # the AfDB's own data portal terms, and the Kenya portal's terms page.
    #
    # A search summary asserts these say CC BY 4.0 with the attribution format
    # "The African Development Bank: Dataset name: Dataset link". A search
    # summary is not a licence. This fetches the pages and looks for the
    # markers, so the answer in the log comes from the publisher.
    #
    # Absence of a marker is NOT permission. If these render client-side too,
    # the verdict stays UNVERIFIED and someone has to ask the AfDB directly.
    licence_pages = (
        "https://projectsportal.afdb.org/dataportal/home/termsConditions",
        "https://kenya.opendataforafrica.org/termsofuse",
        "https://dataportal.opendataforafrica.org/termsofuse",
    )
    MARKERS = (
        "creativecommons.org/licenses/by/4.0",
        "creative commons attribution 4.0",
        "cc-by 4.0",
        "cc by 4.0",
    )
    confirmed_on = []
    unreachable = []
    read_without_markers = []
    for url in licence_pages:
        resp, err = get(url)
        if err or resp is None:
            print(f"  {url}\n    unreachable: {err}")
            unreachable.append(url)
            continue
        body = (resp.text or "").lower()
        hits = [m for m in MARKERS if m in body]
        attribution = "dataset name: dataset link" in body
        print(f"  {url}\n    HTTP {resp.status_code}, {len(body)} chars"
              f", CC BY markers: {hits or 'none'}"
              f", attribution format present: {attribution}")
        if resp.status_code == 200 and hits:
            confirmed_on.append(url)
        elif resp.status_code == 200:
            read_without_markers.append(url)
        else:
            unreachable.append(url)

    if confirmed_on:
        print("\nverdict: CC BY 4.0 CONFIRMED from the publisher's own page(s):")
        for u in confirmed_on:
            print(f"         {u}")
        print("         Record this URL and the date in lib/provenance.ts before")
        print("         republishing anything — the licence is a claim we make too.")
    elif read_without_markers:
        print("\nverdict: UNVERIFIED — pages were READ and carry no CC BY marker:")
        for u in read_without_markers:
            print(f"         {u}")
        print("         Either they render terms client-side like the portal HTML,")
        print("         or the wording differs from what a search summary claimed.")
        print("         Do not republish on this basis.")
    else:
        print("\nverdict: NOT ANSWERED — no terms page could be fetched at all.")
        print("         This says nothing about the AfDB's licence. It is a fact")
        print("         about this run's network, and the two must not be confused:")
        print("         fiscal-context.json records PDMO being written up as")
        print("         geo-blocked while it answered 200 on three consecutive runs")
        print("         from a CI runner. Re-run this job where egress is real.")
        for u in unreachable:
            print(f"         unreached: {u}")


def main() -> int:
    # The licence question lives on different hosts from the coverage
    # question, so it is asked FIRST and unconditionally. It used to sit at
    # step 4, behind three early returns: one 403 on the Knoema host and the
    # licence answer — the one that actually gates republishing — was never
    # printed at all. That is the same "one hung host away from never being
    # read" failure the workflow guards against between jobs, reproduced
    # inside a single script.
    licence_pages_check()

    head("1. What does the Kenya portal's dataset list actually contain?")
    resp, err = get(KENYA_META)
    if err:
        print(f"FAILED : {err}")
        print("verdict: cannot answer the coverage question this run. Not a finding")
        print("         about the AfDB's holdings — only about this attempt.")
        return 0
    print(f"status : {resp.status_code}, {len(resp.content)} bytes")
    if resp.status_code != 200:
        print("verdict: no list, no coverage answer.")
        return 0
    try:
        records = resp.json()
    except json.JSONDecodeError:
        print("verdict: 200 but not JSON — the endpoint shape has changed.")
        return 0
    if not isinstance(records, list) or not records:
        print(f"verdict: expected a non-empty array, got {type(records).__name__}.")
        return 0

    print(f"records: {len(records)}")
    # Learn the schema rather than assume it.
    first = records[0]
    if isinstance(first, dict):
        print(f"keys   : {sorted(first)[:25]}")
        print(f"sample : {json.dumps(first, default=str)[:600]}")

    head("2. Which of them mention GDP, national accounts, or debt?")
    hits = []
    for rec in records:
        blob = text_of(rec)
        matched = [w for w in WANTED if w in blob]
        if matched:
            hits.append((rec, matched))
    print(f"matching records: {len(hits)} of {len(records)}")
    if not hits:
        print("verdict: the Kenya portal lists nothing matching. 202 datasets, none")
        print("         of them the one we came for — which is a real answer.")

    for rec, matched in hits[:25]:
        if isinstance(rec, dict):
            # Print whichever human-readable fields exist, without insisting.
            label = next(
                (str(rec[k]) for k in ("name", "Name", "title", "Title", "id", "Id")
                 if k in rec and rec[k]),
                "(unnamed)",
            )
            extras = {
                k: rec[k]
                for k in ("frequency", "Frequency", "source", "Source", "updatedOn",
                          "UpdatedOn", "lastUpdated", "publicationDate")
                if k in rec and rec[k]
            }
            print(f"\n  - {label[:110]}")
            print(f"    matched: {matched}")
            if extras:
                print(f"    fields : {json.dumps(extras, default=str)[:300]}")
        else:
            print(f"\n  - {str(rec)[:150]}  matched={matched}")

    head("3. Is any of it QUARTERLY, which is the whole question?")
    quarterly = [
        (rec, m) for rec, m in hits
        if "quarter" in text_of(rec) and ("gdp" in text_of(rec) or "gross domestic" in text_of(rec))
    ]
    print(f"records mentioning BOTH quarterly and GDP: {len(quarterly)}")
    for rec, _ in quarterly[:10]:
        print(f"  - {json.dumps(rec, default=str)[:400]}")
    if not quarterly:
        print("verdict: annual aggregates at best. That adds nothing the World Bank")
        print("         series does not already give us, and the World Bank is")
        print("         first-hand-ish where this is a copy of a copy.")

    head("4b. The licence, read from the API rather than a search snippet")
    # The HTML pages hid it (client-side rendering). If the metadata carries a
    # licence or attribution field, that is the authoritative place to find it.
    licence_keys = set()
    for rec in records[:50]:
        if isinstance(rec, dict):
            for k in rec:
                if any(t in k.lower() for t in ("licen", "attribut", "terms", "rights", "copyright")):
                    licence_keys.add(k)
    if licence_keys:
        print(f"licence-ish fields present: {sorted(licence_keys)}")
        for rec in records[:5]:
            vals = {k: rec.get(k) for k in sorted(licence_keys)}
            print(f"  {json.dumps(vals, default=str)[:300]}")
    else:
        print("no licence field in the dataset metadata.")
        print("verdict: the CC BY 4.0 claim remains UNVERIFIED. It came from a search")
        print("         snippet, the HTML renders its terms client-side, and the API")
        print("         does not carry one. Do not republish on this basis — ask the")
        print("         AfDB, or read the terms in a browser and record where.")

    head("What this does and does not license us to do")
    print(
        "Coverage and permission are separate questions and both must be YES.\n"
        "Even then the AfDB is an AGGREGATOR: its Kenyan figures originate with\n"
        "KNBS and the National Treasury. lib/provenance.ts would need to name the\n"
        "AfDB as the read-from and KNBS as the originator, exactly as it already\n"
        "does for the CPI that comes via CBK. A second-hand series is a downgrade\n"
        "against CBK's first-hand tables — choose it deliberately or not at all."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
