#!/usr/bin/env bash
#
# Netlify's `ignore` command: exit 0 to SKIP the build, non-zero to RUN it.
# That polarity is inverted from every other exit code in this repo, so it is
# spelled out at both exit points below rather than left to be remembered.
#
# Why this exists: 302 production deploys in one billing period consumed 4,530
# of 6,387 credits and then ran the team out entirely, which is why two merged
# commits sat undeployed. A meaningful share of those builds could not have
# changed a single byte of the published site — `next build` is the whole build
# command, and it never reads docs/, tests/, backend/ or .github/.
#
# The list below is therefore not "things that seem unimportant". It is things
# `next build` provably does not read. Anything not on it builds, including
# public/data/*.json, which is exactly what the daily refresh commits and
# exactly what readers come for.
#
# Fail-safe direction is deliberate: every uncertain case exits 1 and builds.
# A build we did not need costs one credit. A skipped build we did need ships
# stale rates to someone deciding where to put their money.

set -uo pipefail

build()  { echo "netlify-should-build: $1 — BUILDING";  exit 1; }
skip()   { echo "netlify-should-build: $1 — skipping";  exit 0; }

# Netlify sets CACHED_COMMIT_REF to the commit of the last successful build of
# this context. On a first build, a cleared cache, or a context that has never
# deployed, it is absent — there is no baseline to diff against, so build.
[ -n "${CACHED_COMMIT_REF:-}" ] || build "no CACHED_COMMIT_REF (first build or cleared cache)"
[ -n "${COMMIT_REF:-}" ]        || build "no COMMIT_REF"

# A manual redeploy or a retry arrives with the same commit as the cache. The
# operator asked for a build; give them one.
[ "$CACHED_COMMIT_REF" != "$COMMIT_REF" ] || build "same commit as last build (manual redeploy or retry)"

# Netlify clones shallow. If the cached commit is not in this clone the diff
# cannot be trusted, and an untrustworthy diff must not cancel a build.
changed=$(git diff --name-only "$CACHED_COMMIT_REF" "$COMMIT_REF" 2>/dev/null) || \
  build "cannot diff $CACHED_COMMIT_REF..$COMMIT_REF (shallow clone?)"

# An empty diff between two different commits means something we do not
# understand happened. Build.
[ -n "$changed" ] || build "empty diff between two different commits"

# Paths `next build` does not read. Keep this list short and provable.
# LICENSE and SECURITY.md earn their place here the same way everything else
# does: `next build` provably does not read them. They were added on
# 2026-08-07 and the merge that added them triggered a full production deploy
# that could not change one byte of the published site — the cost this script
# exists to avoid, paid on the very commit that documented it.
relevant=$(echo "$changed" | grep -Ev '^(docs/|tests/|backend/|\.github/|README\.md$|LICENSE$|SECURITY\.md$|\.gitignore$)') || true

if [ -z "$relevant" ]; then
  skip "$(echo "$changed" | wc -l | tr -d ' ') changed file(s), none of them reachable by next build"
fi

build "$(echo "$relevant" | wc -l | tr -d ' ') build-relevant file(s), e.g. $(echo "$relevant" | head -1)"
