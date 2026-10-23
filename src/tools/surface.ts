import type {ToolDefinition, ToolRegistry} from './registry.ts'

/**
 * Stable public MCP surface. Internal primitives remain available to AIWF itself
 * and to semantic Actor discovery without being advertised to every host.
 */
export const PUBLIC_MCP_TOOL_NAMES = new Set([
  'artifact', 'link', 'verify',
  'get_product', 'get_module', 'get_decision', 'list_decisions',
  'list_rules', 'get_rule', 'export_rules', 'preview_rule_change', 'apply_rule_change', 'resolve_rule_reference',
  'resolve_ticket',
  'prepare_ticket',
  'investigate_ticket',
  'create_ticket', 'get_ticket', 'update_ticket',
  'record_ticket_event', 'get_ticket_history', 'condense_ticket_history', 'migrate_ticket_history',
  'create_bug', 'get_bug', 'list_bugs', 'update_bug', 'triage_bug', 'bug_action',
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
  'get_user_story', 'get_goal', 'list_goals', 'get_concept', 'list_concepts', 'get_flow', 'list_flows',
  'get_story_test_status', 'prepare_story_test', 'apply_story_test', 'run_story_test',
  'prepare_test_binding', 'apply_test_binding',
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

  'resolve_test_target',
  'triage_test_failures',

  'get_git_status',
  'get_git_diff',

  'search_knowledgebase',
  'get_knowledge_item',
])

/** Opt-in advertisement only; legacy calls retain their existing authority and schemas. */
const COMPACT_REPLACED_READS=new Set([
  'get_product','get_module','get_decision','list_decisions','get_epic','list_epics','get_feature','list_features',
  'get_user_story','list_user_stories','get_goal','list_goals','get_concept','list_concepts','get_flow','list_flows',
  'get_aspect','list_aspects','get_ticket','list_tickets','get_bug','list_bugs','get_story_test_status','run_story_test'
]);
export function getPublicMcpTools(registry: ToolRegistry, compact=false): ToolDefinition[] {
  return registry.getAll().filter(tool => PUBLIC_MCP_TOOL_NAMES.has(tool.name)&&(!compact||!COMPACT_REPLACED_READS.has(tool.name)))
}
