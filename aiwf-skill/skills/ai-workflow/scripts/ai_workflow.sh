#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TOOLKIT_ROOT_FILE="$SKILL_DIR/toolkit-root.txt"

find_bun() {
  local candidate
  for candidate in "${AI_WORKFLOW_BUN:-}" "$(command -v bun 2>/dev/null || true)" /usr/local/bin/bun /opt/homebrew/bin/bun /usr/bin/bun; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

run_from_root() {
  local root="$1"
  shift
  local bun_bin
  bun_bin="$(find_bun)" || {
    echo "ai-workflow requires Bun >=1.3.14. Set AI_WORKFLOW_BUN to a compatible bun binary." >&2
    exit 1
  }
  if [[ -f "${root}/cli/ai-workflow.mjs" ]]; then
    exec "$bun_bin" "${root}/cli/ai-workflow.mjs" "$@"
  fi
  if [[ -f "${root}/cli/ai-workflow.ts" ]]; then
    exec "$bun_bin" "${root}/cli/ai-workflow.ts" "$@"
  fi
  if [[ -f "${root}/aiwf-shell/cli/ai-workflow.mjs" ]]; then
    exec "$bun_bin" "${root}/aiwf-shell/cli/ai-workflow.mjs" "$@"
  fi
  if [[ -f "${root}/aiwf-shell/cli/ai-workflow.ts" ]]; then
    exec "$bun_bin" "${root}/aiwf-shell/cli/ai-workflow.ts" "$@"
  fi
}

if [[ -n "${AI_WORKFLOW_TOOLKIT_ROOT:-}" ]]; then
  run_from_root "${AI_WORKFLOW_TOOLKIT_ROOT}" "$@"
fi

if [[ -f "$TOOLKIT_ROOT_FILE" ]]; then
  TOOLKIT_ROOT="$(cat "$TOOLKIT_ROOT_FILE")"
  run_from_root "${TOOLKIT_ROOT}" "$@"
fi

if command -v ai-workflow >/dev/null 2>&1; then
  exec ai-workflow "$@"
fi

echo "ai-workflow wrapper could not find the toolkit CLI." >&2
echo "Install ai-workflow on PATH, or set AI_WORKFLOW_TOOLKIT_ROOT to the toolkit repo root." >&2
exit 1
