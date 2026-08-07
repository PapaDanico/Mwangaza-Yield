"""Tests for the sovereign-context scraper. Run: python test_worldbank.py

Guards the class of defect found by auditing the TypeScript types against the
shipped data: a field the UI renders that the pipeline never writes.

`note` and `sentiment` were both declared on ContextIndicator and both consumed
by SovereignContext — the note as the entire body of its expandable panel —
while this scraper produced neither. Every panel opened onto nothing but a
citation, and every status dot silently fell back to neutral.

No type could have caught it. The JSON is read at runtime and cast, so the
compiler believes whatever the interface claims. Only the producer can be held
to it, which is what this file does.
"""
import re
import sys
from pathlib import Path

import worldbank as wb

failures = []


def check(label, actual, expected):
    if actual != expected:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")
    else:
        print(f"  ok  {label}")


def check_exits(label, records, expect_exit):
    """Run refuse_if_collapsed and report whether it stopped the run."""
    try:
        wb.refuse_if_collapsed(records)
        actually_exited = False
    except SystemExit:
        actually_exited = True
    check(label, actually_exited, expect_exit)


def rec(n):
    return [{"label": f"indicator {i}"} for i in range(n)]


def collapse_guard():
    """A partial fetch must not overwrite a fuller file.

    THE DEFECT THIS EXISTS FOR, WHICH WAS LIVE WHEN IT WAS WRITTEN.

    `write_dataset` refuses only a COMPLETELY empty result, so a run that lost
    seven of its eight indicators wrote the one survivor, exited 0, and told the
    workflow nothing had gone wrong. public/data/context.json held exactly one
    record — External debt / GNI, vintage 2024 — against eight defined in the
    scraper, and the Sovereign Context panel had been showing an eighth of a
    credit picture with nothing alarming.

    What alarmed instead was staleness, 946 days of it, because the lone
    survivor kept the file's date alive. The symptom everyone could see was the
    date; the disease was that seven indicators had quietly stopped arriving.

    Note what the ORIGINAL tests in this file check: that every entry in
    wb.INDICATORS carries a note and a sensible rule. That is a statement about
    the source code's table, and it was true throughout. Nothing checked what
    the scraper actually produced.
    """
    print("\na partial fetch is refused rather than published")
    check_exits("a full set of 8 is written", rec(8), False)
    check_exits(f"the floor of {wb.MIN_INDICATORS} is written", rec(wb.MIN_INDICATORS), False)
    check_exits("one below the floor stops the run", rec(wb.MIN_INDICATORS - 1), True)
    check_exits("the shipped 1-of-8 collapse stops the run", rec(1), True)
    check_exits("a total failure stops the run", rec(0), True)

    # The floor must leave room for genuine gaps without accepting a collapse.
    check("floor leaves room for real gaps", wb.MIN_INDICATORS < len(wb.INDICATORS), True)
    check("floor is a majority of the set",
          wb.MIN_INDICATORS > len(wb.INDICATORS) / 2, True)


def falls_back_to_a_second_query_shape():
    """A refused query must be retried a different way before giving up.

    THE EVIDENCE THIS IS BUILT ON, AND ITS LIMIT.

    On 2026-08-04 a refresh run recorded seven of eight indicators returning
    400 Bad Request while GC.DOD.TOTL.GD.ZS returned a clean 200 carrying no
    observation. One indicator answering proves the host, the network and the
    request credentials are all fine, which is what makes a rejected QUERY the
    suspect rather than a blocked client. Adding a User-Agent on the previous
    attempt changed nothing and eliminated the other candidate.

    `mrnev` is therefore the suspect and CANNOT be confirmed from here —
    api.worldbank.org is unreachable through this machine's outbound proxy. So
    the code tries both shapes rather than betting on the diagnosis, and these
    tests pin the BEHAVIOUR (retry, then surface) instead of the theory.
    """
    print("\na refused query shape is retried before giving up")

    calls = []

    class Resp:
        def __init__(self, status, payload=None):
            self.status_code = status
            self._payload = payload

        def raise_for_status(self):
            if self.status_code >= 400:
                raise wb.requests.HTTPError(f"{self.status_code} Client Error")

        def json(self):
            return self._payload

    good = [{"page": 1}, [{"value": 7.5, "date": "2025"}]]

    def only_second_shape_works(url, params=None, headers=None, timeout=None):
        calls.append(params)
        return Resp(400) if "mrnev" in params else Resp(200, good)

    real = wb.requests.get
    try:
        wb.requests.get = only_second_shape_works
        got = wb.latest_value("NY.GDP.MKTP.KD.ZG")
    finally:
        wb.requests.get = real

    check("the value survives a 400 on the first shape", got, {"value": 7.5, "year": "2025"})
    check("it actually tried twice", len(calls), 2)
    check("the first attempt used mrnev", "mrnev" in calls[0], True)
    check("the fallback dropped mrnev", "mrnev" in calls[1], False)
    check("the fallback asked for a date window", "date" in calls[1], True)

    # And when EVERY shape is refused it must raise, not report "no observation".
    # Those mean different things: one is the World Bank not holding a series,
    # the other is us being unable to ask. Only the second is a pipeline fault.
    def nothing_works(url, params=None, headers=None, timeout=None):
        return Resp(400)

    raised = False
    try:
        wb.requests.get = nothing_works
        wb.latest_value("NY.GDP.MKTP.KD.ZG")
    except wb.requests.HTTPError:
        raised = True
    except Exception:
        raised = False
    finally:
        wb.requests.get = real
    check("a total refusal is raised, not silently 'no observation'", raised, True)

    # A connection-level failure is not worth retrying: same host, same answer.
    conn_calls = []

    def connection_refused(url, params=None, headers=None, timeout=None):
        conn_calls.append(params)
        raise wb.requests.ConnectionError("no route to host")

    try:
        wb.requests.get = connection_refused
        wb.latest_value("NY.GDP.MKTP.KD.ZG")
    except wb.requests.ConnectionError:
        pass
    finally:
        wb.requests.get = real
    check("a dead connection is not retried", len(conn_calls), 1)


