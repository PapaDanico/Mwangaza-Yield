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

### Resolve it. Do not hand it back.

The owner has asked, in terms, not to be given assignments. So a list of things
for them to do is a failure mode, not a status report. Before naming anything
as blocked, exhaust what is actually in reach:

- **Check whether a tool can do it** rather than assuming it cannot. Three
  items sat on a "yours to do" list for hours that were mine all along:
  `METRICS_TOKEN` was settable through the Netlify env-var tool, the CLS
  failures were ordinary code, and the browser suites ran fine once pointed at
  the Chromium already installed.
- **A transient error is not a blocker.** The Netlify API returned `502` three
  times before succeeding on the fourth. Do other work and come back; do not
  convert a flaky endpoint into a task for someone else.
- **Measure before concluding.** Four CLS failures looked like four problems
  and were one: `<main>` moving 99px because a banner appeared after mount.
  Reading the `layout-shift` source nodes found that in one pass; guessing
  would have produced four separate fixes for a single cause.
- **State genuine impossibility once, as a fact, not as a chore.** Actions
  being blocked account-wide and CBK being denied by egress policy are real
  walls. Say so plainly, say what it prevents, and move on — do not repeat it
  every turn as an outstanding item.

This does not override the ordinary confirmations: destructive or outward-
facing actions still need care, and a decision that is genuinely the owner's —
product direction, whether a feature they wanted should be deleted — is still
theirs to make.

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
works where `WebFetch` cannot. This is not theory: it is how the National
Treasury's debt bulletin URL scheme was found on 21 August, with
`treasury.go.ke` as unreachable as CBK.

**What it is good for, and what it is not.** Search is for DISCOVERY — does
this source exist, at what cadence, under what URL, has the site moved. It is
NOT a substitute for reading a primary document. A search result summarising a
figure gives you the number without its label, its reporting month, or its
publisher's terms, and shipping that is the attribution defect `licences.ts`
exists to prevent. Two results carrying Kenya's debt stock were declined for
exactly this reason on 21 August: both were CEIC and Trading Economics, which
are `refused` BY NAME in `licences.ts` with tests asserting it.

### The rule is about REACHING A HOST, not about one tool's name

This was first written as "do not use WebFetch", and that phrasing let the same
mistake through five times in the session that wrote it. No `WebFetch` call was
ever made. Instead `curl` was reached for — once at `centralbank.go.ke`, three
times at `mwangazayield.org`, once at a `netlify.app` deploy permalink — and
every one returned the same `403` on `CONNECT`, because the proxy does not care
which binary opened the socket.

So the rule covers **any** direct fetch: `curl`, `wget`, `fetch()` in a scratch
script, a Python `requests` call, a Playwright `page.goto` at a public URL.
Before reaching for one, ask what host it will contact and whether that host is
on the blocked list below. If it is, the answer is already known and the call
buys nothing.

Two habits that stay legitimate, because neither leaves the sandbox: `curl`
against `127.0.0.1` for a locally served build — this is how `verify:csp`,
`test:e2e` and the Lighthouse diagnosis all run — and `curl` against
`$HTTPS_PROXY/__agentproxy/status`, which reports the proxy's own state.

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

### A blocked host is not a blocked figure

**Being unable to reach a source is a reason to look elsewhere, not a reason to
stop.** On 11 September the reader banner spent a whole morning naming one
number — reserves import cover, 27 August, one day past its budget — because a
session ran two searches, failed to corroborate, and reported the wall instead
of working around it. The owner's objection was exactly right: a placard on the
page is not a substitute for the work, and "CBK is egress-blocked" describes one
route, not the question.

Three more searches found it. The figure was then corroborated three ways before
being written, which is the bar and is worth restating as a method:

1. **Two independent retrievals**, from differently-phrased queries, returning
   the same value and date. A single result is not enough, and neither is the
   same result found twice the same way — an exact-string search for the figure
   had FAILED earlier, which is why it was not written that morning.
2. **A series that stays monotonic with a primary document anchoring it.**
   20 Aug (press, 6.3 months) -> 27 Aug (**the CBK document the owner supplied**,
   6.2) -> 3 Sep (search, 6.1). Both units fell together across three points from
   three origins. A figure that breaks the series it joins is wrong whatever
   carried it.
