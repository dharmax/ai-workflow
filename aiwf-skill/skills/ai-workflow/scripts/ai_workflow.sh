#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TOOLKIT_ROOT_FILE="$SKILL_DIR/toolkit-root.txt"

if command -v ai-workflow >/dev/null 2>&1; then
  exec ai-workflow "$@"
fi

find_node() {
  local candidate
  for candidate in "${AI_WORKFLOW_NODE:-}" "$(command -v node 2>/dev/null || true)" /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
    if [[ -n "$candidate" && -x "$candidate" ]] && "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

run_from_root() {
  local root="$1"
  shift
  local tsx_cli=""
  local node_bin
  node_bin="$(find_node)" || {
    echo "ai-workflow requires Node.js >=22. Set AI_WORKFLOW_NODE to a compatible node binary." >&2
    exit 1
  }
  if [[ -f "${root}/node_modules/tsx/dist/cli.mjs" ]]; then
    tsx_cli="${root}/node_modules/tsx/dist/cli.mjs"
  elif [[ -f "${root}/../node_modules/tsx/dist/cli.mjs" ]]; then
    tsx_cli="${root}/../node_modules/tsx/dist/cli.mjs"
  fi
  if [[ -f "${root}/dist/ai-workflow.mjs" ]]; then
    exec "$node_bin" "${root}/dist/ai-workflow.mjs" "$@"
  fi
  if [[ -f "${root}/cli/ai-workflow.mjs" ]]; then
    exec "$node_bin" "${root}/cli/ai-workflow.mjs" "$@"
  fi
  if [[ -n "$tsx_cli" && -f "${root}/cli/ai-workflow.ts" ]]; then
    exec "$node_bin" "$tsx_cli" "${root}/cli/ai-workflow.ts" "$@"
  fi
  if [[ -f "${root}/aiwf-shell/dist/ai-workflow.mjs" ]]; then
    exec "$node_bin" "${root}/aiwf-shell/dist/ai-workflow.mjs" "$@"
  fi
  if [[ -f "${root}/aiwf-shell/cli/ai-workflow.mjs" ]]; then
    exec "$node_bin" "${root}/aiwf-shell/cli/ai-workflow.mjs" "$@"
  fi
  if [[ -n "$tsx_cli" && -f "${root}/aiwf-shell/cli/ai-workflow.ts" ]]; then
    exec "$node_bin" "$tsx_cli" "${root}/aiwf-shell/cli/ai-workflow.ts" "$@"
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
