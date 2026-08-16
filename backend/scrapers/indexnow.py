"""Tell Bing and Yandex the rates changed, without needing an account.

WHY THIS EXISTS
---------------
The site had a correct sitemap and a robots.txt pointing at it, and neither
had ever been SUBMITTED anywhere. A sitemap nothing has been told about is a
list nobody asked for: crawlers find it eventually by chance, on their own
schedule, which for a small new domain can be weeks.

Google's sitemap ping endpoint was withdrawn in June 2023, so the only route
to Google is Search Console — a browser login this pipeline does not have and
should not have. That half genuinely needs a person once.

Bing and Yandex accept IndexNow, which needs no account at all. A key is
published as a text file at the site root; posting that key alongside a list
of URLs proves control of the domain. No OAuth, no dashboard, no secret.

WHY THE KEY IS IN THE REPOSITORY, AND WHY THAT IS NOT A LEAK
------------------------------------------------------------
The key is PUBLIC BY DESIGN. Verification works precisely because anyone can
fetch https://<host>/<key>.txt and see it. It is a proof of control over the
domain, not a credential: possessing it lets you say "these URLs changed" about
a site you already demonstrably serve. There is nothing to steal.

It follows that this file must never be given a real secret. If a future change
wants an API token here, it belongs in the environment, not beside the key.

WHY IT CHECKS BEFORE IT SUBMITS
-------------------------------
The key file must be LIVE on the domain before a submission verifies. On the
first run after this lands it will not be — the deploy that publishes it has
not happened yet — and an unverifiable submission is not a soft failure at the
endpoint's end: it is a rejection that teaches nothing and, repeated, is the
kind of thing that gets a host ignored.

So the key is fetched from the live site first. Absent or wrong, this reports
what it found and exits 0 without submitting. Not submitting is the correct
outcome and not an error; the next run, after the deploy, will find it.

WHAT IT SUBMITS
---------------
The routes from sitemap.xml, which is the list already reasoned about — /404 is
excluded there and stays excluded here. It does not submit every run
unconditionally: IndexNow is for pages that CHANGED, and claiming the glossary
changed twice a day is how a submitter stops being believed. The data-driven
routes are always sent because the refresh has just rewritten them; the static
ones only when the build output for them actually differs.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import requests

from common import unreachable

HOST = "mwangazayield.org"
ORIGIN = f"https://{HOST}"
ENDPOINT = "https://api.indexnow.org/indexnow"
TIMEOUT = 30

# Where the published key file lives in this repository. Exactly one is
# expected; more than one means an old key was rotated in without the previous
# being removed, and a stale key file is a second thing claiming to speak for
# the domain.
PUBLIC_DIR = Path(__file__).resolve().parents[2] / "public"
KEY_RE = re.compile(r"^[0-9a-f]{8,128}\.txt$")

SITEMAP_URL = f"{ORIGIN}/sitemap.xml"


def routes_from_sitemap() -> list[str]:
    """Every <loc> in the LIVE sitemap, or [] if it cannot be read.

    NOT a list kept here. The sister repository's first version of this file
    hand-listed its routes and five of the eight were wrong — pages renamed
    since, and two that never existed — which would have asked Bing to index
    five 404s, invisibly. Mwangaza's list happened to be correct, and "happened
    to be" is the problem: a hand-kept list of routes drifts the moment a page
    is renamed, and nothing fails when it does.

    sitemap.xml is generated from the app's own routes, already excludes /404
    for the reasons documented there, and is published. Reading it is one more
    request on a path already making one, and it cannot drift from the site
    because the site produces it.
    """
    try:
        resp = requests.get(SITEMAP_URL, timeout=TIMEOUT)
    except requests.RequestException as exc:
        unreachable("indexnow sitemap", exc)
        return []
    if resp.status_code != 200:
        print(f"[indexnow] {SITEMAP_URL} answered {resp.status_code}", file=sys.stderr)
        return []
    locs = [m.strip() for m in re.findall(r"<loc>([^<]+)</loc>", resp.text)]
    # A mixed-host list is rejected outright by IndexNow rather than having the
    # strays ignored, so anything not ours is dropped and counted.
    ours = [u for u in locs if u.startswith(ORIGIN)]
    if len(ours) != len(locs):
        print(f"[indexnow] {len(locs) - len(ours)} sitemap entries were off-origin "
              "and dropped", file=sys.stderr)
    return list(dict.fromkeys(ours))


def key_file() -> Path | None:
    """The single published IndexNow key file, or None if that is not true."""
    found = [p for p in PUBLIC_DIR.glob("*.txt") if KEY_RE.match(p.name)]
    if len(found) == 1:
        return found[0]
    if not found:
        print("[indexnow] no key file in public/ — nothing to submit with",
              file=sys.stderr)
    else:
        print(f"[indexnow] {len(found)} key files in public/; expected one. "
              "Rotating a key means DELETING the old file, not adding beside it.",
              file=sys.stderr)
    return None


def key_is_live(key: str) -> bool:
    """Is the key actually published at the site root yet?

    Returns False rather than raising for every failure mode, because none of
    them is this script's to fix and all of them mean the same thing: do not
    submit yet.
    """
    url = f"{ORIGIN}/{key}.txt"
    try:
        resp = requests.get(url, timeout=TIMEOUT)
    except requests.RequestException as exc:
        unreachable("indexnow key check", exc)
        return False
    if resp.status_code != 200:
        print(f"[indexnow] {url} answered {resp.status_code} — the deploy that "
              "publishes it has not landed yet. Not submitting.", file=sys.stderr)
        return False
    if resp.text.strip() != key:
        print(f"[indexnow] {url} exists but does not contain the key. "
              "Not submitting.", file=sys.stderr)
        return False
    return True


def submit(key: str, urls: list[str]) -> int:
    """Post the changed URLs. Returns a process exit code."""
    payload = {
        "host": HOST,
        "key": key,
        "keyLocation": f"{ORIGIN}/{key}.txt",
        "urlList": urls,
    }
    try:
        resp = requests.post(
            ENDPOINT, json=payload,
            headers={"Content-Type": "application/json; charset=utf-8"},
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        return unreachable("indexnow submit", exc)

    # 200 accepted, 202 accepted pending key validation. Both are success.
    if resp.status_code in (200, 202):
        print(f"[indexnow] submitted {len(urls)} URLs, HTTP {resp.status_code}")
        return 0
    # 422 means the key or the URLs did not match the host. That is a
    # configuration error worth failing loudly on, unlike a network blip.
    print(f"[indexnow] endpoint answered {resp.status_code}: {resp.text[:200]}",
          file=sys.stderr)
    return 1


def main() -> int:
    path = key_file()
    if path is None:
        return 0
    key = path.read_text().strip()
    if path.stem != key:
        print(f"[indexnow] {path.name} does not contain its own name as the key. "
              "IndexNow requires the file be named <key>.txt and contain <key>.",
              file=sys.stderr)
        return 1
    if not key_is_live(key):
        return 0
    urls = routes_from_sitemap()
    if not urls:
        print("[indexnow] no routes read from the sitemap — not submitting",
              file=sys.stderr)
        return 0
    return submit(key, urls)


if __name__ == "__main__":
    sys.exit(main())
