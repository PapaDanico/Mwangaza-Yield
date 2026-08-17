"""The submitter must refuse to submit more readily than it submits.

WHAT COULD ACTUALLY GO WRONG HERE

Not "it fails to submit" — that costs a day of crawl latency and the next run
fixes it. The failures worth guarding are the ones that keep repeating:

  * Submitting before the key file is live. Every such attempt is a rejection
    that teaches nothing, and a host that keeps sending unverifiable claims is
    a host that stops being believed.
  * A key file whose name and contents disagree. IndexNow requires <key>.txt to
    CONTAIN <key>; a mismatch verifies as forged rather than as a typo.
  * Two key files. A rotated key added beside the old one leaves two artefacts
    claiming to speak for the domain, and the endpoint may honour either.
  * Submitting /404, which the sitemap deliberately excludes.

So most of this asserts that nothing was sent.
"""
import re
import sys
from pathlib import Path

import yaml

import indexnow

FAILURES: list = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


SITEMAP = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://mwangazayield.org/</loc></url>
  <url><loc>https://mwangazayield.org/tbills/</loc></url>
  <url><loc>https://mwangazayield.org/auctions/</loc></url>
  <url><loc>https://mwangazayield.org/tbills/</loc></url>
  <url><loc>https://example.com/not-ours</loc></url>
