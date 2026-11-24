#!/usr/bin/env bash
# One-command deploy for Taskmarket Live.
#
# Usage:
#   ./deploy.sh [repo-name]        # default repo name: taskmarket-live
#
# What it does:
#   1. Creates the public GitHub repo (or pushes to the existing origin).
#   2. Enables GitHub Pages from the main branch (root).
#   3. Triggers the first hourly data refresh workflow.
#   4. Prints the live URL.
#
# Requirements: gh CLI logged in (gh auth login), git.
#
# NOTE on the `workflow` scope: pushing .github/workflows/* needs the
# `workflow` OAuth scope, which a default `gh` login does not have. This
# script detects that and pushes everything else, then tells you how to
# finish (one browser step: gh auth refresh -h github.com -s workflow).
set -euo pipefail

REPO_NAME="${1:-taskmarket-live}"
OWNER="$(gh api user --jq .login)"

SCOPES="$(gh api -i /user 2>/dev/null | grep -i '^x-oauth-scopes:' | cut -d: -f2- || true)"
if echo "$SCOPES" | grep -qw workflow; then
  HAS_WORKFLOW=1
else
  HAS_WORKFLOW=0
  echo "NOTE: gh token lacks the 'workflow' scope — the Actions workflow file"
  echo "will be held back from this push (everything else deploys fine)."
fi

HOLD_DIR="$(mktemp -d)"
cleanup() { rm -rf "$HOLD_DIR"; }
trap cleanup EXIT

if [ "$HAS_WORKFLOW" -eq 0 ] && [ -d .github/workflows ]; then
  mv .github/workflows "$HOLD_DIR/workflows"
  rmdir .github 2>/dev/null || true
  echo "Held back .github/workflows/ for this push."
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "Pushing to existing origin..."
  git push origin main
else
  echo "Creating public repo $OWNER/$REPO_NAME..."
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
fi

# Restore the held-back workflow file into the working tree.
if [ -d "$HOLD_DIR/workflows" ]; then
  mkdir -p .github
  mv "$HOLD_DIR/workflows" .github/workflows
  echo "Restored .github/workflows/refresh.yml in the working tree (uncommitted)."
fi

echo "Enabling GitHub Pages (main branch, root)..."
gh api -X POST "repos/$OWNER/$REPO_NAME/pages" \
  -f 'source[branch]=main' -f 'source[path]=/' >/dev/null 2>&1 \
  || echo "(Pages may already be enabled.)"

if [ "$HAS_WORKFLOW" -eq 1 ]; then
  echo "Triggering the first data refresh..."
  gh workflow run refresh.yml --repo "$OWNER/$REPO_NAME" 2>/dev/null \
    || echo "(Workflow dispatch skipped — run it from the Actions tab.)"
else
  echo
  echo "TO FINISH (one browser step):"
  echo "  gh auth refresh -h github.com -s workflow"
  echo "  # enter the one-time code at https://github.com/login/device"
  echo "  git add .github/workflows/refresh.yml"
  echo "  git commit -m 'Add hourly refresh workflow'"
  echo "  git push"
  echo "Until then, refresh data manually with:"
  echo "  node scripts/fetch-data.mjs && git commit -am 'data: refresh' && git push"
fi

echo
echo "Live at: https://$OWNER.github.io/$REPO_NAME/"
echo "Repo:    https://github.com/$OWNER/$REPO_NAME"