3. **A unit cross-check that has to reconcile.** USD 14,880m at CBK's own
   129.47 is KSh 1.927tn, which matches the "above Ksh1.9 trillion" the same
   week was reported as. This is the same trick as reconciling a T-bill notice's
   column totals: an arithmetic identity somebody would have had to fake on
   purpose.

**And the tenor trap is real, so check the label, not just the number.** Search
for the 10 September T-bill results returned "8.7674% for 182-day". The primary
notice showed 8.7674 is the **91-day**; the 182-day was 8.9296. The only warning
available beforehand was that the figure implied the 182-day falling 0.166pp in
a week while the 364-day moved 0.007 — an anomaly in the shape of the data. That
is why it was not written from search, and why the document was worth asking for.

So: ask for the document first, it beats everything. When none is coming, search
is legitimate — corroborated, cross-checked, and with `null` for anything that
stays unsourced.

**CBK's Weekly Bulletin has a findable URL scheme**, surfaced by search on 12 Sept:
`centralbank.go.ke/uploads/weekly_bulletin/<digits>_Weekly%20CBK%20Bulletin%20<Month>%20<D>,%20<YYYY>.pdf`.
The numeric prefix is not derivable, so the path cannot be constructed — but the
scheme means a search naming the bulletin and its date will usually surface the
exact PDF, and the OWNER can open it even though a session cannot. It is published
on Fridays and carries USD/KES, reserves and import cover, and inflation in one
document — the three things this archive most often needs at once. Ask for it by
name and date.

### Reading a PDF, including its charts

Documents arrive as uploads because the sources cannot be fetched. Two tools
are needed and neither is installed by default.

```bash
pip install --force-reinstall --no-cache-dir cryptography   # see Python, below
pip install pypdf
```

`pypdf` extracts a text layer, which is enough for prose. **It is not enough
for charts**, and that distinction has already nearly cost a wrong figure. Text
extraction returns a chart's values and its series names as SEPARATE runs, so
pairing them is reading order rather than anything the document asserts —
"6.70, 6.13, 6.5" beside "Banks, Non-banks, Actual" is a guess dressed as a
reading.

So rasterise and look at it:

```bash
npm i --no-save pdfjs-dist@4.0.379
# render page N to canvas in a served page, screenshot the canvas with
# playwright-core + CHROMIUM_PATH, then Read the PNG
```

That is how the July 2026 survey figures were verified rather than inferred.
A scanned or image-only page extracts as zero characters and must be read this
way regardless.

---

## Deploying: Netlify serves the domain. Vercel did not, and is paused

**Resolve the domain before believing any platform's own dashboard.** Both
Netlify and Vercel listed `mwangazayield.org` in their configuration, and only
DNS decides which one answers.

```
mwangazayield.org      -> 18.208.88.157, 98.84.224.111
mwangazayield.netlify.app -> 18.208.88.157, 98.84.224.111   # identical
mwangaza-yield.vercel.app -> 216.198.79.195, 64.29.17.195   # never resolved to
```

Checked 7 September with `socket.getaddrinfo`, which works from a session:
the egress proxy blocks HTTPS to the apex, but it does not block DNS. That is
the cheapest decisive check available and it should be the FIRST one.

**Netlify is the live host.** The `deploy` section below is correct and
applies.

### The trap this cost a session

A Vercel project (`prj_sSLiX7dCSiqTjh0YX9zVzOZbAqKT`, team
`team_9GgQc2d22DKrrezHf3Hjmc5i`) was created on 23 August, connected to this
repo, and built every push to `main` — including a CLAUDE.md-only commit that
`netlify-should-build.sh` correctly skipped. Its production deployment listed
`mwangazayield.org` and `www.mwangazayield.org` in `alias` with
`aliasError: null`.

That `aliasError: null` is not proof of anything. It means Vercel accepted the
alias into its own configuration, not that the domain points there. Reading it
as proof produced a confident, wrong conclusion — that Vercel was serving
readers and Netlify's seventeen-day-old production deploy did not matter —
recorded in this file in the same voice as a finding, which is the exact
failure the "Verify before asserting" section above exists to prevent. One
`getaddrinfo` call reversed it.

