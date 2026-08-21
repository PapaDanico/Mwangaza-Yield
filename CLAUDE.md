# Working on this repository

Notes for Claude Code sessions. Everything here was learned the expensive way —
by a session spending tokens to discover it. Read it before reaching for a tool.

---

## How to work here

**Tokens cost real money and the owner has said so.** That is not a style note,
it is a constraint on what to do next.

- **Do not re-audit settled ground.** This repository has been audited three
  times over. A fourth pass produces confirmations, not findings, and bills for
  them. Prefer one verified fix to another sweep.
- **Do not re-research what is already researched.** `docs/REVENUE.md` and
  `docs/BUSINESS-MODEL.md` are a sequenced, costed revenue plan with the
  arithmetic done and sources named. It is better than a cold web search would
  produce. Execute it; do not pay to rediscover it.
- **Propose before a large spend.** Say what it will cost and what it buys, and
  let the owner choose. "Upgrade the platform" is unbounded — bound it first.
- **No monitoring loops unless asked.** Polling a blocked service re-reads a
  stale result at full price. Prefer one check timed to when the state can
  actually have changed, and say why that time was chosen.
- **Report what you did not do, and why.** Declining to act, with a reason, is
  a legitimate and often correct outcome.

### Verify before asserting

Every claim in this file was checked before it was written, and that is the
house standard. Three separate defects this year came from a guess recorded in
the same voice as a finding — most memorably a runbook that opened by calling
this repository private and blaming an Actions minutes quota. It is public.
There is no quota. That sentence survived review and was then repeated in a
pull request description before anyone tested it.

Do not take a **subagent's** finding at face value either. One correctly
observed that the Data Health panel had lost its Bonds and Auctions rows, and
its implied repair — add them to `freshness.json` — would have reintroduced the
negative-age bug that caused the panel's per-dataset rule to be deleted.
Verify the finding, then decide the fix independently.

---

## Research the web with WebSearch, not WebFetch

**Use `WebSearch`. Do not use `WebFetch`.**

`WebFetch` reaches a host directly, and outbound HTTPS from these sessions goes
through a policy-enforcing egress proxy that denies most external hosts. The
failure is a `403` on `CONNECT`, which looks nothing like "you are not allowed"
and everything like the site being down — so the natural next move is to retry,
and retrying spends tokens on a wall that will not move.

`WebSearch` returns results without needing a tunnel to the target host, so it
works where `WebFetch` cannot.

If a fetch is genuinely unavoidable, read the reason rather than guessing:

```bash
curl -sS "$HTTPS_PROXY/__agentproxy/status"      # recentRelayFailures names the host
cat /root/.ccr/README.md                          # failure classes and fixes
```

Its guidance is explicit: **do not retry or route around a 403/407. Report the
blocked host.**

### Hosts confirmed blocked

`centralbank.go.ke`, `docs.netlify.com`, and `mwangazayield.org` — the site's
own production domain.

Two consequences worth stating rather than rediscovering:

- **A session cannot verify the live site by loading it**, and must say so
  rather than implying it checked. Netlify's deploy record is the available
  evidence, and it is good evidence — it is just not the page.
- **The scrapers cannot be run from a session.** They fetch CBK, KNBS, the
  Treasury and the World Bank. A refresh happens in CI or on a machine with
  real network access, or not at all.

---

## Deploying: merging to `main` already deploys

**Merging a pull request to `main` triggers a Netlify build that runs the full
pipeline** — the configured plugins, secret scanning across the upload, header
processing, and the build-time edge function that exists nowhere in this
repository. Observed twice on 21 August: `#260` produced deploy `6a87c8b5`
(48–57s), `#261` produced `6a87cf6c`, both `plugin_state: success` and
`edge_functions_present: true`.

**So after merging, do not fire a direct deploy.** It would rebuild identical
content from an identical commit and cost a second build credit for nothing.
Check `currentDeploy` and confirm its `commit_ref` matches the merge commit —
allow ~60s plus queueing before concluding it did not fire.

Direct deploy exists for when GitHub *cannot* carry the change. Then:

```bash
node scripts/predeploy-check.mjs      # 8 gates; exits non-zero and refuses
```

Full procedure, and the build-credit cost the policy carries, in
[`docs/RUNBOOK-DEPLOY.md`](docs/RUNBOOK-DEPLOY.md). Note the trap recorded
there: `netlify-should-build.sh` skips builds that cannot change the published
site, but it decides from `CACHED_COMMIT_REF`/`COMMIT_REF`, which a direct
deploy does not carry — so every direct deploy builds, including a docs-only
one. This repository has run its credit pool dry before.

### Verify every deploy against the previous one

`state: ready` and `error_message: null`; `deploy_validations_report`
secret scan clean; `available_functions` still lists everything it listed
before; `edge_functions_present` unchanged. Record the previous deploy id
first — it is the rollback target, and far easier to capture now than to
reconstruct later.

