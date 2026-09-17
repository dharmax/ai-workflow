/**
 * Responsibility: On-the-fly JavaScript Scripting Facility.
 * Scope: Direct eval execution in the Bun context with store, sp, and registry exposed for instant power queries.
 */

import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';

export function registerScriptingTools() {
  registry.register({
    name: 'script_eval',
    description: 'Directly evaluate JavaScript in the Bun context with store, registry, and sp exposed for instant queries.',
    category: 'script' as any,
    parameters: z.object({
      code: z.string().describe('JavaScript code to evaluate (can be async or sync)')
    }),
    execute: async ({ code }, ctx: ToolContext) => {
      try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const trimmed = code.trim();
        const hasStatements = /;\s*$|[\n;]|^\s*(const|let|var|throw|if|for|while|try|switch)\b/.test(trimmed);
        const body = hasStatements || trimmed.includes('return')
          ? trimmed
          : `return (${trimmed});`;

        const fn = new AsyncFunction('store', 'sp', 'registry', 'ctx', body);
        const result = await fn(ctx.store, ctx.store.sp, registry, ctx);
        return {
          success: true,
          result: result === undefined ? null : result
        };
      } catch (err: any) {
        return {
          success: false,
          error: err.message,
          stack: err.stack
        };
      }
    }
  });
}
