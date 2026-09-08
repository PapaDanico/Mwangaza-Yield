# Running this project without GitHub Actions

## First, the record, because it is checkable and it matters

**GitHub Actions worked.** Runs 24 to 28 completed `success` on 25 July 2026 —
full runs of about fifty seconds, on both `push` and `pull_request`. The API
still returns them.

It is worth stating because the belief that it "never worked from day one"
leads somewhere different: a workflow that was never right is a bug in this
repository, and the fix is to correct the YAML. A workflow that ran green for
weeks and then stopped allocating runners is a change *outside* this
repository, and no amount of editing `ci.yml` will move it. The evidence says
the second.

What is also true, and is the reason this document exists: it has not run
since **15 August 2026, 13:34 UTC**, the runner is never allocated, the cause
is visible only in the GitHub web UI, and nobody here can clear it. Twenty-four
days is long enough to stop treating it as an outage and start treating it as
an absence.

## What it actually did

Only two of the five jobs run on their own. The other three are
`workflow_dispatch` diagnostics that fire when somebody remembers.

| job | trigger | what it is |
|---|---|---|
| `test-and-build` | every push and PR | the quality gate: tests, typecheck, lint, build, engine smoke, browser suites, CSP, service-worker shell, scraper parsers, archive integrity |
| `refresh-data` | `17 3,15 * * 1-6` | the data pipeline: nine scrapers, prediction ledger, rates feed, freshness, archive check, commit and push |

Everything else — deploying, publishing, the site itself — never depended on
Actions at all. Netlify builds from the git integration and always has.

## The replacements, which are in this repository now

```bash
npm run ci                 # everything test-and-build ran, on any machine
npm run refresh            # everything refresh-data ran, minus the commit
npm run refresh -- --push  # ... and commits and pushes, if anything arrived
```

`scripts/ci.mjs` is derived from `ci.yml` step for step, in the same order, so
the two cannot drift without somebody noticing one is shorter. It runs before
a push, which is where a gate is worth having.

`scripts/refresh-data.mjs` discards the entire run — stamps included — unless a
dataset's `asOf` in `freshness.json` actually advanced. That guard matters more
than it sounds: a scraper that reaches nothing still exits 0, still carries the
previous values forward, and still stamps `meta.json`. Committing that tells
the site the pipeline ran today, on data exactly as old as it was, and silences
the staleness notice at the moment it is most needed. Two weaker rules — exit
code, and files-changed — were tried and both kept a dead run.

**It needs a machine with real network access.** Every scraper source 403s from
a development container, verified per host. That is the whole constraint, and
it is what the options below are about.

## The options, honestly

The scrapers are **Python** — `pdfplumber`, `lxml`, `pandas`. That single fact
removes most of the fashionable answers: Cloudflare Workers, Vercel and Netlify
edge functions and every other JavaScript-only runtime cannot run them without
a rewrite nobody should undertake to work around a billing problem.

| | runs Python | schedules | commits back | cost | honest verdict |
|---|---|---|---|---|---|
| **GitHub-hosted runners** | yes | yes | yes | free | the incumbent; blocked, and not from here |
| **Self-hosted runner** | yes | yes | yes | free + a machine | **cheapest thing to try.** `ci.yml` needs one line changed and the block may not apply, since GitHub allocates nothing |
| **Any machine + cron** | yes | yes | yes | free | **the sustainable answer.** One line of crontab, no vendor, nothing to be blocked from |
| **Netlify scheduled function → build hook** | no | yes | no | build credits | the function is JS and cannot run the scrapers; a build could, but it starts from the committed tree every time, so the archive would never grow |
| **Netlify build runs the scrapers** | yes | no | needs a PAT | credits | no daily cadence of its own, and a build that pushes triggers a build |
| **A small VPS or a Raspberry Pi** | yes | yes | yes | ~$5/mo or nothing | the same as "any machine + cron", with uptime somebody else worries about |
| **GitLab CI mirror** | yes | yes | yes | free tier | works, and moves the same dependency to a different company |

### What to do

**Run it on a machine you control.** The scrapers fetch Kenyan government
sites from Kenya, which is where this is being read anyway:

```cron
# refresh at 06:20 and 18:20 Nairobi time, weekdays and Saturday
20 6,18 * * 1-6  cd ~/Mwangaza-Yield && /usr/bin/npm run refresh -- --push >> ~/mwangaza-refresh.log 2>&1
```

That is the whole replacement for `refresh-data`. It needs `git` able to push —
an SSH key or a credential helper — and nothing else. A laptop that is closed
half the time is still better than a pipeline that has not run in three weeks:
the script simply does nothing on the runs where the machine was asleep, and
the site keeps saying how old its figures are.

**And try a self-hosted runner before rewriting anything**, because it is one
line and it may simply work:

```yaml
runs-on: self-hosted   # was: ubuntu-latest
```

If the block is on hosted-runner allocation or on the minutes GitHub bills for,
a runner you own is outside it and `ci.yml` starts working again unchanged. If
Actions is disabled for the account outright, it will not, and you will know in
about five minutes which of those it is — which is more than the API has been
willing to say in three weeks.

## What this does not solve

The staleness the reader sees comes from the *data*, not from Actions. A
refresh that runs on your laptop publishes the same figures a runner would.
What no scheduler fixes is a source that has genuinely not published — and the
site already says which figures those are, computed from the live clock, so a
dead pipeline cannot mute it.
