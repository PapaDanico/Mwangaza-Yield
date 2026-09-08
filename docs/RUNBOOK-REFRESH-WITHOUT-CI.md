# Refreshing the data when CI cannot run it

## Why this exists

The data pipeline lives in one place: the `refresh-data` job in
`.github/workflows/ci.yml`, on a schedule of 03:17 and 15:17 UTC, Monday to
Saturday. That is the correct home for it and nothing here proposes moving it.

But it is the *only* home for it, and on 15 August 2026 that turned into an
operational gap. GitHub Actions stopped assigning runners to this repository at
13:34 UTC — every job in every run since has died in three to five seconds with
`runner_id: 0`, no logs and no steps executed. The 15:17 scheduled run failed
the same way, so the refresh did not happen, and there was no documented way to
do it by hand.

The site degrades honestly while this is true — see "What the reader sees"
below — so this is not an emergency. It is a four-day clock, and this document
is what stops that clock being discovered rather than planned for.

## First: what it is NOT

An earlier version of this section said this repository is private and blamed
an exhausted Actions minutes allowance. **That was wrong, and it is worth
saying why, because the wrong answer is the plausible one.**

This repository is **public** — Netlify's deploy metadata reports
`public_repo: true` — and public repositories get unlimited free Actions
minutes on standard runners. Every job here declares `runs-on: ubuntu-latest`,
so there is no paid-runner angle either. There is no minutes pool to exhaust,
and the quota explanation cannot be right no matter how well it fits the
symptom.

That misdiagnosis survived being written down once and was then repeated in a
pull request description, which is the cost of recording a guess in the same
voice as a finding.

## So what is it?

The symptom is real and specific: no runner is ever allocated. Jobs die in two
to five seconds with `runner_id: 0`, zero steps executed, and a job log that
returns a hard 404 rather than a truncated run. The same signature appears on
`main`, so it is not the branch under test.

That is account-level, and the specific cause is not visible through the API.
It is visible in the web UI, in two places worth checking in order:

1. The banner at the top of the **Actions** tab.
2. **Settings → Billing and licensing.** An unpaid balance from anything else
   on the account disables Actions account-wide — public repositories
   included, which is exactly why the free-minutes reasoning above does not
   save you.

Until that is resolved, nothing in this repository needs changing, and no
amount of re-running will help. Verify locally instead — see below — and say
plainly what you ran, so the evidence is worth what it claims to be.

Note also that publishing no longer depends on this. Direct deploys to Netlify
are the default path now; see `RUNBOOK-DEPLOY.md`. A dead CI blocks the data
refresh, not the ability to ship.

## What the reader sees while the pipeline is down

Nothing is hidden from them, and this is deliberate. Two independent notices
cover the two different faults:

| | fires when | reads from |
|---|---|---|
| `StaleDataNotice` (pipeline) | 3+ scheduled runs missed | the live clock |
| `StaleDataNotice` (per-dataset) | a dataset passes its own budget | `freshness.json` |

The pipeline notice uses `new Date()`, so it still fires when the pipeline that
would have updated `freshness.json` is the thing that has stopped. That
ordering matters: the per-dataset check reads a file the dead pipeline writes,
so on its own it would go quiet exactly when it was needed.

Measured against the 15 August outage, with the last successful run at 04:02
UTC that day:

```
2026-08-15  silent
2026-08-16  silent
2026-08-17  silent
2026-08-18  "These figures were last updated on 2026-08-15, and 3 scheduled
             updates have been missed since"
2026-08-20  ... 7 scheduled updates ...
```

`tbills.json` passes its own 21-day budget on **20 August**. The pipeline
notice is already showing by then, so the reader is warned two days before the
oldest dataset goes stale. Do not "fix" the three days of silence by lowering
the threshold: a banner that appears every weekend is a banner nobody reads.

## Running the refresh by hand

```bash
npm run refresh            # run it, keep it only if something arrived
npm run refresh -- --push  # ... and commit and push that
```

**If you are here because Actions is still down, read
[`RUNNING-WITHOUT-ACTIONS.md`](RUNNING-WITHOUT-ACTIONS.md) first.** This
document is the procedure; that one is whether to keep waiting for a runner at
all, what the alternatives cost, and the crontab line that replaces the
schedule outright.

That is `scripts/refresh-data.mjs`, and it runs exactly the sequence below in
exactly this order. It is not a second refresh path — same scrapers, same
files, no cadence of its own — it is this section made executable, with the
"these commands WRITE even when they fail" trap enforced instead of remembered.

**It decides whether to keep the run by asking whether any dataset's `asOf`
advanced**, and discards everything including the stamps if none did. Two
weaker rules were tried first and both kept a run that fetched nothing:

- *Exit code.* `macro_parser.py` returns 0 having reached nothing, because
  `carry_forward()` is a valid outcome.
- *Files changed.* A failed run rewrites `macro.json` to record the failure —
  rows gain `lastAttempt` and `attemptFailed` — and advances
  `data-manifest.json`'s `lastSuccessfulScrape` **even when every source
  403'd**. Bytes move while no figure does.