**The project is PAUSED as of 7 September**, at the owner's instruction, since
it served no traffic and only duplicated build spend. Deleting it outright and
disconnecting the GitHub integration are dashboard actions and were left to
the owner. If a `vercel[bot]` comment appears on a future pull request, the
integration is still attached — and one did, on **#279, 8 September**, so it
IS. Pausing the project stops it deploying, not commenting: the bot posted a
`Blocked` deployment row on the PR. The switch is Vercel dashboard → the
project's Git settings → disconnect, or from the GitHub side, Settings →
Integrations → Vercel. Both are dashboards, so both stay the owner's.

**What was NOT a dashboard action, checked rather than assumed:** stopping it
building. `vercel.json` now carries `git.deploymentEnabled: false`, which
Vercel's own documentation gives as the way to "prevent any branch from
triggering a deployment" — read from the repository, no dashboard involved.
It was written off as unreachable until `search_vercel_documentation` was
actually asked. The bot may still comment, since commenting is the GitHub App
rather than the project; what it can no longer do is BUILD.

**It still posts a red status, and that sentence used to claim otherwise.** This
file said `vercel.json` had stopped Vercel posting a red status on every pull
request. Observed on **#287, 11 Sept**: a `Vercel` commit status, state `failure`,
description **"Account is blocked."** The earlier claim was half right — the
`Deployment was blocked` row is gone because deployments are off — but the ACCOUNT
is blocked at a level above the project, so no repository setting can silence it.
Nothing in the tree will fix it and nothing should try: Vercel has never served
`mwangazayield.org` (DNS points at Netlify), it does not block merges, and the
remedy is the dashboard disconnect already described above. `vercel.json` is in `netlify-should-build.sh`'s skip list —
it configures a different host and Netlify never reads it — with a test that
was mutation-checked rather than trusted.

`@vercel/analytics` was mounted in the root layout until 7 September and was
broken in production: on a Netlify-served site `/_vercel/insights/script.js`
is a 404 on every route, in every reader's console. Web Analytics was not
enabled on the Vercel project either, so it had no working configuration on
either host. Removed.

## Deploying: merging to `main` already deploys

**Merging a pull request to `main` triggers a Netlify build that runs the full
pipeline** — the configured plugins, secret scanning across the upload, header
processing, and the build-time edge function that exists nowhere in this
repository. Observed twice on 21 August: `#260` produced deploy `6a87c8b5`
(48–57s), `#261` produced `6a87cf6c`, both `plugin_state: success` and
`edge_functions_present: true`.

**So after merging, do not fire a direct deploy.** It would rebuild identical
content from an identical commit and cost a second build credit for nothing.
Check `currentDeploy` and confirm its `commit_ref` matches the merge commit.

**Allow at least fifteen minutes before concluding it did not fire.** "~60s
plus queueing" was written from the 21 August merges, where the build itself
took 48-57s, and it reads as though a minute is the whole wait. It is not. PR
#278 was merged at 07:04 on 7 September and Netlify did not create the deploy
until 07:16 — twelve minutes of queue, then a 118s build, published 07:18.

That gap is a trap, because everything visible during it points the other way.
`currentDeploy` still names the previous deploy, whose `deploy_source` reads
`api`, and the merges since the last publish have not deployed either — so the
evidence assembles into "the git integration is dead" when the truth is "the
queue is long". The session that wrote this got as far as running
`predeploy-check.mjs` on that reading before checking one more time and finding
the build had landed on its own.

A direct deploy at that moment would have been worse than a wasted credit.
`netlify.toml` declares **no** `[[plugins]]`: the Next runtime, the Lighthouse
plugin and the build-time edge function are all configured in the Netlify UI
and run only in a Netlify-side build. A direct upload of `out/` skips every one
of them, which is what `predeploy-check.mjs` means by "a direct upload can drop
it". And it could not have been done from a session anyway — `api.netlify.com`
is blocked by the egress proxy, so the CLI cannot reach it.

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

