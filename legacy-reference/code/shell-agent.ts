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
    options: { maxSteps?: number; timeoutMs?: number; onStep?: (trace: AgentStepTrace) => void } = {}
  ): Promise<AgentTurnResult> {
    this.mode = mode;
    const maxSteps = options.maxSteps ?? (Number(process.env.SHELL_AGENT_MAX_STEPS) || 4);
    const steps: AgentStepTrace[] = [];

    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.BUN_TEST);
    const turnTimeout = options.timeoutMs ?? (isTest ? 500 : (Number(process.env.SHELL_AGENT_TIMEOUT_MS) || 90000));

    const systemPrompt = this.buildSystemPrompt(mode);
    let currentInput = userMessage;
    const allObservations: string[] = [];

    for (let stepIndex = 1; stepIndex <= maxSteps; stepIndex++) {
      const stepTrace: AgentStepTrace = { step: stepIndex };

      let modelResponseText = '';
      try {
        const res = await this.session.ask(currentInput, {
          system: systemPrompt,
          task: 'reasoning',
          timeoutMs: turnTimeout
        });

        if (res.failure) {
          const timeoutDetail = res.failure.kind === 'timeout' ? ` (timed out after ${turnTimeout}ms - model may be cold-loading or busy)` : '';
          const errMsg = `Model communication issue: ${res.failure.message}${timeoutDetail}`;
          stepTrace.thought = errMsg;
          steps.push(stepTrace);
          return {
            output: allObservations.length > 0
              ? `${errMsg}\n\n[Observations Collected Before Failure]:\n${allObservations.join('\n\n')}`
              : errMsg,
            steps,
            mode
          };
        }

        modelResponseText = res.ok && res.text ? res.text.trim() : '';
        if (!modelResponseText) {
          const emptyMsg = 'Model returned an empty response.';
          stepTrace.thought = emptyMsg;
          steps.push(stepTrace);
          return {
            output: emptyMsg,
            steps,
            mode
          };
        }
      } catch (err: any) {
        const errMsg = `Error during reasoning: ${err?.message || String(err)}`;
        stepTrace.thought = errMsg;
        steps.push(stepTrace);
        return {
          output: errMsg,
          steps,
          mode
        };
      }

      // Check for one or multiple tool calls in response
      const toolCalls = this.parseToolCalls(modelResponseText);
      if (toolCalls.length === 0) {
        // Final text response reached
        const cleanOutput = this.cleanModelOutput(modelResponseText);
        stepTrace.thought = cleanOutput;
        steps.push(stepTrace);
        return {
          output: cleanOutput,
          steps,
          mode
        };
      }

      const observationBlocks: string[] = [];
      for (const toolCall of toolCalls) {
        const traceItem: AgentStepTrace = {
          step: stepIndex,
          toolCall
        };
        const toolResult = await executeShellTool(toolCall.tool, toolCall.args, this.ctx, { userIntent: userMessage });
        traceItem.toolResult = toolResult;
        steps.push(traceItem);

        if (options.onStep) {
          options.onStep(traceItem);
        }

        let formattedOutput = toolResult.output.trim();
        if (formattedOutput.length > 1500) {
          formattedOutput = formattedOutput.slice(0, 1500) + `\n... [truncated ${formattedOutput.length - 1500} chars for context limits]`;
        }
        const obs = `[OBSERVATION for ${toolCall.tool}]:\n${formattedOutput}`;
        observationBlocks.push(obs);
        allObservations.push(obs);
      }

      // Format combined observations back to model
      currentInput = `${observationBlocks.join('\n\n')}\n\nReview the observations above. If you have enough information to answer the user's request, provide your final synthesized answer now. Only call another tool if essential data is still missing.`;
    }

    // If max steps reached (model kept calling tools on all steps), ask for final summary anchored to user request
    let finalOutput = '';
    try {
      const summaryRes = await this.session.ask(
        `Please summarize your final findings and provide a direct, actionable answer addressing all aspects of the user's request: "${userMessage}".`,
        {
          system: systemPrompt,
          task: 'reasoning',
          timeoutMs: turnTimeout
        }
      );

      if (summaryRes.ok && summaryRes.text) {
        finalOutput = this.cleanModelOutput(summaryRes.text);
      }
    } catch {
      // Handled by observation fallback below
    }

    if (!finalOutput) {
      finalOutput = allObservations.length > 0
        ? `Completed maximum reasoning steps (${maxSteps}). Findings gathered from tools:\n\n${allObservations.join('\n\n')}`
        : `Completed maximum reasoning steps (${maxSteps}) without final synthesized summary.`;
    }

    return {
      output: finalOutput,
      steps,
      mode
    };
  }

  /**
   * Parses all tool calls from model output (supports multiple json fences and xml tags).
   */
  public parseToolCalls(text: string): Array<{ tool: string; args: Record<string, any> }> {
    const rawToolCalls: Array<{ tool: string; args: Record<string, any> }> = [];

    // 1. Match ```tool_call or ```json blocks (also allow ``` with JSON)
    const blockRegex = /```(?:tool_call|json)?\s*(\{[\s\S]*?\})\s*```/gi;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.tool && typeof parsed.tool === 'string') {
          rawToolCalls.push({
            tool: parsed.tool,
            args: parsed.args || parsed.parameters || {}
          });
        }
      } catch {
        // Continue
      }
    }

    // 2. Match <tool_call name="...">...</tool_call> tags
    const tagRegex = /<tool_call(?:\s+name=["']([^"']+)["'])?>([\s\S]*?)<\/tool_call>/gi;
    while ((match = tagRegex.exec(text)) !== null) {
      const toolName = match[1];
      const body = match[2]?.trim() || '{}';
      try {
        const args = body ? JSON.parse(body) : {};
        if (toolName) {
          rawToolCalls.push({ tool: toolName, args });
        } else if (args.tool) {
          rawToolCalls.push({ tool: args.tool, args: args.args || {} });
        }
      } catch {
        // Continue
      }
    }

    // Deduplicate identical tool calls in the same turn
    const uniqueToolCalls: Array<{ tool: string; args: Record<string, any> }> = [];
    const seen = new Set<string>();
    for (const tc of rawToolCalls) {
      const key = `${tc.tool}:${JSON.stringify(tc.args)}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueToolCalls.push(tc);
      }
    }

    return uniqueToolCalls;
  }

  /**
   * Strips trailing simulated multi-turn tokens that smaller models (e.g. 7B) occasionally emit.
   */
  public cleanModelOutput(text: string): string {
    const simulatedTurnIndex = text.search(/\n(?:\[USER\]|User|Human|Operator):/i);
    if (simulatedTurnIndex !== -1) {
      return text.slice(0, simulatedTurnIndex).trim();
    }
    return text.trim();
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
    prompt += `\n### CORE OPERATIONAL & REASONING PROTOCOL:\n`;
    prompt += `1. **Complex & Multi-Sentence Requests**:\n` +
      `   - When the operator provides a complex prompt with multiple sentences, comments, critiques, or instructions, systematically break down every request.\n` +
      `   - Address each question and comment thoroughly. Do not skip subtleties or give surface-level answers.\n`;
    prompt += `2. **Ground Truth Tool Execution**:\n` +
      `   - Never guess file contents, git status, AST symbols, test results, or graph relations. Use the appropriate tools (\`get_blast_radius\`, \`find_symbol\`, \`exec_os_shell\`, \`doctor_diagnose\`, \`search_knowledge\`, etc.).\n` +
      `   - You can call MULTIPLE tools in a single turn by outputting multiple \`\`\`tool_call blocks.\n`;
    prompt += `3. **Action & Follow-up**:\n` +
      `   - When design or architecture decisions are established and requested, propose them via \`propose_decision\` and create tracking tickets via \`create_ticket\` or \`track_plan_document\`.\n` +
      `   - Format your final response with clear Markdown headers, code blocks, and structured action items.\n`;
    prompt += `4. **Strict Mutation Guard (Read-Only by Default)**:\n` +
      `   - When answering questions, architecture queries, or performing analysis, NEVER run \`git commit\`, \`git push\`, \`git branch\`, or destructive filesystem commands via \`exec_os_shell\`.\n` +
      `   - Use \`exec_os_shell\` ONLY for non-mutating verification (e.g. \`bun test\`, \`git status\`, \`git diff\`, \`ls\`, \`grep\`).\n` +
      `   - DO NOT invoke mutating tools (\`propose_decision\`, \`accept_decision\`, \`create_ticket\`, \`update_ticket_state\`, \`claim_ticket\`) unless the operator explicitly directs creating, starting, modifying, or deleting a resource.\n` +
      `   - All unsolicited observations or questions are INQUIRIES only.\n`;

    return prompt;
  }
}
