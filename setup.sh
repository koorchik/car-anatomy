#!/usr/bin/env bash
# Prepares a machine to continue the 2026-11-13 build from this checkpoint:
#   - local branches next and lane/* from origin (local ones that are ahead are left alone),
#   - the worktree of next in <worktrees>/next with node_modules,
#   - prints the args for workflow.js with the list of stages already merged into next.
# Usage: bash setup.sh <repo> <worktrees-dir>
# The worktrees dir must be outside the repo (vitest would pick up tests from it), e.g. <repo>-wt.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: bash setup.sh <repo> <worktrees-dir>" >&2
  exit 2
fi
REPO=$(cd "$1" && pwd)
mkdir -p "$2"
WT=$(cd "$2" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)

git -C "$REPO" fetch --quiet origin

for remote in $(git -C "$REPO" for-each-ref --format='%(refname:short)' refs/remotes/origin/next 'refs/remotes/origin/lane/'); do
  branch=${remote#origin/}
  if ! git -C "$REPO" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$REPO" branch --quiet --track "$branch" "$remote"
    echo "created $branch from $remote"
  elif git -C "$REPO" merge-base --is-ancestor "$branch" "$remote" && [ "$(git -C "$REPO" rev-parse "$branch")" != "$(git -C "$REPO" rev-parse "$remote")" ]; then
    # Behind the remote: fast-forward, unless a worktree has it checked out (then merge there by hand).
    if git -C "$REPO" branch --quiet -f "$branch" "$remote" 2>/dev/null; then
      echo "fast-forwarded $branch"
    else
      echo "NOTE: $branch is behind $remote but checked out in a worktree; run git merge $remote there" >&2
    fi
  fi
done

if [ ! -d "$WT/next" ]; then
  git -C "$REPO" worktree add --quiet "$WT/next" next
  echo "worktree $WT/next created"
fi
if [ ! -d "$WT/next/node_modules" ]; then
  (cd "$WT/next" && npm ci --prefer-offline --silent)
fi

merged=$(git -C "$REPO" log next --merges --format=%s | sed -n 's/^Merge \([A-Za-z0-9-]*\):.*/\1/p' | sort -u | tr '\n' ' ')
node -e '
const lanes = require(process.argv[1]);
const ids = lanes.flatMap((l) => l.stages.map((s) => s.id));
const merged = new Set(process.argv[2].split(/\s+/).filter(Boolean));
const done = ids.filter((id) => merged.has(id));
console.error(done.length + " of " + ids.length + " stages already merged into next");
console.log(JSON.stringify({ repo: process.argv[3], wt: process.argv[4], date: "2026-11-13", trailer: "<the attribution lines this session gives for commits>", maxLive: 16, done }, null, 1));
' "$HERE/dag.json" "$merged" "$REPO" "$WT"