For a GIT-CONNECTED merge the skip list does apply, and it now covers `docs/`,
`scripts/`, `tests/`, `backend/`, `.github/`, `README.md`, **`CLAUDE.md`**,
`LICENSE`, `SECURITY.md` and `.gitignore`. The last two additions were made
after a CLAUDE.md-only merge ran a full production build — the same charge the
script's own comment records being paid when `LICENSE` was added. Editing this
file no longer costs a deploy.

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

Work on the branch your session was assigned, push, open a **draft** PR. The name
changes per session — it was `claude/admiring-noether-fg3037` when this section was
written and `claude/loving-mayer-dw9jws` on 11 Sept — so read it from your own
instructions rather than from this line, and substitute it below.

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

`test_tls_chain.py` used to fail here on a broken system `cryptography` build
— a `pyo3` panic before any test body — and was written off as unverifiable.
**It is fixable and now passes.** The Debian-packaged `cryptography` cannot be
uninstalled by pip (no RECORD file), but forcing a reinstall lays a working
build over it anyway:

```bash
pip install --force-reinstall --no-cache-dir cryptography   # prints an
                                                            # uninstall ERROR
                                                            # and works anyway
```

The error message is alarming and irrelevant: `import cryptography` succeeds
afterwards, and so does the whole Python suite. Do not skip this on the
strength of the error. **With it, all of CI's Python tests pass here** — the
only suite that used to have a permanent exemption no longer needs one.

This also unblocks `pypdf`, which imports `cryptography` unconditionally.

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

### Prefer a supplied document over search. Ask for one.

**The owner can paste CBK's own notice, and that beats any amount of
searching.** On 7 September three arrived — the T-bill results, the daily
exchange rates, and a switch result — and each replaced or corrected something
search had produced. The search-derived 27 August T-bill rates committed
earlier that day were superseded within the hour by the primary 3 September
notice. If a figure matters, ask for the document before reasoning from
fragments.

Cross-check a supplied document against data already held before writing it.
The 9 September switch notice was verified by its ISIN, maturity and coupon all
matching `bonds.json` exactly; the T-bill notice by both column totals
reconciling to 28,000.00M offered and 51,023.38M accepted. That is what makes a
transcription checkable rather than trusted.

### Updating it from search, when no document is available

The method, because getting the DATE wrong is easier than getting the rate
wrong:

**Pin the auction date from the issue-number sequence, not from a headline.**
The numbers advance by one a week across all three tenors, and the `DATED`
value is the Monday value date. `2696/091 DATED 24-08-2026` is the Thursday
20 August auction; therefore 2697 (DATED 31-08) is 27 August and 2698 (DATED
07-09) is 3 September. An earlier reading in that same session had these a
week out, from assuming `DATED` was the auction day. **Confirmed against the
primary notice**: the 2698 document is headed `DATED 07-09-2026`, a Monday, and
names the next auction as `DATED 14/09/2026`, also a Monday — Thursday 10
September.

**Corroborate the rate three ways before writing it.** For 27 August: CBK's
own Treasury Bills page carried them as the "Previous Average Interest Rate"
against the following auction; a second result reported them as CBK weighted
average rates for bills issue-dated 31 August; and press coverage said all
three tenors DECLINED, which each figure confirms against the values it
replaces. One search result carrying a number is not enough — the "previous
average interest rate" column in particular is a figure whose vintage is one
auction older than the page it appears on, which is exactly the unlabelled
number the WebSearch section warns about.

**Write `null`, not the last known value, for anything unsourced.**
`amountOfferedKES` and `amountAcceptedKES` are `number | null` for this
reason. Press gave the 27 August aggregate (Ksh 28bn offered, Ksh 56.7bn bid)
but no per-tenor split, so both are null on those records. Neither is rendered
anywhere, so honesty costs the reader nothing.

**Regenerating the feed is required and has a side effect.** rates.json is
derived from tbills.json, so `npm run build:engine && npm run build:rates`
must follow. See the note below on why the liveness canary no longer reads
rates.json.

### Never stamp `meta.json` to clear the staleness banner

