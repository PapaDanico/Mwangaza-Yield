"""The shared helpers every scraper imports, which had no tests at all.

WHY THIS MATTERS MORE THAN ITS SIZE SUGGESTS

common.py is ninety lines and nine modules import it. Two things in it are
load-bearing in a way the line count hides:

  tenor_years()    decides withholding tax. Kenyan WHT keys on the tenor the
                   bond was ISSUED at, so FXD1/2022/010 is taxed at 10% even
                   though it runs 9.97 real years. A parse that silently
                   returns None, or that rounds 6.5 to 6, moves a bond across
                   the 10%/15% boundary.

  write_dataset()  is the only write path to public/data. Everything the site
                   serves goes through it.

The regex is the single point of failure for the first, and until now nothing
exercised the fractional-tenor branch that the docstring specifically promises
survives.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

failures: list = []


def check(cond, msg):
    if not cond:
        failures.append(msg)


def test_issue_codes():
    from common import display_issue_code, normalise_issue_code, tenor_years

    # Zero-padding exists so the two spellings CBK uses compare equal.
    check(normalise_issue_code("FXD1/2022/10") == "FXD1/2022/010",
          "normalise did not zero-pad FXD1/2022/10")
    check(normalise_issue_code("FXD1/2022/010") == "FXD1/2022/010",
          "normalise is not idempotent")
    check(normalise_issue_code("fxd1/2022/10") == "FXD1/2022/010",
          "normalise did not upper-case")
    check(normalise_issue_code(" FXD1 / 2022 / 10 ".replace(" / ", "/")) == "FXD1/2022/010",
          "normalise did not strip surrounding whitespace")

    # THE FRACTIONAL BRANCH. The docstring promises 6.5 survives, because
    # rounding it would merge a 6.5-year bond with a 6-year one — two
    # different instruments with two different maturities.
    check(normalise_issue_code("IFB1/2023/6.5") == "IFB1/2023/006.5",
          "the fractional tenor was lost or rounded")
    check(tenor_years("IFB1/2023/6.5") == 6.5,
          f"tenor_years lost the fraction: {tenor_years('IFB1/2023/6.5')}")

    # Round-trip: display is how CBK writes it to humans.
    for code in ("FXD1/2022/10", "IFB1/2023/6.5", "FXD2/2019/015"):
        norm = normalise_issue_code(code)
        check(normalise_issue_code(display_issue_code(norm)) == norm,
              f"{code} did not survive normalise -> display -> normalise")

    # THE TAX BOUNDARY. WHT is 10% at ten years or more, 15% below, and these
    # two codes sit either side of it. If the regex ever stops matching, this
    # returns None and a caller comparing None >= 10 raises rather than
    # silently mis-taxing — but the None itself is the bug to catch here.
    check(tenor_years("FXD1/2022/010") == 10.0, "ten-year tenor did not parse")
    check(tenor_years("FXD1/2022/009") == 9.0, "nine-year tenor did not parse")

    # Unparseable input must NOT come back as a number.
    for bad in ("", "not a code", "FXD1/22/10", "FXD1/2022/", "FXD1/2022/1000"):
        check(tenor_years(bad) is None, f"tenor_years invented a tenor for {bad!r}")
    # And normalise must hand back something rather than crash.
    check(normalise_issue_code("not a code") == "NOT A CODE",
          "normalise crashed or mangled an unparseable code")


def test_atomic_write_survives_a_kill():
    """The guarantee, tested the only way that proves it: with a real SIGKILL.

    Asserting that write_dataset writes a file would pass against the old
    non-atomic version too. What changed is what happens when the process dies
    MID-WRITE, so the test kills one mid-write and reads what is left.

    The child starts a write, is killed part-way, and the parent then asserts
    the dataset still parses AND still holds the original records.

    WHAT THE SLOWDOWN DOES, EXACTLY — because it is easy to over-trust.

    The child stalls inside os.fsync, which only the atomic path calls. So
    against an implementation that has REVERTED to path.write_text() the child
    is not stalled at all: it finishes instantly and the parent sees the
    records replaced rather than truncated. The assertion that fails is then
    "replaced by a partial write" rather than "no longer parses".

    Verified by mutation: reverting _write_json_atomic to a plain write_text
    turns this red either way, which is what the test is for. But it means
    this proves "a kill cannot leave the dataset changed or unreadable", not
    specifically "truncation is impossible" — a real truncation needs a
    payload far larger than is reasonable to write in CI.
    """
    with tempfile.TemporaryDirectory() as d:
        data_dir = Path(d)
        target = data_dir / "probe.json"
        good = [{"id": i, "keep": "original"} for i in range(50)]
        target.write_text(json.dumps(good, indent=2))
        (data_dir / "meta.json").write_text('{"generatedAt": "old"}')

        child = (
            "import sys, time, os\n"
            f"sys.path.insert(0, {str(Path(__file__).parent)!r})\n"
            "import common\n"
            # Make the write slow enough to be interrupted part-way, without
            # changing how it is performed.
            "real = os.fsync\n"
            "os.fsync = lambda fd: (time.sleep(30), real(fd))[1]\n"
            "common.write_dataset('probe', [{'id': i, 'keep': 'REPLACED'} for i in range(50000)])\n"
        )
        env = {**os.environ, "MWANGAZA_DATA_DIR": str(data_dir)}
        proc = subprocess.Popen([sys.executable, "-c", child], env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            proc.wait(timeout=8)
            check(False, "the child completed; it was supposed to be killed mid-write")
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

        # The dataset must still parse, and must still be the ORIGINAL.
        try:
            after = json.loads(target.read_text())
            check(after == good,
                  "the dataset survived parsing but was replaced by a partial write")
        except json.JSONDecodeError as e:
            check(False, f"THE DATASET NO LONGER PARSES after a mid-write kill: {e}")

        # A SIGKILL cannot run a cleanup handler, so a temp file MAY survive.
        # Asserting it does not would be asserting something impossible, and
        # this test found that out the honest way — by failing on the first
        # run against exactly that claim.
        #
        # What must be true is narrower and is what actually protects the repo:
        # anything left behind cannot be committed. CI stages with
        # `git add public/data/*.json public/data/*.csv`, which a leading-dot
        # .tmp name matches on neither count.
        leftovers = [p.name for p in data_dir.iterdir() if p.name.endswith(".tmp")]
        for name in leftovers:
            check(name.startswith(".") and not name.endswith((".json", ".csv")),
                  f"leftover {name!r} would be picked up by CI's git add glob")

        # And the next successful run must clear it, so it cannot accumulate.
        from importlib import reload
        os.environ["MWANGAZA_DATA_DIR"] = str(data_dir)
        import common
        reload(common)
        common.write_dataset("probe", [{"id": 1}])
        still = [p.name for p in data_dir.iterdir() if p.name.endswith(".tmp")]
        check(still == [], f"a stale temp survived the next write: {still}")


def test_write_dataset_writes():
    """The happy path still works — an atomic write that never lands is worse."""
    from importlib import reload

    with tempfile.TemporaryDirectory() as d:
        os.environ["MWANGAZA_DATA_DIR"] = d
        import common
        reload(common)
        records = [{"a": 1}, {"a": 2}]
        common.write_dataset("probe", records)
        written = json.loads((Path(d) / "probe.json").read_text())
        check(written == records, f"write_dataset round-trip failed: {written}")
        meta = json.loads((Path(d) / "meta.json").read_text())
        check("generatedAt" in meta, "meta.json has no generatedAt")
        check([p.name for p in Path(d).iterdir() if p.name.endswith(".tmp")] == [],
              "a temp file survived a successful write")


def test_empty_refusal_is_catchable():
    """The refusal that used to kill the caller's process.

    write_dataset called sys.exit(1) on an empty scrape. The REFUSAL is right —
    nothing extracted must not overwrite a good file — but a library function
    terminating its caller could not be handled, could not be tested without
    spawning a subprocess, and did not read like a possible exit at the call
    site.

    It raises EmptyDataset now, and every entry point catches it and exits 1
    itself, so CI's contract is unchanged. This test is the thing that was not
    previously possible: observing the refusal IN-PROCESS.
    """
    from importlib import reload

    with tempfile.TemporaryDirectory() as d:
        os.environ["MWANGAZA_DATA_DIR"] = d
        import common
        reload(common)

        try:
            common.write_dataset("probe", [])
            failures.append("write_dataset accepted an empty scrape")
        except SystemExit:
            failures.append("write_dataset still calls sys.exit — it must raise EmptyDataset")
        except common.EmptyDataset:
            pass

        # THE REFUSAL'S WHOLE PURPOSE: nothing was written.
        written = [p.name for p in Path(d).iterdir()]
        check(written == [], f"an empty scrape wrote files anyway: {written}")


def main() -> int:
    test_issue_codes()
    test_write_dataset_writes()
    test_empty_refusal_is_catchable()
    test_atomic_write_survives_a_kill()
    for f in failures:
        print(f"FAIL: {f}", file=sys.stderr)
    print(f"common.py: issue codes, write round-trip, the empty-scrape refusal, "
          f"and a mid-write SIGKILL — "
          f"{len(failures)} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
