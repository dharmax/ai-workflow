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
    description: 'Execute arbitrary OS-level shell/bash commands (e.g. bun test, git status, ls, grep) in the project workspace',
    parameters: {
      command: { type: 'string', description: 'The exact shell command line string to execute' },
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
export async function executeShellTool(
  toolName: string,
  args: Record<string, any>,
  ctx: CommandContext
): Promise<ToolExecutionResult> {
  // 1. OS Shell Command
  if (toolName === 'exec_os_shell' || toolName === 'shell' || toolName === 'bash') {
    const cmd = args.command || args.cmd || String(args);
    if (!cmd || typeof cmd !== 'string') {
      return {
        toolName,
        success: false,
        error: 'Missing required "command" argument for exec_os_shell',
        output: 'Error: Missing command parameter.'
      };
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