`asOf` in `freshness.json` is the date of the newest OBSERVATION in each
dataset, computed by `healthcheck.py`, and it is what the reader-facing
staleness notice is derived from. Nothing else is a reliable answer to "did
anything actually get newer".

Run it from a container behind the egress proxy and it will reach nothing,
restore `public/data`, and exit 1. That is correct behaviour, not a fault in
the script.

### What it runs

Requires network access to CBK, KNBS, the National Treasury and the World Bank.
A development container behind an egress proxy will **403 on CONNECT** to all
of them, which looks identical to the source being down — do not report a
source as unreachable on the strength of a run from one.

```bash
cd backend/scrapers
pip install -r ../requirements.txt

# Each of these is independent and allowed to fail on its own. carry_forward()
# keeps the previous value, so a partial refresh is a valid outcome — but note
# which ones failed rather than assuming a clean run.
python macro_parser.py          # CBR, CPI, USD/KES
python worldbank.py             # sovereign context (keyless, CC BY 4.0)
python registry.py              # reconcile bonds against the CBK register
python auction_results.py       # coupon rates, clearing yields
python cbr_history_parser.py
python cpi_history_parser.py
python expand_universe.py       # bond universe from register + results
python refresh_calendar.py      # auction calendar from CBK prospectuses

# Then rebuild what the site and the public feed serve:
cd ../..
node scripts/build-rates-feed.mjs
cd backend/scrapers && python healthcheck.py --publish
```

Each of those prints one line on a source it cannot reach — `[cbr-history]
source unreachable: ProxyError: ...` — and exits 1. A **traceback** means
something other than the network went wrong, and is worth reading rather than
retrying. Three of them used to print a traceback either way; that is why the
distinction is now reliable.

`healthcheck.py --publish` is what writes `public/data/freshness.json`. Skip it
and the per-dataset ages stay frozen at their previous values while the figures
around them change — the site would then under-report staleness, which is worse
than not refreshing at all.

### These commands WRITE, even when they fail

Running any of them mutates `public/data/` in place. That is the point when the
network is up, and a trap when it is not: a scraper that reaches nothing still
carries the previous value forward and still stamps `meta.json` with the time
it ran.

Dry-running this sequence from a container with no egress bumped
`generatedAt` from `2026-08-15` to `2026-08-16` while fetching nothing. Commit
that and the site is told the pipeline ran today — which **suppresses the
staleness notice** described above, on data that is exactly as old as it was.
The banner would go quiet at the moment it was most needed.

`npm run refresh` enforces this, and refuses to start if `public/data` is
already dirty — it decides by looking at what changed and cannot tell your
edits from its own. Running the scrapers directly, the checks are:

```bash
git diff --stat public/data/          # what did this run really touch?
git diff public/data/meta.json        # did generatedAt move without new data?
git checkout -- public/data/          # discard a run that fetched nothing
```

Only keep `public/data/` from a run whose scrapers reached their sources — and
note that `git diff --stat` alone will not tell you that, for the reasons
above. Compare `freshness.json`'s `asOf` values.

### Before committing

```bash
cd backend/scrapers && python healthcheck.py    # no --publish: reports only
cd ../.. && npm run verify && npm run build
```

`npm run verify` is typecheck, lint and unit tests in that order, and the order
is the point. `next build` does not typecheck anything under `tests/`, and
vitest transpiles without checking types, so a type error in a test file passes
both and reaches `main` — which is exactly how it did. Running the three
separately also invites running one of them before the last edit and reading
its result as though it covered what shipped.

Then commit `public/data/` and push to `main`.

Publishing is now a deliberate second step rather than something that follows
from the push. Deploy directly to Netlify — run `node scripts/predeploy-check.mjs`,
then the deploy command, per `RUNBOOK-DEPLOY.md`. The gate matters more here
than usual: it byte-compares `out/data` against `public/data`, which is exactly
the mistake available after a hand-run refresh — refreshing the data, then
publishing a build made before it changed.

The git-connected build still works and will also deploy this push. Either is
fine; what is not fine is assuming the deploy happened because the push did.

## When Actions comes back

Do not wait for the next scheduled slot. Dispatch the workflow with the
`refresh_now` input set, which is the only thing that runs `refresh-data`
outside a schedule:

```
Actions → CI & Daily Data Refresh → Run workflow → refresh_now: true
```

Also worth dispatching once: `probe-debt-sources`, which reports whether the
AfDB and IMF may be republished and what the IMF carries for Kenya. That
question cannot be answered from a development container for the egress reason
above.

## What not to do

**Do not add a second refresh path** — a cron on a server, a scheduled function,
a manual script that writes `public/data/` on a different cadence. (`npm run
refresh` is not one: it has no cadence, and it drives these same scrapers.) Two writers
to the same dataset with different clocks is how the figures start disagreeing
with `freshness.json`, and that file is the only thing telling the reader how
old the numbers are.

**Do not hand-edit `public/data/*.json`.** Every value there carries a `source`
that a reader can check, and `/tbills/` prints it next to the rate. A
transcribed number keeps a provenance string it did not come from.
