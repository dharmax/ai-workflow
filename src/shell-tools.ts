/**
 * Responsibility: Bridge CapabilityRegistry and OS-level operations into unified LLM tool definitions and execution dispatcher.
 * Scope: Interactive shell agent, ReAct loops, and dynamic workflow synthesis.
 */

import { registry, type Capability, type CommandContext } from './registry.ts';
import { executeOsCommand, type OsCommandResult } from './os-shell.ts';

export interface ShellToolDefinition {
  name: string;
  category: string;
  description: string;
  parameters: Record<string, any>;
  example?: string;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  data?: any;
  error?: string;
  output: string;
}

/**
 * Returns all LLM tool definitions, including all aiwf capabilities and OS shell execution.
 */
export function getAvailableShellTools(): ShellToolDefinition[] {
  const tools: ShellToolDefinition[] = [];

  // 1. OS Shell Execution Tool
  tools.push({
    name: 'exec_os_shell',
    category: 'system',
    description: 'Execute read-only and verification shell commands (e.g. bun test, git status, git diff, ls, grep) in the project workspace. Destructive and repository-mutating commands (git commit, git push, git branch -m, rm -rf) are blocked by the safety gate.',
    parameters: {
      command: { type: 'string', description: 'The verification or read-only shell command to execute (e.g. bun test, git status, git diff)' },
      timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds (defaults to 30000)' }
    },
    example: '{"command": "bun test"}'
  });

  // 2. All Registered aiwf Capabilities
  for (const cap of registry.getAll()) {
    tools.push({
      name: cap.name,
      category: cap.category,
      description: cap.description,
      parameters: extractParametersFromSchema(cap.schema),
      example: cap.cliCommand
    });
  }

  return tools;
}

/**
 * Executes any tool by name with arguments.
 */
export const MUTATING_TOOL_DIRECTIVES: Record<string, RegExp> = {
  start_ticket: /\b(start|begin|commence|work on)\b/i,
  done_ticket: /\b(done|finish|complete|close|resolve)\b/i,
  claim_ticket: /\b(claim|lease)\b/i,
  release_ticket: /\b(release|unclaim)\b/i,
  propose_decision: /\b(propose|draft|new decision|create decision|(?:create|propose|new|draft)\s+(?:an?\s+)?adr)\b/i,
  accept_decision: /\b(accept|approve)\b/i,
  revert_decision: /\b(revert|reject|cancel decision)\b/i,
  create_ticket: /\b(create|add|new|file)\s+(?:.*?\s+)?(?:ticket|issue|task)s?\b/i,
  update_ticket_state: /\b(move|update|transition)\b/i,
  promote_stub: /\b(promote|implement)\b/i
};

