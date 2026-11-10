#!/usr/bin/env bash
# Run the Bun suite, retain the complete log, and copy failure details (without pass listings).
# Invoke from fish or bash: bash scripts/test-failures.sh [bun-test-filters...]
set -u

log=$(mktemp /tmp/aiwf-test.XXXXXX) || exit 1
env NO_COLOR=1 bun test --dots "$@" 2>&1 | tee "$log"
result=${PIPESTATUS[0]}

# The Bun dots reporter prints full failures and a summary, not per-test pass lines.
# Filter only progress-only dot lines; never truncate assertion diffs or stack traces.
if command -v wl-copy >/dev/null 2>&1; then
  if sed -E '/^[[:space:]]*[.]{5,}[[:space:]]*$/d' "$log" | wl-copy; then
    printf '\nFailure diagnostics copied to clipboard (full log: %s).\n' "$log" >&2
  else
    printf '\nClipboard operation failed; full log: %s\n' "$log" >&2
  fi
elif command -v xclip >/dev/null 2>&1; then
  if sed -E '/^[[:space:]]*[.]{5,}[[:space:]]*$/d' "$log" | xclip -selection clipboard; then
    printf '\nFailure diagnostics copied to clipboard (full log: %s).\n' "$log" >&2
  else
    printf '\nClipboard operation failed; full log: %s\n' "$log" >&2
  fi
else
  printf '\nNo wl-copy/xclip available. Full log retained: %s\n' "$log" >&2
fi
exit "$result"
