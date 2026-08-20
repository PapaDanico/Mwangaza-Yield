# Deploying

## The policy

**Deploy directly to Netlify. The git-connected build is the fallback.**

This inverts what the repository did until 20 August 2026, when publishing
depended on GitHub: merge to `main`, GitHub notifies Netlify, Netlify builds.
That path has a dependency the product does not need. When GitHub Actions
stopped assigning runners to this account on 19 August, CI died, the data
pipeline died with it, and the ability to publish was hostage to a third
service that had nothing to do with serving the site.

Direct deploys remove GitHub from the publishing path. The repository still
lives there and pull requests still work; they are simply no longer the only
way to get a change in front of a reader.

## What a direct deploy actually does

This is the fact that makes the policy safe, and it is not obvious from the
name. A direct deploy **does not upload a folder of files**. It uploads the
repository and runs a real build inside Netlify's own build system.

So everything Netlify normally does still happens: the build plugins configured
in the UI, secret scanning across the upload, header and redirect processing,
function bundling, and the edge function that is generated at build time and
exists nowhere in this repository. A raw file upload would silently drop that
edge function. This does not.

The practical consequence: a direct deploy is not a degraded deploy. It is the
same build, triggered differently.

## Before you deploy

Run the gate:

```bash
node scripts/predeploy-check.mjs
```

It exits non-zero and refuses if anything is wrong. It checks six things, each
standing in for a specific way a hand-triggered deploy goes wrong:

1. The tree is clean, and any divergence from `origin/main` is confined to
   files the build cannot read. `scripts/`, `backend/` and `tests/` never enter
   `out/`, so a difference there is reported and allowed. A difference under
   `src/` or `public/` is fatal — that would publish something `main` has never
   seen, which is the guarantee the git-connected path used to provide.
2. `out/data` matches `public/data` byte for byte, catching a build made before
   the data changed.
3. Every URL in `sitemap.xml` resolves to a file.
4. Shipped JSON parses, and every dataset is inside the budget
   `freshness.json` already carries for it.
5. No credential patterns anywhere in the build.
6. The functions directory still exists.

It does not check that the code is correct. Run `npm run verify` for that —
the gate is about whether the *artifact* is safe to publish.

If the gate blocks you, it is usually right. Do not weaken a check to get past
it; fix the thing it found, or fix the check on principle and say which you
did.

## Deploying

Ask the Netlify MCP server to deploy, giving it the site ID:

```
site ID: 16fef5cc-ad37-420d-b8c4-d7a75b171556
```

It returns a one-time command of the form:

```bash
npx -y @netlify/mcp@latest --site-id <site-id> --proxy-path "<signed-token>"
```

Run that from the repository root. The token is short-lived — if it has
expired, ask for a fresh command rather than editing the old one. Add
`--no-wait` to skip waiting for the build to finish, though waiting is usually
what you want, because the verification below needs the result.

**Before it starts, write down the current deploy ID.** That is the rollback
target and it is far easier to capture now than to reconstruct from a list of
deploys later.

## After you deploy

Compare against the deploy you wrote down:

- `state` is `ready` and `error_message` is null
- `deploy_validations_report.secret_scan_result` reports no matches
- `available_functions` still lists everything it listed before
- `edge_functions_present` is unchanged
- the live site serves the data you just built

If any of those regressed, roll back to the recorded deploy immediately and
investigate afterwards. A rollback is cheap and reversible; a broken production
site discovered by a reader is neither.

## What this costs, and the one real trap

Netlify builds are metered on this plan, and this repository has run the pool
dry before: **302 production deploys in one billing period consumed 4,530 of
6,387 credits**, then exhausted them entirely and left two merged commits
unpublished. A normal production build takes about 50 seconds.

`scripts/netlify-should-build.sh` exists to control that. It skips builds whose
changes provably cannot alter the published site — `next build` never reads
`docs/`, `tests/`, `backend/` or `.github/`.

**That saving does not apply to direct deploys.** The script decides by
diffing `CACHED_COMMIT_REF` against `COMMIT_REF`, and those are set by Netlify
for git-connected builds. A direct deploy does not carry them, so the script
takes its fail-safe branch and builds. Every direct deploy costs a build,
including one that only touches documentation.

This is the honest cost of the policy. Two ways to keep it small, in order of
how much they matter:

- **Batch.** Do not deploy per commit out of habit. The git-connected path made
  that free for doc-only changes and it no longer is.
- **Let the fallback handle doc-only work.** Merging to `main` without
  deploying still goes through the ignore script, which will correctly skip it.

Deploy previews are already off for the same reason — see the comment in
`netlify.toml`, which records that previews were roughly half of all build
spend. Do not turn them back on to "check" a direct deploy; that is what the
gate and the post-deploy verification are for.

## What this does not change

**The data pipeline still runs on GitHub Actions.** Direct deploys publish
whatever data is committed; they do not fetch anything. If the scrapers have
not run, deploying republishes the same figures with a newer build. See
`RUNBOOK-REFRESH-WITHOUT-CI.md` for refreshing by hand, and note the warning
there about scrapers that write even when they fetch nothing.

Deploying is not refreshing. Keeping the two ideas separate is what stops
someone concluding the data is current because the deploy was.
