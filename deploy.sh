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
set -euo pipefail

REPO_NAME="${1:-taskmarket-live}"
OWNER="$(gh api user --jq .login)"

if git remote get-url origin >/dev/null 2>&1; then
  echo "Pushing to existing origin..."
  git push origin main
else
  echo "Creating public repo $OWNER/$REPO_NAME..."
  gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
fi

echo "Enabling GitHub Pages (main branch, root)..."
gh api -X POST "repos/$OWNER/$REPO_NAME/pages" \
  -f 'source[branch]=main' -f 'source[path]=/' >/dev/null 2>&1 \
  || echo "(Pages may already be enabled.)"

echo "Triggering the first data refresh..."
gh workflow run refresh.yml --repo "$OWNER/$REPO_NAME" 2>/dev/null \
  || echo "(Workflow dispatch skipped — run it from the Actions tab.)"

echo
echo "Live at: https://$OWNER.github.io/$REPO_NAME/"
echo "Repo:    https://github.com/$OWNER/$REPO_NAME"
