/**
 * Responsibility: Central capability registry for deterministic and cognitive tools.
 * Scope: Defines ToolDefinition contracts with Zod schemas, shared across LLMActor and MCP.
 */

import { z, type ZodType } from 'zod';
import type { WorkflowStore } from '../graph/store.ts';

export interface ToolContext {
  store: WorkflowStore;
  projectRoot: string;
  [key: string]: any;
}

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  category: 'ticket' | 'graph' | 'compiler' | 'git' | 'os' | 'web' | 'test' | 'planning' | 'script' | 'kb';
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
    return await tool.execute(parsed, ctx);
  }
}

export const registry = new ToolRegistry();
