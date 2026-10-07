import type {ToolDefinition, ToolRegistry} from './registry.ts'

/**
 * Stable public MCP surface. Internal primitives remain available to AIWF itself
 * and to semantic Actor discovery without being advertised to every host.
 */
export const PUBLIC_MCP_TOOL_NAMES = new Set([
  'resolve_ticket',
  'prepare_ticket',
  'investigate_ticket',
  'create_ticket',
  'claim_ticket',
  'release_ticket',
  'list_tickets',
  'recommend_next_task',
  'update_ticket_state',

  'process_epic',
  'process_feature',
  'process_story',
  'get_epic',
  'list_epics',
  'get_feature',
  'list_features',
  'get_user_story',
  'list_user_stories',
  'get_product_coverage',
  'get_product_impact',

  'get_aspect',
  'list_aspects',
  'get_applicable_aspects',
  'assess_aspects',

  'get_completeness_target',
  'set_completeness_target',

  'find_symbol',
  'search_graph',
  'get_symbol_source',
  'get_file_outline',
  'get_exact_callers',
  'get_exact_references',
  'analyze_blast_radius',

  'preview_change',
  'apply_change',
  'read_workspace_file',
  'apply_block_patch',

  'resolve_test_target',
  'triage_test_failures',

  'get_git_status',
  'get_git_diff',

  'search_knowledgebase',
  'get_knowledge_item',
])

export function getPublicMcpTools(registry: ToolRegistry): ToolDefinition[] {
  return registry.getAll().filter(tool => PUBLIC_MCP_TOOL_NAMES.has(tool.name))
}
