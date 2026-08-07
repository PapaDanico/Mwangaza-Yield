"""Every test file in this directory must be invoked by CI.

The scraper suite is a hand-maintained list of `python test_x.py` lines in
ci.yml. Adding a test file and forgetting the line is silent: CI stays green
and the tests never run. That is not hypothetical — this directory has already
shipped a file where sixteen of nineteen tests could not execute, and CI
reported the suite green throughout.

So the list is checked against the directory rather than trusted. This file is
the one exception it may not cover, which is why it also asserts its own
presence: a check absent from the runner is the failure it exists to prevent.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
CI = HERE.parents[1] / ".github" / "workflows" / "ci.yml"

FAILURES: list = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def invoked() -> set:
    text = CI.read_text()
    return set(re.findall(r"python\s+(test_[a-z0-9_]+\.py)", text))


def present() -> set:
    return {p.name for p in HERE.glob("test_*.py")}


def main() -> int:
    check(CI.exists(), f"ci.yml not found at {CI}")
    if not CI.exists():
        print("FAIL: ci.yml missing", file=sys.stderr)
        return 1

    run = invoked()
    have = present()

    # The self-test. If the two sets were both empty — a wrong path, a renamed
    # workflow — every assertion below would pass vacuously.
    check(len(have) >= 5, f"only found {len(have)} test files; the glob is wrong")
    check(len(run) >= 5, f"only found {len(run)} invocations; the regex is wrong")

    missing = sorted(have - run)
    check(not missing, f"test files never run by CI: {missing}")

    ghost = sorted(run - have)
    check(not ghost, f"ci.yml invokes test files that do not exist: {ghost}")

    check(Path(__file__).name in run,
          "this check is itself not wired into CI, which is the bug it detects")

    for f in FAILURES:
        print(f"FAIL: {f}", file=sys.stderr)
    print(f"{len(have)} test files, {len(run)} invoked, {len(FAILURES)} failures")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
