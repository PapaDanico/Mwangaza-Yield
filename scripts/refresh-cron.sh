#!/usr/bin/env bash
#
# The data refresh, wrapped for cron.
#
# `npm run refresh -- --push` is the whole pipeline and needs no wrapper when a
# person runs it. Under cron four things differ, and each one has ended a
# scheduled job somewhere:
#
#   1. PATH. cron gives a job /usr/bin:/bin and nothing else. Every nvm, asdf,
#      Homebrew and Volta install puts node outside that, so `npm` is not found
#      and the log reads "command not found" once a day forever. Resolved
#      explicitly below, with NODE_BIN as the override.
#   2. Exit codes. refresh-data exits 3 when nothing arrived — the ordinary
#      outcome on a day CBK published nothing, on a sleeping laptop, or behind
#      a proxy. Treating that as a failure trains the operator to ignore the
#      log, which is worse than having no log. Only a real fault exits non-zero
#      from here.
#   3. Overlap. The refresh reads PDFs and can outlive its own interval. Two
#      copies would collide: the script refuses to start on a dirty
#      public/data, so the second run dies and the first may lose its tree.
#      flock, if it exists, makes that impossible.
#   4. A stale checkout. A push from a branch behind origin is rejected, and
#      the run is then committed locally where nobody looks. Fast-forward
#      first; if that is not clean, stop before spending fifteen minutes.
#
# Install (one line, and it is the whole replacement for the refresh-data job):
#
#   20 6,18 * * 1-6  /home/you/Mwangaza-Yield/scripts/refresh-cron.sh >> /home/you/mwangaza-refresh.log 2>&1
#
# It needs git able to push without a prompt — an SSH key or a credential
# helper — and nothing else. Everything below is either resolved or reported.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

say() { echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] $*"; }
die() { say "FAILED: $*"; exit 1; }

# ---------------------------------------------------------------- node on PATH
# NODE_BIN wins if set — a machine with several node versions should choose.
if [ -n "${NODE_BIN:-}" ]; then
  PATH="$NODE_BIN:$PATH"
elif ! command -v npm >/dev/null 2>&1; then
  # The usual homes, newest nvm version last so it wins.
  for d in /usr/local/bin /opt/homebrew/bin "$HOME/.volta/bin" "$HOME/.asdf/shims" \
           "$HOME"/.nvm/versions/node/*/bin; do
    [ -x "$d/npm" ] && PATH="$d:$PATH"
  done
fi
export PATH
command -v npm >/dev/null 2>&1 || die "npm not on PATH. Set NODE_BIN=/path/to/node/bin in the crontab."

# --------------------------------------------------------------- serialise it
# flock is Linux-standard and absent on macOS. Re-exec under it when present;
# when not, carry on — the dirty-tree refusal in refresh-data.mjs is still a
# backstop, it is just a louder one.
if [ -z "${REFRESH_LOCKED:-}" ] && command -v flock >/dev/null 2>&1; then
  export REFRESH_LOCKED=1
  exec flock -n "$ROOT/.refresh.lock" "$0" "$@" || {
    say "another refresh is running — skipping this slot"
    exit 0
  }
fi

# ------------------------------------------------------------------- the tree
git -C "$ROOT" diff --quiet -- public/data \
  || die "public/data has uncommitted changes. The refresh cannot tell your edits from its own."

BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
say "refreshing on $BRANCH"

git -C "$ROOT" fetch --quiet origin "$BRANCH" 2>/dev/null \
  && git -C "$ROOT" merge --ff-only "origin/$BRANCH" --quiet 2>/dev/null \
  || say "note: could not fast-forward $BRANCH — continuing; the push retries with a rebase"

# ------------------------------------------------------------ python, once
# The scrapers need bs4, lxml and pandas. A fresh machine has none of them, and
# the failure (ModuleNotFoundError) reads like a code defect. Install only when
# an import actually fails, so the ordinary run costs nothing.
if ! python3 -c 'import bs4, lxml' >/dev/null 2>&1; then
  say "installing python dependencies (first run on this machine)"
  python3 -m pip install --quiet -r backend/requirements.txt \
    || die "pip install -r backend/requirements.txt"
fi

# ------------------------------------------------------------------ the run
npm run refresh -- --push
status=$?

case $status in
  0) say "refresh pushed" ;;
  3) say "nothing arrived — run discarded, tree restored (this is the guard working, not a fault)" ; status=0 ;;
  *) say "refresh exited $status — read the output above" ;;
esac

exit $status
