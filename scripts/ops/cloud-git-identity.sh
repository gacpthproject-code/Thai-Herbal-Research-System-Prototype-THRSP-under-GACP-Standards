#!/usr/bin/env bash
# Cloud sessions commit as the operator, not as the model (operator order 2026-11-08).
# Runs only when CLAUDE_CODE_REMOTE=true; a local session keeps the machine's own git config.
# scripts/ci/check-commit-hygiene.js fails any commit after its base authored as the model,
# so if this hook stops working the gate says so.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

name="jonmaxmore"
email="jonmaxmore@gmail.com"

git config user.name "$name"
git config user.email "$email"
# Environment variables beat git config, so pin them too in case the sandbox sets its own.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export GIT_AUTHOR_NAME='$name' GIT_AUTHOR_EMAIL='$email'"
    echo "export GIT_COMMITTER_NAME='$name' GIT_COMMITTER_EMAIL='$email'"
  } >> "$CLAUDE_ENV_FILE"
fi
exit 0