`meta.generatedAt` means "the pipeline ran". Writing it by hand claims a
refresh that did not happen, on data exactly as old as it was — the failure
`docs/RUNBOOK-REFRESH-WITHOUT-CI.md` warns about most directly.

**The reader-facing banner no longer reports pipeline liveness at all**, so
stamping `meta.json` would not even silence it. It reports figures that are
past their OWN publisher's cadence, computed by `readerNotice` from the live
clock against dates in the data — which is why a dead pipeline cannot mute it.

That change was made because the old banner lied. On 21 August it told readers
"these figures were last updated on 2026-08-19… auction rates move weekly, so
treat anything here as indicative" — while the T-bill figures it singled out
had been updated on the 20th, and `freshness.json` said so. Every figure on the
page was inside its cadence. A banner that cries wolf spends the credibility it
needs for the day something is genuinely wrong.

Pipeline liveness is still visible, in the Data Health panel's "Pipeline last
ran" row — read by whoever operates this, not by somebody pricing a bond.

**And in `published-data-freshness.test.ts`, which now reads meta.json too.**
It used to measure rates.json's `generatedAt`, on the stated reasoning that
"a date somebody can edit is a date somebody will edit". rates.json did not
satisfy that: `npm run build:rates` regenerates it from committed data with no
network and stamps a fresh date, so any legitimate hand-edit to tbills.json
silenced the pipeline alarm as a side effect. meta.json is the signal that
test always wanted — nothing local writes it, and hand-stamping it is the one
edit forbidden outright above.

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

Current as of **11 September 2026**. Confirm before acting; do not rediscover.

Several rows below were corrected on 11 Sept after being checked against the
tree rather than trusted. That is the intended lifecycle of this table: it is a
record of what was true when somebody last looked, not a standing fact. If a row
and the repository disagree, the repository is right and the row is the defect —
fix it in the same session that found it.

