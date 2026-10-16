/**
 * Responsibility: Central capability registry for deterministic and cognitive tools.
 * Scope: Defines ToolDefinition contracts with Zod schemas, shared across LLMActor and MCP.
 */

import { z, type ZodType } from 'zod';
import { countEngineering } from '../performance-metrics.ts';
import type { WorkflowStore } from '../graph/store.ts';

export interface ToolContext {
  store: WorkflowStore;
  projectRoot: string;
  signal?: AbortSignal;
  executionAuthority?: 'read-only' | 'project-write';
  scratchRoot?: string;
  [key: string]: any;
}

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  category: 'ticket' | 'graph' | 'compiler' | 'git' | 'os' | 'web' | 'test' | 'planning' | 'script' | 'kb' | 'change';
  parameters: ZodType<TParams>;
  execute: (params: TParams, ctx: ToolContext) => Promise<TResult> | TResult;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register<TParams, TResult>(tool: ToolDefinition<TParams, TResult>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: ToolDefinition['category']): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  async execute(name: string, params: any, ctx: ToolContext): Promise<any> {
    const tool = this.get(name);
    if (!tool) throw new Error(`Tool '${name}' not found in registry.`);
    const parsed = tool.parameters.parse(params);
    countEngineering('toolCalls');
    const authority = ctx.executionAuthority ?? 'read-only';
    if (authority === 'read-only' && tool.category === 'script')
      throw Error('Arbitrary script execution requires project-write authority; read-only execution cannot evaluate code.');
    return await ctx.store.withExecutionContext(authority, ctx.signal, () =>
      Promise.resolve(tool.execute(parsed, {...ctx, executionAuthority: authority})));
  }
}

export const registry = new ToolRegistry();