</urlset>"""


class FakeResp:
    def __init__(self, status=200, text=""):
        self.status_code = status
        self.text = text


def test_the_shipped_key_file_is_well_formed() -> None:
    """The real file in public/, not a fixture."""
    path = indexnow.key_file()
    check(path is not None, "exactly one <hex>.txt key file must exist in public/")
    if path is None:
        return
    key = path.read_text().strip()
    check(path.stem == key,
          f"{path.name} must contain its own name as the key, got {key!r}")
    check(8 <= len(key) <= 128, f"key length {len(key)} outside IndexNow's 8-128")
    check(key.isalnum(), "key must be alphanumeric")


def test_does_not_submit_before_the_key_is_live() -> None:
    """The one that matters most."""
    sent = []
    real_get, real_post = indexnow.requests.get, indexnow.requests.post
    indexnow.requests.get = lambda url, *a, **k: FakeResp(404)
    indexnow.requests.post = lambda *a, **k: sent.append(a) or FakeResp(200)
    try:
        code = indexnow.main()
    finally:
        indexnow.requests.get, indexnow.requests.post = real_get, real_post
    check(not sent, "MUST NOT submit when the key file 404s on the live site")
    check(code == 0, "a not-yet-deployed key is not an error; expected exit 0")


def test_does_not_submit_when_the_key_file_holds_the_wrong_key() -> None:
    sent = []
    real_get, real_post = indexnow.requests.get, indexnow.requests.post
    indexnow.requests.get = lambda url, *a, **k: FakeResp(200, "some other value")
    indexnow.requests.post = lambda *a, **k: sent.append(a) or FakeResp(200)
    try:
        indexnow.main()
    finally:
        indexnow.requests.get, indexnow.requests.post = real_get, real_post
    check(not sent, "MUST NOT submit when the live file contains a different key")


def test_submits_once_the_key_verifies() -> None:
    path = indexnow.key_file()
    if path is None:
        return
    key = path.read_text().strip()
    captured = {}
    real_get, real_post = indexnow.requests.get, indexnow.requests.post
    indexnow.requests.get = lambda url, *a, **k: (
        FakeResp(200, SITEMAP) if "sitemap" in url else FakeResp(200, key)
    )

    def fake_post(url, json=None, **k):
        captured["url"] = url
        captured["payload"] = json
        return FakeResp(200)

    indexnow.requests.post = fake_post
    try:
        code = indexnow.main()
    finally:
        indexnow.requests.get, indexnow.requests.post = real_get, real_post

    check(code == 0, "a verified submission should exit 0")
    payload = captured.get("payload") or {}
    check(payload.get("host") == indexnow.HOST, "payload must name the host")
    check(payload.get("key") == key, "payload must carry the published key")
    check(
        payload.get("keyLocation", "").endswith(f"/{key}.txt"),
        "payload must point at the published key file",
    )
    urls = payload.get("urlList") or []
    check(bool(urls), "something must actually be submitted")
    check(all(u.startswith(indexnow.ORIGIN) for u in urls),
          "every URL must be on our own origin; IndexNow rejects cross-host lists")
    check(not any("/404" in u for u in urls),
          "/404 must never be submitted — the sitemap excludes it for the same reason")
    check(len(set(urls)) == len(urls), "no duplicate URLs")


def test_a_rejected_submission_is_reported_not_swallowed() -> None:
    path = indexnow.key_file()
    if path is None:
        return
    key = path.read_text().strip()
    real_get, real_post = indexnow.requests.get, indexnow.requests.post
    indexnow.requests.get = lambda url, *a, **k: (
        FakeResp(200, SITEMAP) if "sitemap" in url else FakeResp(200, key)
    )
    indexnow.requests.post = lambda *a, **k: FakeResp(422, "key mismatch")
    try:
        code = indexnow.main()
    finally:
        indexnow.requests.get, indexnow.requests.post = real_get, real_post
    check(code == 1, "a 422 is a configuration error and must exit non-zero")


def test_the_key_is_not_treated_as_a_secret() -> None:
    """It is published at the site root; a warning saying otherwise misleads.

    This guards against someone later 'fixing' the key into an env var, which
    would break verification — the file must be fetchable by anyone.
    """
    src = Path(indexnow.__file__).read_text()
    check("PUBLIC BY DESIGN" in src,
          "the module must state that the key is public, so nobody hides it")


def test_routes_come_from_the_sitemap_not_a_list_here() -> None:
    """A hand-kept route list drifts the moment a page is renamed.

    The sister repository's first version hand-listed eight routes and five
    were wrong — pages renamed since, and two that never existed. Submitting
    those asks a search engine to index 404s, and nothing fails when it
    happens. This list happened to be correct, and "happened to be" is exactly
    the property worth removing.
    """
    real_get = indexnow.requests.get
    indexnow.requests.get = lambda url, *a, **k: FakeResp(200, SITEMAP)
    try:
        urls = indexnow.routes_from_sitemap()
    finally:
        indexnow.requests.get = real_get
    check(all(u.startswith(indexnow.ORIGIN) for u in urls),
          "off-origin entries must be dropped; IndexNow rejects a mixed-host list")
    check(len(set(urls)) == len(urls), "duplicate <loc> entries must collapse")
    check(f"{indexnow.ORIGIN}/tbills/" in urls, "our own routes must survive")
    check(not any("example.com" in u for u in urls), "example.com must not be submitted")


def test_does_not_submit_when_the_sitemap_cannot_be_read() -> None:
    path = indexnow.key_file()
    if path is None:
        return
    key = path.read_text().strip()
    sent = []
    real_get, real_post = indexnow.requests.get, indexnow.requests.post
    indexnow.requests.get = lambda url, *a, **k: (
        FakeResp(500) if "sitemap" in url else FakeResp(200, key)
    )
    indexnow.requests.post = lambda *a, **k: sent.append(a) or FakeResp(200)
    try:
        code = indexnow.main()
    finally:
        indexnow.requests.get, indexnow.requests.post = real_get, real_post
    check(not sent, "a sitemap we cannot read is not a list to announce")
    check(code == 0, "an unreadable sitemap is not a hard error")


def test_it_is_wired_into_a_job_that_actually_runs() -> None:
    """A step in a job that never starts is a step that never runs.

    This shipped inside `probe-debt-sources`, which is `workflow_dispatch`
    only. The step carried its own `if: github.event_name == 'schedule'`, which
    read as correct and was not — a step condition cannot rescue a step from a
    job that never starts. It sat there for a day and never executed once,
    alongside probe_tbill_rates.py which had the same problem for the same
    reason: both were inserted by anchoring on a neighbouring step's NAME
    without checking which job owned it.

    Nothing failed. The workflow was valid, CI was green, and the only symptom
    was silence — which is the exact failure shape this repository keeps
    finding in itself.

    So the wiring is asserted rather than eyeballed: parse ci.yml, find the job
    that owns each script, and require that job to run on a schedule.
    """
    ci_path = Path(__file__).parents[2] / ".github" / "workflows" / "ci.yml"
    workflow = yaml.safe_load(ci_path.read_text())

    for script in ("indexnow.py", "probe_tbill_rates.py"):
        owners = [
            (job, cfg)
            for job, cfg in workflow["jobs"].items()
            # `python indexnow.py`, not `python test_indexnow.py` — the test
            # file contains the module's name as a substring and would
            # otherwise count the test job as a caller.
            if any(
                re.search(rf"python {re.escape(script)}\b", step.get("run") or "")
                for step in cfg.get("steps", [])
            )
        ]
        check(len(owners) == 1, f"{script} should be wired into exactly one job, got {len(owners)}")
        if not owners:
            continue
        job_name, cfg = owners[0]
        # `if` absent means the job always runs, which qualifies.
        condition = str(cfg.get("if", "always"))
        check(
            "schedule" in condition or condition == "always",
            f"{script} lives in job '{job_name}' whose condition is "
            f"{condition!r} — it will never run on the daily refresh",
        )


def main() -> int:
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    if FAILURES:
        for f in FAILURES:
            print(f"FAIL: {f}", file=sys.stderr)
        return 1
    print("ok  indexnow refuses to submit unverified, and submits correctly when it can")
    return 0


if __name__ == "__main__":
    sys.exit(main())