**Deploying is not refreshing.** A deploy publishes whatever data is committed
and fetches nothing.

---

## Git workflow

Work on `claude/admiring-noether-fg3037`, push, open a **draft** PR.

**After a PR merges, GitHub deletes the remote branch.** The local
`origin/...` ref goes stale, and the next `push --force-with-lease` is rejected
with `stale info` — which reads like a race and is not one. Prune first:

```bash
git remote prune origin
git checkout -B claude/admiring-noether-fg3037 origin/main
```

Confirm the old branch content is an ancestor of `main` before discarding it:
`git merge-base --is-ancestor origin/<branch> origin/main`.

---

## Browser checks DO run here

`npm run test:e2e` and `npm run verify:csp` both work, despite an error message
that suggests otherwise. Playwright looks for a versioned `chrome-headless-shell`
that is absent and prints "run npx playwright install" — do not run that. A full
Chromium is already present and both scripts already accept an override:

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run verify:csp
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
```

Check the directory first — the version suffix changes: `ls /opt/pw-browsers/`.

These matter disproportionately while CI is down, being the only checks that
exercise the built site in a real browser: CSP violations on every route, WCAG
contrast floors, layout overflow, console errors and CLS. A previous session
reported them unrunnable; they were not.

---

## Python

`pip install -r backend/requirements.txt` before running anything under
`backend/scrapers/`. Without it `lxml` is missing and the parser tests fail with
`FeatureNotFound`, which reads like a code defect and is not one.

`test_tls_chain.py` fails here regardless, on a broken system `cryptography`
build (a `pyo3` panic before any test body). Environment, not code, and
unverifiable either way from a session.

**Run the whole Python suite, not a sample.** Two red tests survived for days
because a session ran the full TypeScript suite and only `test_macro_parser.py`.

---

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
reader-facing staleness notice on data that is exactly as old as it was — the
failure `docs/RUNBOOK-REFRESH-WITHOUT-CI.md` warns about most directly. If the
banner shows, the honest fixes are to run the pipeline or to leave it showing.

Note the banner is about the **pipeline**, not about any figure being wrong.
Check per-indicator budgets before assuming the numbers are stale: the CBR is
set at an MPC that meets roughly every two months, and a July CPI print is the
most recent that exists no matter when you look.

---

## Absence is not zero

The defect this codebase has produced most often: a missing figure rendered as a
confident value. `macroRegime` asserted "Debt within threshold" about a number
nobody had, and — worse — counted it toward a *more* confident verdict, so
deleting bad data made the recommendation stronger. `computeTermPremium`
returned `0` where its sibling returns `null`.

So a value that can be absent is `number | null`, and each caller decides what
to show. A `null` reaching a verdict contributes **nothing** — not a pass, not a
fail. `tests/unit/macro-regime.test.ts` pins the general form: *dropping a
figure must never upgrade the verdict.*

A lint rule was considered and **rejected**: of 47 `?? 0` sites, 44 are counters
where zero is correct, so it would flag 44 benign lines to catch none. This
repository distrusts a check that cries wolf — see `scripts/netlify-should-build.sh`.

---

## Known state — do not re-report these as new findings

Current as of 21 August 2026. Confirm before acting; do not rediscover.

| | state |
|---|---|
| **GitHub Actions** | Blocked account-wide. Runs are *created* but runner allocation fails — jobs die in 3–5s with `runner_id: 0`, zero steps, job log 404s. Not a quota: the repo is public and standard runners are free. Visible only in the web UI (Actions banner, Settings → Billing). |
| **Data pipeline** | Down since 19 Aug as a result. Figures remain inside their publisher cadences; **FX breaches its 4-day budget on 23 Aug** and is the only one that moves daily. |
| **Lighthouse Best Practices: 0** | Pre-existing and undiagnosed. Identical on deploys `6a875aeb`, `6a87c8b5`, `6a87cf6c`. CSP is ruled out — `verify:csp` is clean on all 30 routes. Not a regression from any recent work. |
| **CLS** | Four routes marginally over the 0.10 budget: `/` 0.1035, `/portfolio/` 0.1018, `/ladder/` 0.116, `/dashboard/` 0.1246. Real but modest; the harness notes its method is stricter than field CLS. |
| **`METRICS_TOKEN`** | Not configured. `REVENUE.md` §1 names this the highest return-on-effort item in the document — it gates three of four revenue paths. `/metrics` shipped in #260 as the reader; the env var is the remaining half. |

---

## Subagents

Worktree isolation writes a full checkout per agent into `.claude/worktrees/`.
`vitest.config.ts` excludes it — without that, vitest walks in and reports 568
files and 6,509 tests with 8 failures, none in the tree under test. Read the
reasoning there before changing test discovery.