| | state |
|---|---|
| **GitHub Actions** | **It worked, then stopped — checked, not assumed.** Runs 24-28 completed `success` on 25 July 2026, full ~50s runs on push and pull_request; the API still returns them. So "it never worked from day one" is not what the record shows, and the distinction decides where to look: a workflow that ran green and then stopped allocating runners is a change OUTSIDE this repository, and editing `ci.yml` cannot move it. Dead since **15 Aug, 13:34 UTC**. Runs are created; runner allocation fails; jobs die in 2-5s with `runner_id: 0`, zero steps, logs 404 and an empty check-run output. Workflow `state` is `active`. **The cause is BILLING — confirmed by the owner on 11 Sept 2026**, who asked that it be left alone. That is the answer to a question earlier sessions could only point at, since it is visible only in the web UI (the Actions tab banner, and Settings → Billing and licensing) and no API a session can reach reports it. Do not spend tokens re-deriving it from `runner_id: 0`, and do not raise it as an outstanding item: it is a known, accepted state, not a task. A red `test-and-build` on a pull request is therefore never that PR's failure — check the job record (2-5s, `runner_id: 0`, no steps) and say so once, rather than re-running it into the same absent runner. **Do not wait for it — see [`docs/RUNNING-WITHOUT-ACTIONS.md`](docs/RUNNING-WITHOUT-ACTIONS.md) and use `npm run ci` and `npm run refresh`.** |
| **Data pipeline** | Still down — `meta.generatedAt` is 19 Aug and the liveness canary is red at **23 days**. The **reader banner is silent as of 11 Sept, and has earned it**: T-bills 1 day (budget 10), reserves 8 (14), USD/KES 4 (4), everything else well inside cadence. Fresh figures are not a working pipeline. The Data Health panel's "Pipeline last ran" row and the canary are what still report the machinery, and they are the honest red — `meta.json` must never be hand-stamped to quiet them, which would not even work, since `readerNotice` stopped reading pipeline liveness in August. |
| **What the archive is missing** | **Rewritten 11 Sept; the previous text was stale in three places.** **T-bills** are at the **10 Sept** auction — 8.7674 / 8.9296 / 9.0665, amounts sourced, `nextAuctionDate` 17 Sept — from CBK's notice for issues 2699/091, 2673/182, 2628/364 DATED 14-09-2026, supplied directly and reconciled on both column totals (28,000.00M offered, 53,281.57M accepted). **The 2 Sept bond auction is NOT missing**, whatever this row used to say: FXD3/2019/015 (WAR 12.7631, market 12.829) and SDB1/2011/030 (WAR 13.6937, market 13.7991) are in `auction-results.json`, written from the document signed D. Luusa rather than from the press reports this row warned against. `auction-results.json` now ends **7 Sept** (the FXD4/2019/010 switch, accepted WAR 11.1398%), not 26 Aug. **Reserves** advanced to **3 Sept** (6.1 months, USD 14,880m). **USD/KES** is 129.45 at 10 Sept and **reserves** 6.3 months / about KSh 1.97 trillion, also 10 Sept, both from CBK's Weekly Bulletin dated 11 Sept. That bulletin also retro-confirmed the 3 Sept reserves figure written the day before ("an improvement from 6.1 months recorded on September 3", "up from about KSh 1.93 trillion"), which is the corroboration method working. **An earlier version of this row said `macro.json` is scraper-written and so cannot be hand-edited. That was wrong** — its FX and CPI rows already carried `"via": "supplied-document"` and notes reading "entered by hand while the pipeline is down". Hand-editing it is established practice; what matters is recording the route in `via` (`supplied-document` for a pasted notice, `search-corroborated` for a figure that was not read from the primary PDF) and saying so in `sourceNote`. Declaring a file unfixable without opening it is the same failure as declaring a figure unreachable after two searches. The standing rule survives all of this: press outlets are unregistered in `licences.ts` and `licences.test.ts` fails the build on a source that does not resolve. |
| **Every scraper source is egress-blocked, verified per host** | Checked individually on 7 Sept, not inferred from CBK alone: `api.worldbank.org`, `www.centralbank.go.ke`, `www.knbs.or.ke`, `www.treasury.go.ke`, `data.imf.org`, `api.imf.org` and `opendataforafrica.org` all fail `CONNECT` with 403. There is no partially-open route — no scraper can run from a session, including the keyless World Bank one. `list_environments` shows a single environment, so there is no second sandbox with different egress to try. |
| **`npm run ci` and `npm run refresh`** | The two Actions jobs, runnable anywhere. `ci.mjs` is `test-and-build` derived step for step from `ci.yml`, in the same order, so they cannot drift without one being visibly shorter. `refresh-data.mjs` is the pipeline, and `--push` commits and pushes — but only a run where a dataset's `asOf` in `freshness.json` actually advanced. Exit code and files-changed both LOOK like success on a run that fetched nothing (`macro_parser.py` exits 0 via `carry_forward()`; `data-manifest.json` advances `lastSuccessfulScrape` when every source 403'd), and a files-changed rule was tested here and kept a dead run. Both need real network, which no session has. The sustainable home is a machine the owner controls plus one crontab line — the alternatives, including why every JavaScript-only runtime is out (the scrapers are Python), are compared in `docs/RUNNING-WITHOUT-ACTIONS.md`. |
| **Deploy previews are OFF, deliberately** | Every pull request's Netlify preview is cancelled with `Failed during stage 'checking build content for changes': Canceled build due to no content change`. That is NOT a fault and not `netlify-should-build.sh`: it is `[context.deploy-preview] ignore = "exit 0"` in `netlify.toml`, with `[context.branch-deploy]` beside it. Previews were about HALF of all build spend against a pool that hit zero and left two merged commits unpublished. Production is unaffected — `#286` merged and published normally the same afternoon. **Do not investigate this, and do not delete the block.** An automated agent already did, answering the question its own comment answers, and added a test asserting the block was absent so the saving could not be restored without the build failing. Bringing previews back is a call on the build budget, and the owner's. A session spent four cancelled previews re-deriving this on 11 Sept before reading 30 lines of `netlify.toml`. |
| **Bonds and Auctions have no freshness row, deliberately** | Do not add one. `auctions.json` is a FORWARD-looking calendar and `bonds.json` holds maturity dates, so `now - date` is negative for most rows — the negative-age bug that got the panel's per-dataset rule deleted in the first place. The auction calendar being entirely in the past is already covered by a canary in `published-data-freshness.test.ts`. **That canary is GREEN as of 11 Sept** — it was red when this row was written, and #281 fixed it by adding the 16 Sept auction. Do not re-report it as failing without running it. |
| **`verify:sw` and the calendar** | The shell digest is taken over pages whose bytes move on their own. Three causes, all settled 8 Sept: the staleness notice's "N days old", the navbar title's "and N scheduled updates" (ticks by two a day, on all twelve routes), and `/macro/`, whose T-bill ladder is anchored to TODAY and so moves entirely every night. The first two are blanked by `normalise()`; `/macro/` is in `CALENDAR_ROUTES` and excluded — still precached, but outside change detection. **Do not re-record `SHIPPED_DIGEST` to make a red check green without first running the clock shim.** Build twice with `global.Date` shifted (`NODE_OPTIONS=--require` a shim adding a day) and diff `npm run verify:sw -- --entries`: identical means the drift is calendar, different means somebody shipped a page behind a stale cache version, which is the whole point of the guard. Shifting **45** days legitimately moves every route — the staleness banner appears because figures really have passed their cadence — so use **one** day to test drift. |
| **Lighthouse Best Practices: 0** | **A reporting artifact, not a site defect — diagnosed 21 Aug.** Run directly against the built site with the production CSP and headers applied, Lighthouse scores Best Practices **1.0 (100) with zero failing audits**. Netlify's plugin has reported 0 on every deploy including ones scoring 77 Performance / 100 Accessibility / 100 SEO. Do not chase it in the code; the site is clean. Reproduce with `npm i --no-save lighthouse` and run it against a local server that applies the netlify.toml headers. |
| **CLS** | **Re-measured and widened 7-8 Sept.** The guard listed SIX routes out of thirteen and reported six — and **four routes outside it were over budget**: `/goals/` 0.2752, `/prices/` 0.2519, `/calculator/` 0.2502, `/sell/` 0.2225 against 0.1. One cause, already written up in `smoke.mjs` for `/tbills/` and fixed only there: `DataState`'s loading skeleton is `h-64` on every page, and the ToolShell tool that replaces it is 936-10,299px, throwing the server-rendered prose below it down the page. `DataState` now takes a `reserve` height and those four pass `h-[900px]` — a little over one viewport, deliberately NOT the final height, which varies with the reader's own data. The route list now covers twelve and the summary counts the list. All twelve inside budget: `/` 0, `/dashboard/` **0.0381**, `/auctions/` 0, `/ladder/` 0.0196, `/tbills/` 0, `/portfolio/` 0.0024, `/goals/` 0.0104, `/calculator/` 0.0268, `/sell/` 0, `/prices/` 0, `/macro/` 0, `/yield-curve/` 0. Dashboard fell 0.0784 -> 0.0381 when six drifted `Reserve` heights were re-measured (TopYields reserved 196 for 348; SovereignContext 180 for 1,350). **A guard that covers half the routes reports half the routes** — that is the lesson worth keeping. |
| **Python suite** | Fully green here, including `test_tls_chain.py`, once `cryptography` is force-reinstalled. It previously carried a permanent exemption in this file; it no longer needs one. |
| **`expectations.json`** | New 21 Aug — CBK Market Perceptions Survey inflation expectations, four horizons, banks and non-banks separate. Opinions, not measurements: fenced in the UI, excluded from `macroRegime` by test, and budgeted at 75 days so a late survey names itself. |
| **`METRICS_TOKEN`** | **Set 21 Aug** — secret, scoped to builds/functions/runtime. This was `REVENUE.md` §1's highest return-on-effort item, gating three of four revenue paths. `/metrics` (shipped #260) is the reader. Counters should now be readable; the next step is letting them accumulate before any commercial conversation. |

---

## Subagents

Worktree isolation writes a full checkout per agent into `.claude/worktrees/`.
`vitest.config.ts` excludes it — without that, vitest walks in and reports 568
files and 6,509 tests with 8 failures, none in the tree under test. Read the
reasoning there before changing test discovery.
