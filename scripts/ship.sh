#!/usr/bin/env bash
#
# One command from a working tree to a pushed commit.
#
#   scripts/ship.sh "commit message"
#   scripts/ship.sh "wip" --skip-e2e     # skip the browser suite when iterating
#
# THE TOKEN IS NOT IN THIS FILE, ON PURPOSE. This repository is public: a token committed
# here would be readable by everyone within seconds, and GitHub's secret scanning would
# revoke it automatically. Instead the script reads it from
#
#   ../.wealthplanner-token          (i.e. ~/Documents/Repositories/.wealthplanner-token)
#
# which sits OUTSIDE the repository, so no `git add -A` can ever pick it up. Set the
# WEALTHPLANNER_TOKEN environment variable instead if you prefer.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; OFF=$'\033[0m'
step() { printf '\n%s▸ %s%s\n' "$BOLD" "$1" "$OFF"; }
ok()   { printf '%s✓ %s%s\n' "$GREEN" "$1" "$OFF"; }
warn() { printf '%s! %s%s\n' "$YELLOW" "$1" "$OFF"; }
die()  { printf '\n%s✘ %s%s\n\n' "$RED" "$1" "$OFF" >&2; exit 1; }

MESSAGE="${1:-}"
SKIP_E2E=0
for arg in "${@:2}"; do
  [ "$arg" = "--skip-e2e" ] && SKIP_E2E=1
done

if [ -z "$MESSAGE" ]; then
  die 'Missing commit message.  Usage: scripts/ship.sh "what changed" [--skip-e2e]'
fi

# ---------------------------------------------------------------- git locks ----
# The agent's sandbox writes into this working tree over a bridge that cannot delete files,
# so git's own lock files survive its commands. Clearing them is harmless when there are none.
step 'Clearing stale git locks'
rm -f .git/HEAD.lock .git/index.lock .git/objects/maintenance.lock .git/index.lock.old.trash 2>/dev/null || true
find .git/objects -name 'tmp_obj_*' -delete 2>/dev/null || true
ok 'locks clear'

# ------------------------------------------------------------------- token ----
TOKEN="${WEALTHPLANNER_TOKEN:-}"
TOKEN_FILE="$REPO_ROOT/../.wealthplanner-token"
if [ -z "$TOKEN" ] && [ -f "$TOKEN_FILE" ]; then
  TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
fi
if [ -z "$TOKEN" ]; then
  die "No token found.
  Put a fine-grained PAT with Contents + Workflows: Read and write into
    $TOKEN_FILE
  or export WEALTHPLANNER_TOKEN before running this."
fi

# ------------------------------------------------------------------ install ----
step 'Installing dependencies'
pnpm install --silent
ok 'dependencies up to date'

# --------------------------------------------------- playwright browsers ----
E2E_SKIP_REASON=''
if [ "$SKIP_E2E" -eq 1 ]; then
  E2E_SKIP_REASON='--skip-e2e was passed'
elif [ -n "${PW_EXECUTABLE_PATH:-}" ]; then
  ok "using the Chromium at PW_EXECUTABLE_PATH"
else
  step 'Checking Playwright browsers'
  # `playwright install` is a no-op when the browser is already present, so this is cheap and
  # it means a fresh clone never fails the suite with "Executable doesn't exist".
  if pnpm --filter @wealthplanner/web exec playwright install chromium >/dev/null 2>&1; then
    ok 'chromium ready'
  else
    warn 'browser download failed — the end-to-end suite cannot run'
    SKIP_E2E=1
    E2E_SKIP_REASON='the Chromium download failed'
  fi
fi

# ------------------------------------------------------------------- checks ----
step 'Typecheck, unit tests, lint'
pnpm check
ok 'check passed'

step 'Engine version guard'
# A changed formula without a version bump is the one mistake that silently rewrites the
# meaning of every saved plan, so it blocks the push rather than warning about it.
node scripts/engine-version-guard.mjs
ok 'engine fingerprint matches its version'

step 'Production build'
pnpm build
ok 'build passed'

if [ "$SKIP_E2E" -eq 0 ]; then
  step 'End-to-end (desktop + mobile)'
  pnpm --filter @wealthplanner/web e2e
  ok 'end-to-end passed'
else
  warn "end-to-end SKIPPED — $E2E_SKIP_REASON"
fi

# ------------------------------------------------------------------- commit ----
step 'Committing'
# Self-healing hygiene: untrack anything that is already committed but which .gitignore now
# matches. Adding a pattern to .gitignore does not untrack a file, so build metadata and
# stray archives otherwise stay in the history forever.
while IFS= read -r stale; do
  [ -n "$stale" ] || continue
  git rm --cached -q --ignore-unmatch "$stale" >/dev/null 2>&1 || true
  warn "untracked $stale (matched by .gitignore)"
done < <(git ls-files -i -c --exclude-standard 2>/dev/null || true)

git add -A
if git diff --cached --quiet; then
  warn 'nothing to commit'
else
  git commit -m "$MESSAGE"
  ok 'committed'
fi

# --------------------------------------------------------------------- push ----
step 'Pushing to GitHub'
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REMOTE_PATH="$(git remote get-url origin | sed -E 's#^https://([^@]*@)?github\.com/##; s#\.git$##')"
# The token goes into the URL for this one invocation only. It is never written to
# .git/config, so it cannot leak through a shared clone.
if ! git push "https://x-access-token:${TOKEN}@github.com/${REMOTE_PATH}.git" "$BRANCH" 2>&1 | sed "s/${TOKEN}/••••••••/g"; then
  die 'Push failed. If the message mentions `workflow` scope, add Workflows: Read and write to the token.'
fi

printf '\n%s✓ shipped %s to %s%s\n' "$GREEN" "$(git rev-parse --short HEAD)" "$BRANCH" "$OFF"
if [ "$SKIP_E2E" -eq 1 ]; then
  # Repeated at the end so a skipped browser suite cannot scroll past unnoticed.
  warn "the end-to-end suite did NOT run ($E2E_SKIP_REASON)"
fi
printf '%s  https://github.com/%s/commits/%s%s\n\n' "$DIM" "$REMOTE_PATH" "$BRANCH" "$OFF"