def identifies_itself():
    """A default python-requests user-agent is the likeliest cause of the 400."""
    print("\nthe scraper identifies itself to the API")
    check("a user agent is set", bool(wb.USER_AGENT.strip()), True)
    check("it is not the requests default", "python-requests" not in wb.USER_AGENT, True)
    check("it says who to contact", "mwangazayield.org" in wb.USER_AGENT, True)

    # And that it is actually SENT. Asserting only that the constant exists
    # would pass with the header never attached to the request — the same
    # shape of guard this project keeps having to replace.
    sent = {}

    class FakeResp:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return [{"page": 1}, [{"value": 1.0, "date": "2025"}]]

    def fake_get(url, params=None, headers=None, timeout=None):
        sent["headers"] = headers or {}
        return FakeResp()

    real_get = wb.requests.get
    try:
        wb.requests.get = fake_get
        wb.latest_value("NY.GDP.MKTP.KD.ZG")
    finally:
        wb.requests.get = real_get

    check("the header reaches the request",
          sent.get("headers", {}).get("User-Agent"), wb.USER_AGENT)


def test_budget_stops_before_the_ci_bound_does():
    """The self-imposed budget must fire BEFORE the shell timeout kills us.

    A budget larger than the external bound could never fire — the exact
    "guard that cannot fire in the case it exists to detect" this repository
    keeps finding. So the ordering is asserted against ci.yml itself rather
    than trusted.
    """
    import re
    from pathlib import Path
    ci = (Path(__file__).parents[2] / ".github" / "workflows" / "ci.yml").read_text()
    m = re.search(r"timeout -k \d+s (\d+)s python worldbank\.py", ci)
    check("ci.yml bounds worldbank.py in the shell", bool(m), True)
    if m:
        shell = int(m.group(1))
        check(f"budget {wb.BUDGET_SECONDS}s is under the {shell}s shell bound",
              wb.BUDGET_SECONDS < shell, True)
        # And with real margin — a request can be in flight when the budget is
        # checked, and it may take up to TIMEOUT to return.
        check("with at least one request-timeout of margin",
              shell - wb.BUDGET_SECONDS >= wb.TIMEOUT, True)


def test_budget_stops_the_loop_and_keeps_what_it_got():
    """Exhausting the budget must return partial records, not raise."""
    calls = {"n": 0}

    def slow(code):
        calls["n"] += 1
        return {"value": 1.0, "year": "2024"}

    real = wb.latest_value
    try:
        wb.latest_value = slow
        got = wb.scrape(budget_seconds=0)  # already spent
    finally:
        wb.latest_value = real
    check("a spent budget fetches nothing", calls["n"], 0)
    check("and returns a list rather than raising", isinstance(got, list), True)


def test_a_generous_budget_still_fetches_everything():
    """The mirror. A budget that stops every run is as useless as none."""
    def quick(code):
        return {"value": 1.0, "year": "2024"}

    real = wb.latest_value
    try:
        wb.latest_value = quick
        got = wb.scrape(budget_seconds=3600)
    finally:
        wb.latest_value = real
    check("all indicators collected under a generous budget",
          len(got), len(wb.INDICATORS))


