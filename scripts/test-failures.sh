#!/usr/bin/env bash
# Run Bun checks, copy only failing diagnostics, and preserve the complete logs.
# Usage: bash scripts/test-failures.sh [--typecheck] [bun-test-filters...]
set -uo pipefail

with_typecheck=false
if [[ ${1:-} == --typecheck ]]; then
  with_typecheck=true
  shift
fi

copy_diagnostics() {
  local diagnostics=$1
  local copied=false
  if command -v wl-copy >/dev/null 2>&1; then
    if wl-copy < "$diagnostics"; then
      copied=true
      # Verify the clipboard when a reader is available. No false success claim.
      if command -v wl-paste >/dev/null 2>&1 && ! cmp -s "$diagnostics" <(wl-paste --no-newline); then
        copied=false
      fi
    fi
  fi
  if [[ $copied != true ]] && command -v xclip >/dev/null 2>&1; then
    if xclip -selection clipboard -i "$diagnostics"; then
      copied=true
      if ! cmp -s "$diagnostics" <(xclip -selection clipboard -o); then
        copied=false
      fi
    fi
  fi
  if [[ $copied == true ]]; then
    printf 'Failure details copied to clipboard. Diagnostics file: %s\n' "$diagnostics" >&2
  else
    printf 'Clipboard unavailable or verification failed. Paste from: %s\n' "$diagnostics" >&2
  fi
}

# Extract failures without unrelated successful-test output. JUnit contains the
# error message and stack, but not test stdout/stderr (retained in the raw log).
extract_failures() {
  local xml=$1 log=$2 out=$3
  if command -v python3 >/dev/null 2>&1 && python3 - "$xml" "$log" "$out" <<'PY'
import sys
import xml.etree.ElementTree as ET

xml_path, log_path, output_path = sys.argv[1:]
try:
    root = ET.parse(xml_path).getroot()
    failures = []
    for case in root.iter('testcase'):
        problems = list(case.findall('failure')) + list(case.findall('error'))
        for problem in problems:
            header = ' :: '.join(filter(None, [case.get('classname'), case.get('name')])) or 'Unnamed failed test'
            detail = '\n'.join(filter(None, [problem.get('message'), problem.text]))
            if not detail.strip():
                raise ValueError('Missing failure details in JUnit report')
            failures.append(f'{header}\n{detail}'.rstrip())
    if not failures:
        raise ValueError('No failed test records in JUnit report')
    with open(output_path, 'w', encoding='utf-8') as output:
        output.write('\n\n'.join(failures) + f'\n\nFull console log: {log_path}\n')
except Exception:
    sys.exit(1)
PY
  then
    return 0
  fi
  # Runtime crash, missing JUnit, or unsupported report: never discard evidence.
  { printf 'Bun failed without usable JUnit failure records. Full console output:\n\n'; cat "$log"; } > "$out"
}

if [[ $with_typecheck == true ]]; then
  check_log=$(mktemp /tmp/aiwf-typecheck.XXXXXX) || exit 1
  printf 'Running TypeScript check (log: %s)\n' "$check_log"
  bun run typecheck 2>&1 | tee "$check_log"
  result=${PIPESTATUS[0]}
  if (( result != 0 )); then
    diagnostics=$(mktemp /tmp/aiwf-failures.XXXXXX) || exit "$result"
    { printf 'TYPECHECK FAILED (exit %d)\n\n' "$result"; cat "$check_log"; } > "$diagnostics"
    copy_diagnostics "$diagnostics"
    exit "$result"
  fi
  printf 'Typecheck passed.\n'
fi

log=$(mktemp /tmp/aiwf-test.XXXXXX) || exit 1
junit=$(mktemp /tmp/aiwf-junit.XXXXXX.xml) || exit 1
printf 'Running Bun tests (full log: %s)\n' "$log"
# JUnit is written alongside the normal console output; avoid a second test run.
env NO_COLOR=1 bun test --reporter=junit --reporter-outfile="$junit" "$@" 2>&1 | tee "$log" | awk '/^[[:space:]]*\(pass\) / {next} {print; fflush()}'
result=${PIPESTATUS[0]}
if (( result == 0 )); then
  rm -f "$junit"
  printf 'Tests passed. No clipboard change. Full log: %s\n' "$log"
  exit 0
fi

diagnostics=$(mktemp /tmp/aiwf-failures.XXXXXX) || exit "$result"
extract_failures "$junit" "$log" "$diagnostics"
copy_diagnostics "$diagnostics"
printf 'Tests failed (exit %d). Full log: %s\n' "$result" "$log" >&2
exit "$result"
