/**
 * Responsibility: Autonomous multi-turn conversational agent with ReAct tool execution loop for Interactive Shell.
 * Scope: Multi-turn design discussions, autonomous planning, OS shell execution, and live code synthesis.
 */

import path from 'node:path';
import { Asker, LLMSession, type SessionMessage } from '@dharmax/llm-utils';
import type { CommandContext } from './registry.ts';
import {
  getAvailableShellTools,
  executeShellTool,
  buildToolCatalogPrompt,
  type ShellToolDefinition,
  type ToolExecutionResult
} from './shell-tools.ts';

export type ShellAgentMode = 'design' | 'product' | 'dev' | 'triage';

export interface AgentStepTrace {
  step: number;
  thought?: string;
  toolCall?: { tool: string; args: Record<string, any> };
  toolResult?: ToolExecutionResult;
}

export interface AgentTurnResult {
  output: string;
  steps: AgentStepTrace[];
  mode: ShellAgentMode;
}

const REGEX_TOOL_CALL_BLOCK = /```(?:tool_call|json)\s*(\{[\s\S]*?\})\s*```/i;
const REGEX_TOOL_CALL_TAG = /<tool_call(?:\s+name=["']([^"']+)["'])?>([\s\S]*?)<\/tool_call>/i;

export class ShellAgent {
  private session: LLMSession;
  private tools: ShellToolDefinition[];
  private toolCatalogPrompt: string;

  constructor(
    public ctx: CommandContext,
    public asker: Asker,
    public mode: ShellAgentMode = 'design'
  ) {
    this.session = new LLMSession(this.asker, {
      maxHistory: 20
    });
    this.tools = getAvailableShellTools();
    this.toolCatalogPrompt = buildToolCatalogPrompt(this.tools);
  }

  /**
   * Switches the agent's active reasoning role.
   */
  setMode(mode: ShellAgentMode) {
    this.mode = mode;
  }

  /**
   * Clears the current conversation history.
   */
  clear() {
    this.session.clear();
  }

  /**
   * Returns current conversation history.
   */
  getHistory(): SessionMessage[] {
    return this.session.getHistory();
  }

  /**
   * Executes a multi-turn conversational turn with autonomous ReAct tool calling.
   */
  async turn(
    userMessage: string,
    mode: ShellAgentMode = this.mode,
    options: { maxSteps?: number; onStep?: (trace: AgentStepTrace) => void } = {}
  ): Promise<AgentTurnResult> {
    this.mode = mode;
    const maxSteps = options.maxSteps ?? 6;
    const steps: AgentStepTrace[] = [];

    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.BUN_TEST);
    const turnTimeout = isTest ? 400 : 8000;

    const systemPrompt = this.buildSystemPrompt(mode);
    let currentInput = userMessage;

    for (let stepIndex = 1; stepIndex <= maxSteps; stepIndex++) {
      const stepTrace: AgentStepTrace = { step: stepIndex };

      let modelResponseText = '';
      try {
        const res = await this.session.ask(currentInput, {
          system: systemPrompt,
          task: 'reasoning',
          timeoutMs: turnTimeout
        });

        if (res.ok && res.text) {
          modelResponseText = res.text.trim();
        } else if (res.failure) {
          modelResponseText = `I encountered an issue communicating with the model (${res.failure.message}).`;
          steps.push(stepTrace);
          break;
        } else {
          modelResponseText = 'No response generated.';
          steps.push(stepTrace);
          break;
        }
      } catch (err: any) {
        modelResponseText = `Error during reasoning: ${err?.message || String(err)}`;
        steps.push(stepTrace);
        break;
      }

      // Check for tool call in response
      const toolCall = this.parseToolCall(modelResponseText);
      if (!toolCall) {
        // Final text response reached
        stepTrace.thought = modelResponseText;
        steps.push(stepTrace);
        return {
          output: modelResponseText,
          steps,
          mode
        };
      }

      // Record tool call
      stepTrace.toolCall = toolCall;

      // Execute tool call against project context
      const toolResult = await executeShellTool(toolCall.tool, toolCall.args, this.ctx);
      stepTrace.toolResult = toolResult;
      steps.push(stepTrace);

      if (options.onStep) {
        options.onStep(stepTrace);
      }

      // Format observation back to model
      const observation = `[OBSERVATION for ${toolCall.tool}]:\n${toolResult.output}\n\nContinue your reasoning, call another tool if needed, or provide your final synthesized answer.`;
      currentInput = observation;
    }

    // If max steps reached, ask for final summary
    const summaryRes = await this.session.ask(
      'Please summarize your final findings and provide a direct, actionable answer for the user based on the tool results gathered so far.',
      {
        system: systemPrompt,
        task: 'reasoning',
        timeoutMs: 6000
      }
    );