export async function executeShellTool(
  toolName: string,
  args: Record<string, any>,
  ctx: CommandContext,
  options?: { allowMutation?: boolean; userIntent?: string }
): Promise<ToolExecutionResult> {
  // 1. OS Shell Command
  if (toolName === 'exec_os_shell' || toolName === 'shell' || toolName === 'bash') {
    const cmd = (args.command || args.cmd || String(args)).trim();
    if (!cmd || typeof cmd !== 'string') {
      return {
        toolName,
        success: false,
        error: 'Missing required "command" argument for exec_os_shell',
        output: 'Error: Missing command parameter.'
      };
    }

    // Safety Gate: Block mutating or destructive git/system commands during agent reasoning
    const blockedPatterns = [
      /\bgit\s+(push|commit|branch\s+-m|checkout\s+-b|reset|rebase|merge|clean|tag)\b/i,
      /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--recursive)\b/i,
      /\b(dd|mkfs|shutdown|reboot)\b/i
    ];
    for (const pattern of blockedPatterns) {
      if (pattern.test(cmd)) {
        return {
          toolName,
          success: false,
          error: `Safety Gate: Mutating operation "${cmd}" is blocked. Conversational reasoning is restricted to verification, testing, and read-only diagnostics (e.g. bun test, git status, git diff, ls, grep). Mutating operations must be performed directly by the operator.`,
          output: `[BLOCKED BY SAFETY GATE]: "${cmd}" was blocked. Autonomous git push, git commit, branch renaming, or destructive file commands are forbidden during reasoning.`
        };
      }
    }

    const res: OsCommandResult = await executeOsCommand(cmd, {
      cwd: ctx.projectRoot,
      timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : 30000
    });

    const output = res.output || (res.success ? '(Command completed with no output)' : `(Exited with code ${res.exitCode})`);
    return {
      toolName,
      success: res.success,
      data: res,
      output
    };
  }

  // 2. Capability Registry Lookup
  const cap = registry.get(toolName);
  if (!cap) {
    return {
      toolName,
      success: false,
      error: `Unknown tool "${toolName}". Use "help" to see available tools.`,
      output: `Error: Tool "${toolName}" not found.`
    };
  }

  // 3. Mutation Gating Check for Workflow Tools (when invoked from conversational user intent)
  if (options && options.userIntent !== undefined && MUTATING_TOOL_DIRECTIVES[toolName]) {
    const isAllowed = options.allowMutation || MUTATING_TOOL_DIRECTIVES[toolName].test(options.userIntent);
    if (!isAllowed) {
      return {
        toolName,
        success: false,
        error: `Mutation Gated: Tool "${toolName}" modifies canonical workflow state. The operator asked an inquiry or recommendation request ("${options.userIntent}").`,
        output: `[MUTATION GATED]: Tool "${toolName}" modifies repository or workflow state. The operator asked an inquiry. Do NOT auto-execute mutations on inquiries; instead, report your findings and recommend this action so the operator can explicitly authorize it.`
      };
    }
  }

  try {
    const validatedArgs = cap.schema.parse(args || {});
    const result = await cap.handler(ctx, validatedArgs);

    let output = '';
    if (typeof result === 'string') {
      output = result;
    } else if (cap.renderTui) {
      output = cap.renderTui(result);
    } else {
      output = JSON.stringify(result, null, 2);
    }

    return {
      toolName,
      success: true,
      data: result,
      output
    };
  } catch (err: any) {
    return {
      toolName,
      success: false,
      error: err?.message || String(err),
      output: `Error executing ${toolName}: ${err?.message || String(err)}`
    };
  }
}

/**
 * Builds a compact, high-density tool catalog string for LLM system prompts.
 */
export function buildToolCatalogPrompt(tools: ShellToolDefinition[]): string {
  let prompt = `### AVAILABLE AIWF & SYSTEM TOOLS:\n`;
  prompt += `You can invoke any of the following tools to inspect, query, mutate, or verify the project:\n\n`;

  const categorized: Record<string, ShellToolDefinition[]> = {};
  for (const t of tools) {
    if (!categorized[t.category]) categorized[t.category] = [];
    categorized[t.category].push(t);
  }

  for (const [cat, catTools] of Object.entries(categorized)) {
    prompt += `**Category [${cat.toUpperCase()}]:**\n`;
    for (const t of catTools) {
      const params = Object.entries(t.parameters)
        .map(([k, v]) => `${k}${v.required ? '' : '?'}: ${v.type}`)
        .join(', ');
      prompt += `- \`${t.name}(${params})\`: ${t.description}\n`;
    }
    prompt += `\n`;
  }

  prompt += `### TOOL CALL FORMAT:\n`;
  prompt += `To invoke a tool, write an action block formatted exactly as:\n`;
  prompt += `\`\`\`tool_call\n{\n  "tool": "<tool_name>",\n  "args": { "<param>": "<value>" }\n}\n\`\`\`\n`;
  prompt += `You may perform multiple reasoning steps and tool calls before outputting your final response.\n`;

  return prompt;
}

/**
 * Parses zod schema into human-readable parameter descriptions.
 */
function extractParametersFromSchema(schema: any): Record<string, { type: string; required: boolean; description?: string }> {
  const result: Record<string, { type: string; required: boolean; description?: string }> = {};
  if (!schema || !schema._def) return result;

  const shape = schema.shape || schema._def.shape?.();
  if (!shape) return result;

  for (const [key, value] of Object.entries(shape)) {
    const val: any = value;
    const typeName = val._def?.typeName || 'unknown';
    const isOptional = typeName === 'ZodOptional' || typeName === 'ZodDefault';
    let baseType = isOptional ? (val._def.innerType?._def?.typeName || 'any') : typeName;
    baseType = baseType.replace(/^Zod/, '').toLowerCase();

    result[key] = {
      type: baseType,
      required: !isOptional,
      description: val.description || undefined
    };
  }

  return result;
}
