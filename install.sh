#!/usr/bin/env bash
set -euo pipefail

# AI-Workflow Self-Contained Installer
# Installs dist/aiwf into ~/.local/bin/aiwf and registers MCP hosts

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_BIN="${SCRIPT_DIR}/dist/aiwf"

if [ ! -f "${SOURCE_BIN}" ]; then
  echo "Error: Binary not found at ${SOURCE_BIN}." >&2
  echo "Please run 'bun run pack' first to generate dist/aiwf." >&2
  exit 1
fi

DEST_DIR="${HOME}/.local/bin"
DEST_BIN="${DEST_DIR}/aiwf"

mkdir -p "${DEST_DIR}"
rm -f "${DEST_BIN}"
cp -f "${SOURCE_BIN}" "${DEST_BIN}"
chmod +x "${DEST_BIN}"

echo "✅ Installed self-contained binary to ${DEST_BIN}"

# Configure MCP hosts and skills using the installed binary
"${DEST_BIN}" setup --mcp

echo ""
echo "✨ AI-Workflow successfully installed and configured across all AI tools!"
echo "Make sure ${DEST_DIR} is in your PATH."