    const finalOutput = summaryRes.ok && summaryRes.text ? summaryRes.text.trim() : 'Task completed.';
    return {
      output: finalOutput,
      steps,
      mode
    };
  }

  /**
   * Parses tool call from model output (supports json fences and xml tags).
   */
  private parseToolCall(text: string): { tool: string; args: Record<string, any> } | null {
    // 1. Try ```tool_call or ```json fence
    const fenceMatch = text.match(REGEX_TOOL_CALL_BLOCK);
    if (fenceMatch && fenceMatch[1]) {
      try {
        const parsed = JSON.parse(fenceMatch[1]);
        if (parsed.tool && typeof parsed.tool === 'string') {
          return {
            tool: parsed.tool,
            args: parsed.args || parsed.parameters || {}
          };
        }
      } catch {
        // Fallback to tag parsing
      }
    }

    // 2. Try <tool_call name="...">...</tool_call>
    const tagMatch = text.match(REGEX_TOOL_CALL_TAG);
    if (tagMatch) {
      const toolName = tagMatch[1];
      const body = tagMatch[2]?.trim() || '{}';
      try {
        const args = body ? JSON.parse(body) : {};
        if (toolName) {
          return { tool: toolName, args };
        }
        if (args.tool) {
          return { tool: args.tool, args: args.args || {} };
        }
      } catch {
        // Ignore
      }
    }

    return null;
  }

  /**
   * Generates persona-specific system prompt grounded in live repository state.
   */
  private buildSystemPrompt(mode: ShellAgentMode): string {
    const health = this.ctx.store.getProjectHealth();
    const activeClaims = this.ctx.store.getActiveClaims();
    const decisions = this.ctx.store.listEntities({ type: 'decision' });
    const repoName = path.basename(this.ctx.projectRoot);

    let persona = '';
    switch (mode) {
      case 'design':
        persona = `You are the Principal Systems Architect for "${repoName}" in /DESIGN mode.\n` +
          `You specialize in domain modeling, architectural integrity, ADR decisions, AST symbol relationships, blast radius evaluation, living specifications, and Mermaid state flowcharts.\n` +
          `When conversing with the operator, be proactive, rigorous, and direct. Validate ideas against the causal graph, evaluate blast radiuses, propose ADRs when necessary, and break down architectural changes into concrete tickets.`;
        break;
      case 'product':
        persona = `You are the Technical Product Manager for "${repoName}" in /PRODUCT mode.\n` +
          `You track epics, sprint burndown, roadmap deliverables, ticket status transitions, and business value alignment.`;
        break;
      case 'dev':
        persona = `You are the Principal Software Engineer for "${repoName}" in /DEV mode.\n` +
          `You inspect AST symbols, synthesize codelets, promote simulation stubs to verified implementations, run verification test suites, execute OS shell commands, and sweep technical debt.`;
        break;
      case 'triage':
        persona = `You are the Quality & Reliability Lead for "${repoName}" in /TRIAGE mode.\n` +
          `You analyze test failures, inspect diffs, verify guideline compliance, execute pre-flight safety gates, and ensure zero regressions.`;
        break;
    }

    let prompt = `${persona}\n\n`;
    prompt += `### LIVE PROJECT CONTEXT:\n`;
    prompt += `- Project Root: ${this.ctx.projectRoot}\n`;
    prompt += `- Total Tickets: ${health.totalTickets} (Todo: ${health.laneCounts.Todo || 0}, In Progress: ${health.laneCounts['In Progress'] || 0}, Done: ${health.laneCounts.Done || 0}, Blocked: ${health.laneCounts.Blocked || 0})\n`;
    prompt += `- Open Bugs: ${health.openBugsCount} | Accepted ADRs: ${health.acceptedDecisionsCount}\n`;
    if (activeClaims.length > 0) {
      prompt += `- Active Leases: ${activeClaims.map(c => `${c.ticketId} (${c.claimedBy})`).join(', ')}\n`;
    }
    if (decisions.length > 0) {
      prompt += `- Key ADRs: ${decisions.slice(0, 6).map(d => `${d.id} (${d.title})`).join(', ')}\n`;
    }
    prompt += `\n`;
    prompt += this.toolCatalogPrompt;
    prompt += `\n### OPERATING RULES:\n`;
    prompt += `1. When the operator asks about design, project state, symbols, tests, or codebase changes, USE TOOLS to query ground truth instead of guessing.\n`;
    prompt += `2. If a command or tool exists in the tool catalog (e.g. \`get_project_overview\`, \`find_symbol\`, \`get_blast_radius\`, \`propose_decision\`, \`exec_os_shell\`), call it using a \`\`\`tool_call block.\n`;
    prompt += `3. Always provide clear, direct, professional, and actionable answers.\n`;

    return prompt;
  }
}
