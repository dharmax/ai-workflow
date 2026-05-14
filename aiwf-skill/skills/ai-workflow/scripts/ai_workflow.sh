#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TOOLKIT_ROOT_FILE="$SKILL_DIR/toolkit-root.txt"

if command -v ai-workflow >/dev/null 2>&1; then
  exec ai-workflow "$@"
fi

run_from_root() {
  local root="$1"
  if [[ -f "${root}/dist/ai-workflow.mjs" ]]; then
    exec "${root}/dist/ai-workflow.mjs" "$@"
  fi
  if [[ -f "${root}/cli/ai-workflow.mjs" ]]; then
    exec node "${root}/cli/ai-workflow.mjs" "$@"
  fi
  if [[ -f "${root}/cli/ai-workflow.ts" ]]; then
    exec node "${root}/cli/ai-workflow.ts" "$@"
  fi
  if [[ -f "${root}/aiwf-shell/dist/ai-workflow.mjs" ]]; then
    exec "${root}/aiwf-shell/dist/ai-workflow.mjs" "$@"
  fi
  if [[ -f "${root}/aiwf-shell/cli/ai-workflow.mjs" ]]; then
    exec node "${root}/aiwf-shell/cli/ai-workflow.mjs" "$@"
  fi
  if [[ -f "${root}/aiwf-shell/cli/ai-workflow.ts" ]]; then
    exec node "${root}/aiwf-shell/cli/ai-workflow.ts" "$@"
  fi
}

if [[ -n "${AI_WORKFLOW_TOOLKIT_ROOT:-}" ]]; then
  run_from_root "${AI_WORKFLOW_TOOLKIT_ROOT}" "$@"
fi

if [[ -f "$TOOLKIT_ROOT_FILE" ]]; then
  TOOLKIT_ROOT="$(cat "$TOOLKIT_ROOT_FILE")"
  run_from_root "${TOOLKIT_ROOT}" "$@"
fi

echo "ai-workflow wrapper could not find the toolkit CLI." >&2
echo "Install ai-workflow on PATH, or set AI_WORKFLOW_TOOLKIT_ROOT to the toolkit repo root." >&2
exit 1
