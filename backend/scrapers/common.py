"""Shared helpers for Mwangaza Yield scrapers.

Contract: each scraper writes a JSON array to public/data/<name>.json.
On ANY failure the scraper exits non-zero WITHOUT touching the existing
file — stale-but-valid data always beats empty data. CI surfaces the
failure; the app keeps serving the last good dataset.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# The published dataset. Overridable so a test can point the checkers at a
# throwaway copy instead of the real files — without an override, verifying
# how healthcheck.py treats (say) an empty secondary.json means mutating the
# dataset the site actually ships.
DATA_DIR = Path(
    os.environ.get("MWANGAZA_DATA_DIR")
    or Path(__file__).resolve().parents[2] / "public" / "data"
)

# ---------------------------------------------------------------------------
# Issue codes
#
# Three files independently reimplemented this and all three assumed the tenor
# was a whole number of years. It usually is — and then CBK issued
# IFB1/2023/6.5 and IFB1/2024/8.5. Those codes matched as "6" and "8", so the
# auction results never joined the securities register and two TAX-FREE
# infrastructure bonds stayed invisible in an app whose whole argument is that
# tax-free infrastructure bonds are the best deal available to a Kenyan retail
# investor. The failure was silent: they simply appeared in the "no auction
# result parsed yet" list alongside genuine gaps.
#
# One definition, imported everywhere, so the next surprise only has to be
# handled once.
# ---------------------------------------------------------------------------
CODE_RE = re.compile(r"^([A-Z]+\d*)/(\d{4})/(\d{1,3}(?:\.\d+)?)$")


def normalise_issue_code(code: str) -> str:
    """Canonical form: FXD1/2022/10 -> FXD1/2022/010, IFB1/2023/6.5 -> IFB1/2023/006.5.

    The integer part is zero-padded so codes sort correctly and so the two
    spellings CBK uses for the same bond compare equal. Any fractional part is
    preserved exactly — rounding it would merge 6.5-year and 6-year bonds.
    """
    m = CODE_RE.match(code.strip().upper().replace(" ", ""))
    if not m:
        return code.strip().upper()
    family, year, tenor = m.groups()
    whole, _, frac = tenor.partition(".")
    return f"{family}/{year}/{int(whole):03d}" + (f".{frac}" if frac else "")


def display_issue_code(code: str) -> str:
    """FXD1/2022/010 -> FXD1/2022/10, which is how CBK writes it to humans."""
    m = CODE_RE.match(code)
    if not m:
        return code
    family, year, tenor = m.groups()
    whole, _, frac = tenor.partition(".")
    return f"{family}/{year}/{int(whole)}" + (f".{frac}" if frac else "")


def tenor_years(code: str) -> float | None:
    """The ISSUED tenor from the code — never derived from the dates.

    FXD1/2022/10 spans 9.97 real years and is still taxed as a ten-year bond,
    because Kenyan withholding tax keys on what was issued, not on what elapsed.
    Returns a float so 6.5 survives; callers that want a label should use int()
    only when the value is whole.
    """
    m = CODE_RE.match(normalise_issue_code(code))
    return float(m.group(3)) if m else None


def _write_json_atomic(path: Path, payload) -> None:
    """Write JSON so that a killed process can never leave a half-file.

    THE CONTRACT AT THE TOP OF THIS MODULE WAS NOT BEING KEPT.

    It promises that on any failure the scraper exits "WITHOUT touching the
    existing file", because stale-but-valid data beats empty data. A plain
    write_text() cannot honour that: it truncates the file first and then
    streams bytes into it, so a process killed mid-write leaves neither the
    old dataset nor the new one — it leaves a JSON file that stops in the
    middle of a record. The app does not fall back to anything, because from
    its point of view the file is present. It fails to parse it.

    That is not a hypothetical kill. CI bounds every scraper with
    `timeout -k 20s 600s`, which sends SIGKILL to a scraper that overruns, and
    SIGKILL cannot be trapped or deferred. A concurrency rule that cancels
    superseded runs adds a second source of the same signal.

    os.replace() is atomic on POSIX: a reader sees either the whole old file
    or the whole new one, never a boundary. Writing to a temp file in the SAME
    directory matters — os.replace is only atomic within a filesystem, and a
    temp file in /tmp can be on a different one.
    """
    tmp = path.with_name(f".{path.name}.tmp")
    # A SIGKILL cannot run the cleanup below — that is what SIGKILL means — so
    # the previous run's temp file may still be here. It is harmless where it
    # sits: the leading dot and the .tmp suffix both keep it outside
    # `git add public/data/*.json`, so it cannot reach the repository. Sweeping
    # it anyway keeps a working copy from silting up, and means the assertion
    # "no temp files in the data directory" is true between runs.
    tmp.unlink(missing_ok=True)
    try:
        with tmp.open("w") as fh:
            json.dump(payload, fh, indent=2)
            fh.flush()
            # The bytes must be on disk before the rename. Without fsync the
            # rename can land while the contents are still in the page cache,
            # which on a crash gives an atomically-renamed EMPTY file — the
            # same failure this function exists to prevent, arrived by a
            # different route.
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    except BaseException:
        # Includes KeyboardInterrupt/SystemExit: a partial temp file left in
        # public/data would be committed by CI alongside the real datasets.
        tmp.unlink(missing_ok=True)
        raise


class EmptyDataset(RuntimeError):
    """A scrape produced nothing, so the existing file is kept.

    RAISED RATHER THAN sys.exit(1), WHICH IS WHAT THIS USED TO DO.

    The refusal itself is right and unchanged: a scrape that extracted nothing
    must not overwrite a good file with an empty one. What was wrong is that a
    LIBRARY function killed its caller's process.

    Three things follow from that, and all three are why this is worth the
    churn of touching six entry points:

      It could not be tested in-process. test_common.py has to spawn a
      subprocess to observe it — machinery that exists only because the
      function exits instead of returning.

      It could not be handled. A caller wanting to write two datasets, or to
      log context, or to try a fallback source, had no way to; the decision
      was taken out of its hands at the point of failure.

      It was invisible at the call site. `write_dataset(...)` does not read as
      "this may terminate the program", so the control flow of every scraper
      depended on a fact none of them stated.

    Every entry point now catches this and exits 1 itself, so the CI contract
    — non-zero means the dataset was not refreshed — is EXACTLY as before.
    That is the point: the behaviour is unchanged and the mechanism is one a
    caller can see and a test can reach.
    """


def write_dataset(name: str, records: list) -> None:
    if not records:
        print(f"[{name}] no records extracted — keeping existing file", file=sys.stderr)
        raise EmptyDataset(name)
    path = DATA_DIR / f"{name}.json"
    _write_json_atomic(path, records)
    # Written second and separately: if this one is interrupted the dataset is
    # already safely in place, and a meta.json that lags by one run is a far
    # smaller problem than a dataset that does not parse.
    _write_json_atomic(DATA_DIR / "meta.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "note": "Auto-refreshed by backend/scrapers via CI.",
    })
    print(f"[{name}] wrote {len(records)} records to {path}")


def unreachable(tag: str, exc: BaseException) -> int:
    """Report a source we could not reach, in one line, and give CI its code.

    Three scrapers — auction results, CBR history, CPI history — let a
    connection error escape `main()` and printed a bare traceback. Five others
    already caught it and said something like "listing unreachable: ProxyError".
    Both exit non-zero, so CI could not tell the difference and nothing was
    broken by it.

    A person can tell the difference, and the runbook for refreshing this data
    by hand asks them to note which scrapers failed. A stack trace does not
    distinguish "the network is down" from "this script is broken", and the
    reasonable response to those is not the same. That mattered the moment the
    refresh had to be runnable outside CI.

    It returns the exit code rather than calling sys.exit itself, so the caller
    keeps the `sys.exit(...)` visible at the point it happens.
    """
    print(f"[{tag}] source unreachable: {exc.__class__.__name__}: {exc}", file=sys.stderr)
    return 1
