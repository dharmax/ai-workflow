/**
 * Responsibility: Tools aggregator and initializer.
 * Scope: Exposes registry and registers all domain facilities.
 */

import { registry, type ToolRegistry, type ToolContext, type ToolDefinition } from './registry.ts';
import { registerTicketTools } from './tickets.ts';
import { registerGraphTools } from './graph-queries.ts';
import { registerGitTools } from './git.ts';
import { registerOsTools } from './os.ts';
import { registerPlanningTools } from './planning.ts';
import { registerProductTools } from './product.ts';
import { registerTestTools } from './test-runner.ts';
import { registerScriptingTools } from './scripting.ts';
import { registerCompilerTools } from './compiler.ts';
import { registerScaffoldTools } from './scaffold.ts';
import { registerDebuggerTools } from './debugger.ts';
import { registerKnowledgebaseTools } from './kb.ts';
import { registerChangeTools } from './change.ts';
import { registerArtifactPolicyTools } from './artifact-policy.ts';
import { registerAspectTools } from './aspects.ts';
import { registerRuleTools } from './rules.ts';
import {z} from 'zod';
import {refreshDefaultModelAdvice} from '../model-runtime.ts';

let initialized = false;

export function initializeTools(): ToolRegistry {
  if (!initialized) {
    registerTicketTools();
    registerGraphTools();
    registerGitTools();
    registerOsTools();
    registerPlanningTools();
    registerProductTools();
    registerTestTools();
    registerScriptingTools();
    registerCompilerTools();
    registerScaffoldTools();
    registerDebuggerTools();
    registerKnowledgebaseTools();
    registerChangeTools();
    registerArtifactPolicyTools();
    registerAspectTools();
    registerRuleTools();
    registry.register({
      name: 'refresh_model_advice', category: 'kb',
      description: 'Explicitly refresh native llm-utils workload advice using live provider catalogue evidence and configured local research. Preserves developer overrides; no paid research or pulls.',
      parameters: z.object({}).strict(),
      execute: async (_args, ctx) => {
        if (ctx.executionAuthority !== 'project-write') throw new Error('Model advice refresh requires project-write authority.');
        return refreshDefaultModelAdvice(ctx.projectRoot);
      }
    });
    initialized = true;
  }
  return registry;
}

export { registry, type ToolRegistry, type ToolContext, type ToolDefinition };
