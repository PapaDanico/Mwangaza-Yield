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


# Modules that ship behaviour and therefore need a test.
#
# WHY THE EXEMPTIONS ARE NAMED RATHER THAN PATTERN-MATCHED
#
# `probe_*` and `discover_*` are diagnostics: they fetch a source, print what
# they found, and write nothing. Their output IS the result, read by a human
# from a CI log, and a test asserting what a live government website returns
# would be a test of that website. They are exempt by prefix.
#
# Everything else is exempt only BY NAME, on a stated reason, because an
# exemption that matches a pattern quietly grows to cover things nobody
# decided to exempt.
EXEMPT = {
    # Network probe in all but name — CHECKS is a list of URLs and markers, and
    # probe() reports status. Kept out of the probe_ prefix by history, not by
    # any difference in what it does.
    "validate.py": "diagnostic; prints live source status and writes nothing",
}


def modules_needing_tests() -> set:
    return {
        p.name for p in HERE.glob("*.py")
        if not p.name.startswith(("test_", "probe_", "discover_"))
        and p.name not in EXEMPT
    }


def tested_modules() -> set:
    """Modules some test file actually imports.

    Import, not filename. test_calendar_parser.py covers cbk_parser.py, and a
    name-matching rule would have called cbk_parser untested while calling a
    test that imports nothing covered.
    """
    covered = set()
    for t in HERE.glob("test_*.py"):
        text = t.read_text()
        for name in modules_needing_tests():
            stem = name[:-3]
            if re.search(rf"\b(?:from|import)\s+{re.escape(stem)}\b", text):
                covered.add(name)
    return covered


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

    # A TEST FILE THAT RUNS IS NOT THE SAME AS A MODULE THAT IS TESTED.
    #
    # Everything above asks whether each test file reaches CI. None of it can
    # notice a module with NO test file at all, and that is how common.py —
    # imported by nine modules, home to the write path for every dataset and to
    # the tenor parse that decides a withholding band — sat uncovered until
    # somebody read the directory listing. registry.py went the same way.
    #
    # This closes that: every module that ships behaviour must be IMPORTED by
    # some test. Import rather than filename, because test_calendar_parser.py
    # covers cbk_parser.py and a name rule would report that as a gap.
    needed = modules_needing_tests()
    check(len(needed) >= 8, f"only found {len(needed)} modules; the glob is wrong")
    untested = sorted(needed - tested_modules())
    check(not untested,
          f"modules with no test importing them: {untested}. Either write one, "
          f"or add it to EXEMPT with the reason it does not need one.")

    for f in FAILURES:
        print(f"FAIL: {f}", file=sys.stderr)
    print(f"{len(have)} test files, {len(run)} invoked, "
          f"{len(modules_needing_tests())} modules needing tests, {len(FAILURES)} failures")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
