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
        const fn = new AsyncFunction('store', 'sp', 'registry', 'ctx', `
          ${code.includes('return') ? code : `return (${code});`}
        `);

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
