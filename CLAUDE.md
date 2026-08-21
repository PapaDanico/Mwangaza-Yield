# Working on this repository

Notes for Claude Code sessions. Everything here was learned the expensive way —
by a session spending tokens to discover it. Read it before reaching for a tool.

## Research the web with WebSearch, not WebFetch

**Use `WebSearch`. Do not use `WebFetch`.**

`WebFetch` reaches a host directly, and outbound HTTPS from these sessions goes
through a policy-enforcing egress proxy that denies most external hosts. The
failure is a `403` on `CONNECT`, which looks nothing like "you are not allowed"
and everything like the site being down — so the natural next move is to retry,
and retrying spends tokens on a wall that will not move.

`WebSearch` returns results without needing a tunnel to the target host, so it
works where `WebFetch` cannot.

If a fetch is genuinely unavoidable, check the proxy state first and read the
reason rather than guessing:

```bash
curl -sS "$HTTPS_PROXY/__agentproxy/status"      # recentRelayFailures names the host
cat /root/.ccr/README.md                          # failure classes and fixes
```

Its guidance is explicit and worth obeying: **do not retry or route around a
403/407. Report the blocked host.**

### Hosts confirmed blocked

`centralbank.go.ke`, `docs.netlify.com`, and `mwangazayield.org` — the site's
own production domain. So a session **cannot verify the live site by loading
it**, and must say so rather than implying it checked. Netlify's deploy record
(`commit_ref`, `state`, secret-scan results, `edge_functions_present`) is the
available evidence, and it is good evidence — it is just not the page.

The practical consequence: **the scrapers cannot be run from a session.** They
fetch CBK, KNBS, the Treasury and the World Bank. A refresh has to happen in CI
or on a machine with real network access.

## Browser checks DO run here

`npm run test:e2e` and `npm run verify:csp` both work, despite an error message
that suggests otherwise. Playwright looks for a versioned `chrome-headless-shell`
that is absent, and prints "run npx playwright install" — do not run that. A
full Chromium is already present and both scripts already accept an override:

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run verify:csp
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
```

Check the exact directory first — the version suffix changes:
`ls /opt/pw-browsers/`.

These matter disproportionately when CI is down, because they are the only
checks that exercise the built site in a real browser: CSP violations across
every route, WCAG contrast floors, layout overflow, console errors and CLS.
A session that skips them is checking less than CI would.

## Python

`pip install -r backend/requirements.txt` before running anything under
`backend/scrapers/`. Without it `lxml` is missing and the parser tests fail with
`FeatureNotFound`, which reads like a code defect and is not one.

`test_tls_chain.py` fails here regardless, on a broken system `cryptography`
build (a `pyo3` panic before any test body). That is the environment, not the
code, and it cannot be verified either way from a session.

Run the whole Python suite, not a sample. Two red tests once survived for days
because a session ran the full TypeScript suite and only `test_macro_parser.py`
from the Python side.

## Never hand-edit a generated file

`public/data/` is almost entirely output. Editing it by hand is silently undone
by the next pipeline run — an agent once hand-added five QEBR indicators and the
next refresh wiped every one, because `qebr_parser.py` regenerates that file
wholesale.

Regenerate instead:

```bash
cd backend/scrapers && python healthcheck.py --publish   # writes freshness.json
npm run build:engine && npm run build:rates              # writes rates.json/.csv
```

**The exception is `public/data/tbills.json`**, which no scraper writes — see the
docstring in `probe_tbill_rates.py`. Hand-editing it is the intended mechanism
until a parser exists. Its `auctionDate` is the **auction day (a Thursday)**,
not the `DATED` value on CBK's notice, which is the Monday value date.

### Never stamp `meta.json` to clear the staleness banner

`meta.generatedAt` means "the pipeline ran". Writing it by hand suppresses the
reader-facing staleness notice on data that is exactly as old as it was, which
is the one failure `docs/RUNBOOK-REFRESH-WITHOUT-CI.md` warns about most
directly. If the banner is showing, the honest fixes are to run the pipeline or
to leave it showing.

## Absence is not zero

The defect this codebase has produced most often: a missing figure rendered as a
confident value. `macroRegime` asserted "Debt within threshold" about a number
nobody had; `computeTermPremium` returned `0` where its sibling returns `null`.

So a value that can be absent is `number | null`, and each caller decides what
to show. A `null` reaching a verdict must contribute **nothing** — not a pass,
not a fail. `tests/unit/macro-regime.test.ts` pins the general form of this:
*dropping a figure must never upgrade the verdict.*

A lint rule for it was considered and **rejected**: of 47 `?? 0` sites, 44 are
counters where zero is correct, so it would flag 44 benign lines to catch none.
This repository distrusts a check that cries wolf — see the reasoning in
`scripts/netlify-should-build.sh`.

## Deploying

Direct to Netlify is the policy; the git-connected build is the fallback. Run
`node scripts/predeploy-check.mjs` first. Full procedure, and the build-credit
cost the policy carries, in [`docs/RUNBOOK-DEPLOY.md`](docs/RUNBOOK-DEPLOY.md).

Deploying is not refreshing. A deploy publishes whatever data is committed and
fetches nothing.

## Subagents

Worktree isolation writes a full checkout per agent into `.claude/worktrees/`.
`vitest.config.ts` excludes it — without that, vitest walks in and reports 568
files and 6,509 tests with 8 failures, none of them in the tree under test.
Read the reasoning there before changing test discovery.

Do not take a subagent's finding at face value. One correctly observed that the
Data Health panel had lost its Bonds and Auctions rows, and its implied repair —
add them to `freshness.json` — would have reintroduced the negative-age bug that
caused the panel's per-dataset rule to be deleted. Verify the finding, then
decide the fix independently.
