# Solutions & Knowledge Ledger

## AIWF MCP Exclusivity Protocol
- **Problem**: Defaulting to native primitive tools (`view_file`, `replace_file_content`) leads to blind chunk reading loops, quota exhaustion, and un-indexed file mutations.
- **Enforced Solution**:
  1. All edits to source and test files must use `preview_change` and `apply_change` from the `ai-workflow` MCP server.
  2. All symbol discovery, caller inspection, and code reading must use `find_symbol`, `get_symbol_source`, `get_file_outline`, or `read_workspace_file`.
  3. All ticket leases and status transitions must be executed through `claim_ticket`, `investigate_ticket`, and `resolve_ticket`.
  4. Never fall back to generic shell/native edits when AIWF tools are present.
