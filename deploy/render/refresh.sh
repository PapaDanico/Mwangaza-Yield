#!/usr/bin/env bash
#
# Render cron entrypoint. An ADAPTER, not a second pipeline.
#
# Everything about running the refresh — resolving node, serialising with
# flock, fast-forwarding before spending fifteen minutes, installing the Python
# dependencies, and above all treating exit 3 ("nothing arrived") as the
# ordinary outcome rather than a fault — already lives in
# scripts/refresh-cron.sh and is the same logic a laptop crontab runs. This
# script's only job is to hand that script a checkout it can push from.
#
# Four things are true on Render and not on a laptop, and each one would break
# the run silently:
#
#   1. THE IMAGE IS NOT THE CHECKOUT. Render pulls a fresh image per run, and
#      the repository baked into it is frozen at the commit that BUILT it. A
#      refresh from that tree would read weeks-old data, write it back, and
#      look entirely successful. So the repository is cloned fresh here, every
#      run, and the image contributes only its dependencies.
#   2. THERE ARE NO PUSH CREDENTIALS. The container has no SSH key and no
#      credential helper. One is configured below from GITHUB_TOKEN.
#   3. THERE IS NO GIT IDENTITY. `git commit` refuses without user.email, and
#      refresh-data.mjs commits before it pushes.
#   4. NOTHING IS PERSISTED. A cron job cannot have a disk, so there is no
#      state to carry between runs and nothing to clean up. Idempotent by
#      construction: a run either advances a dataset's asOf and pushes, or
#      discards itself.
set -uo pipefail

say() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] render-refresh: $*"; }
die() { say "FAILED: $*"; exit 1; }

: "${GITHUB_TOKEN:?set GITHUB_TOKEN in the Render dashboard (a PAT with repo scope)}"
REPO="${GITHUB_REPO:-PapaDanico/Mwangaza-Yield}"
BRANCH="${GITHUB_BRANCH:-main}"
WORK="${WORK_DIR:-/tmp/mwangaza}"

# ---------------------------------------------------------------- credentials
# The token goes in a credential helper, NOT in the remote URL. A URL carrying
# a secret is printed by `git remote -v`, echoed in git's own error messages,
# and ends up in the Render log the first time a push is rejected. The helper
# reads it from the environment and prints it to git alone.
git config --global credential.helper \
  '!f() { echo username=x-access-token; echo "password=${GITHUB_TOKEN}"; }; f'
git config --global user.name  "${GIT_AUTHOR_NAME:-Mwangaza refresh}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-refresh@mwangazayield.org}"
git config --global advice.detachedHead false

# ------------------------------------------------------------------ the clone
# Shallow, because the refresh only ever appends a commit to the tip. Deep
# enough that the rebase-on-rejection retry in refresh-data.mjs has somewhere
# to land if somebody else pushed while this run was reading PDFs.
rm -rf "$WORK"
say "cloning $REPO@$BRANCH"
git clone --branch "$BRANCH" --depth 50 \
  "https://github.com/${REPO}.git" "$WORK" >/dev/null 2>&1 \
  || die "clone failed — check GITHUB_TOKEN has repo scope and has not expired"

cd "$WORK" || die "cannot enter $WORK"

# refresh-cron.sh reads the branch with `rev-parse --abbrev-ref HEAD` and
# refresh-data.mjs runs a bare `git push`, so the checkout has to be a real
# branch with an upstream rather than a detached head.
git checkout -q "$BRANCH" 2>/dev/null || die "no branch $BRANCH in the clone"
git branch --set-upstream-to="origin/$BRANCH" "$BRANCH" >/dev/null 2>&1 || true

# --------------------------------------------------------------- dependencies
# Baked into the image at build time. Symlinked rather than reinstalled: the
# clone is fresh every run and `npm ci` here would add a minute to each one for
# a tree that cannot have changed.
ln -s /deps/node_modules "$WORK/node_modules"
say "node $(node --version), python $(python3 --version 2>&1 | cut -d' ' -f2)"

# ------------------------------------------------------------------- delegate
# From here it is the same script the laptop crontab runs, including its exit
# mapping: 3 means nothing arrived and is reported as success, so a quiet
# Thursday does not page anybody. Render marks a run failed on any non-zero
# exit, which is exactly the alarm-fatigue trap refresh-cron.sh was written to
# avoid — the mapping is what keeps Render's own failure count meaningful.
say "handing over to scripts/refresh-cron.sh"
exec ./scripts/refresh-cron.sh