def budget_can_actually_reach_success() -> None:
    """The self-imposed budget must be able to reach the success condition.

    BUDGET_SECONDS was 240 against MIN_INDICATORS=6 and TIMEOUT=60. Reaching
    the minimum costs 6 x 60 = 360s in the slow case, so the budget could fit
    four timeouts where six were required. The scraper stopped short every
    time, refuse_if_collapsed() correctly refused the partial result, and the
    CI step recorded `failed=worldbank` on EVERY run — and an alert that fires
    always carries exactly as much information as one that never fires.

    Nothing was red. worldbank.py did the right thing at every step; the
    numbers simply could not add up, and no test compared them. This is that
    test.

    It also checks the shell bound in ci.yml sits ABOVE the budget. If the
    shell kills the process while it is still inside its own budget, the
    self-stop never runs and #176 returns wearing a different costume.
    """
    need = wb.MIN_INDICATORS * wb.TIMEOUT
    ok = wb.BUDGET_SECONDS >= need
    check("budget can reach MIN_INDICATORS", ok, True)
    if not ok:
        failures.append(
            f"BUDGET_SECONDS={wb.BUDGET_SECONDS} but reaching MIN_INDICATORS="
            f"{wb.MIN_INDICATORS} costs up to {need}s — the scraper can only "
            f"ever stop short and be recorded as failed")

    ci = (Path(__file__).parents[2] / ".github" / "workflows" / "ci.yml").read_text()
    m = re.search(r"timeout -k \d+s (\d+)s python worldbank\.py", ci)
    check("ci.yml bounds worldbank.py in the shell", bool(m), True)
    if m:
        shell = int(m.group(1))
        above = shell > wb.BUDGET_SECONDS
        check("shell bound sits above the self-imposed budget", above, True)
        if not above:
            failures.append(
                f"shell bound {shell}s <= BUDGET_SECONDS {wb.BUDGET_SECONDS} — "
                f"the shell kills the scraper before it can stop itself")


def main():
    print("the self-imposed budget")
    test_budget_stops_before_the_ci_bound_does()
    test_budget_stops_the_loop_and_keeps_what_it_got()
    test_a_generous_budget_still_fetches_everything()

    print("\nevery indicator carries what the dashboard renders")
    for code, label, unit, note, rule in wb.INDICATORS:
        check(f"{label} has a note", bool(note and note.strip()), True)
        check(f"{label} note is a real explanation, not a stub", len(note) > 40, True)
        check(f"{label} rule is None or (threshold, direction)",
              rule is None or (isinstance(rule, tuple) and len(rule) == 2 and
                               rule[1] in ("higher", "lower")), True)

    print("\ndebt is actually collected — the sources page has always claimed it")
    labels = [i[1] for i in wb.INDICATORS]
    for wanted in ("Government debt / GDP", "Interest / government revenue",
                   "External debt / GNI", "Debt service / exports"):
        check(f"collects {wanted}", wanted in labels, True)

    print("\nsentiment_for")
    check("below a 'lower' threshold is good", wb.sentiment_for(22, (30.0, "lower")), "good")
    check("above a 'lower' threshold is caution", wb.sentiment_for(41, (30.0, "lower")), "caution")
    check("above a 'higher' threshold is good", wb.sentiment_for(4.03, (4.0, "higher")), "good")
    check("below a 'higher' threshold is caution", wb.sentiment_for(2.8, (4.0, "higher")), "caution")
    check("exactly on the threshold is good", wb.sentiment_for(30.0, (30.0, "lower")), "good")
    # Most of these figures have no line either side of which a country is fine
    # or in trouble. Neutral is the honest answer, not a guess dressed as one.
    check("no rule means no verdict", wb.sentiment_for(15.76, None), "watch")

    print("\nthe emitted record carries every field the UI reads")
    # Restored afterwards. It was not, and that leaked: every check added below
    # this line silently received the stub instead of the real function, so a
    # later test that patched requests.get to prove the User-Agent header was
    # sent saw no request at all and reported the header missing when it was
    # present. A fixture that outlives its test turns the next test into a
    # measurement of the fixture.
    real_latest_value = wb.latest_value
    try:
        wb.latest_value = lambda code: {"value": 12.3456, "year": "2025"}
        records = wb.scrape()
    finally:
        wb.latest_value = real_latest_value
    check("one record per indicator", len(records), len(wb.INDICATORS))
    required = ("id", "label", "value", "unit", "asOf", "source", "sourceUrl", "note", "sentiment")
    for rec in records:
        for field in required:
            check(f"{rec['label']} has {field}", field in rec and rec[field] not in (None, ""), True)
        check(f"{rec['label']} value is rounded", rec["value"], 12.35)

    collapse_guard()
    falls_back_to_a_second_query_shape()
    identifies_itself()
    budget_can_actually_reach_success()

    if failures:
        print(f"\n{len(failures)} FAILURE(S):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll sovereign-context scraper tests passed.")


if __name__ == "__main__":
    main()
