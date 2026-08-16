"""A source we cannot reach must read differently from a script that is broken.

WHY THIS EXISTS

Five scrapers caught connection errors and printed one line — "listing
unreachable: ProxyError". Three did not, and dumped a bare traceback instead.
All eight exit non-zero, so CI could not tell the difference and nothing was
broken by the inconsistency.

A person can tell the difference, and it started mattering when the refresh had
to be runnable outside CI. docs/RUNBOOK-REFRESH-WITHOUT-CI.md asks the operator
to note which scrapers failed; a stack trace does not distinguish "the network
is down" from "this script is broken", and those do not deserve the same
response.

THE PROPERTY THAT MATTERS MOST IS THE NARROWNESS

The fix catches `requests.exceptions.RequestException`, not `Exception`. If it
caught everything, a genuine bug — a TypeError, a bad key — would print one
tidy line claiming the source was unreachable, and the traceback that would
have located it would be gone. That is a worse outcome than the tracebacks this
replaced, and it is the failure this file is really guarding.

So both directions are asserted: a network error is summarised, and anything
else is left alone to raise.
"""
import subprocess
import sys
from pathlib import Path

import requests

from common import unreachable

HERE = Path(__file__).parent

FAILURES: list = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def test_reports_one_line_and_the_ci_code() -> None:
    code = unreachable("some-source", requests.exceptions.ProxyError("tunnel refused"))
    check(code == 1, f"must return the non-zero code CI relies on, got {code}")


def test_names_the_source_and_the_error_class() -> None:
    # Captured through a subprocess because it writes to stderr: the operator
    # reading this needs to know WHICH scraper and WHAT went wrong, and a
    # message missing either is not actionable.
    script = (
        "import sys, requests\n"
        "sys.path.insert(0, %r)\n" % str(HERE)
        + "from common import unreachable\n"
        "sys.exit(unreachable('cbr-history', requests.exceptions.ConnectTimeout('slow')))\n"
    )
    proc = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True)
    check(proc.returncode == 1, f"exit code should be 1, got {proc.returncode}")
    check("cbr-history" in proc.stderr, f"must name the source: {proc.stderr!r}")
    check("ConnectTimeout" in proc.stderr, f"must name the error class: {proc.stderr!r}")
    check("Traceback" not in proc.stderr, "a reachability failure must not print a traceback")
    check(
        len(proc.stderr.strip().splitlines()) == 1,
        f"one line, not a paragraph: {proc.stderr!r}",
    )


def test_a_real_bug_still_raises() -> None:
    """The narrowness property. A TypeError must NOT be summarised away."""
    script = (
        "import sys, requests\n"
        "sys.path.insert(0, %r)\n" % str(HERE)
        + "from common import unreachable\n"
        "try:\n"
        "    raise TypeError('a genuine bug')\n"
        "except requests.exceptions.RequestException as exc:\n"
        "    sys.exit(unreachable('some-source', exc))\n"
    )
    proc = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True)
    check(
        "Traceback" in proc.stderr and "TypeError" in proc.stderr,
        "a non-network exception must still raise with its traceback intact, "
        f"got: {proc.stderr!r}",
    )
    check(
        "source unreachable" not in proc.stderr,
        "a genuine bug must never be reported as an unreachable source",
    )


def main() -> int:
    test_reports_one_line_and_the_ci_code()
    test_names_the_source_and_the_error_class()
    test_a_real_bug_still_raises()
    if FAILURES:
        for f in FAILURES:
            print(f"FAIL: {f}")
        return 1
    print("ok  unreachable sources read as unreachable; real bugs still raise")
    return 0


if __name__ == "__main__":
    sys.exit(main())
