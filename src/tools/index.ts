/**
 * Responsibility: Tools aggregator and initializer.
 * Scope: Exposes commandRegistry and registers all domain facilities.
 */

import { commandRegistry, type CommandRegistry, type ToolContext, type ToolDefinition } from './registry.ts';
import {registerHostTools} from './host.ts';
import {registerAgentTools} from './agent.ts';
import {registerPublicCommands} from './commands.ts';
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
import {GraphPredicateActionSchema,GraphLinkActionSchema,graphPredicateAction,graphLinkAction} from '../product/links.ts';
import {refreshDefaultModelAdvice} from '../services/model-service.ts';

let initialized = false;

export function initializeTools(): CommandRegistry {
  if (!initialized) {
    registerTicketTools();
    commandRegistry.register({name:'graph.predicate',category:'graph',description:'List declared H/O/L predicate descriptors or check an exact source-kind/predicate/target-kind triple; declaration is not write permission.',parameters:GraphPredicateActionSchema,execute:(args,ctx)=>graphPredicateAction(ctx.store,args)});
    commandRegistry.register({name:'graph.link',category:'graph',description:'Read canonical directed relationships: bounded list scoped to sourceId, or show exact sourceId/predicate/targetId. No mutations.',parameters:GraphLinkActionSchema,execute:(args,ctx)=>graphLinkAction(ctx.store,args)});
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
    commandRegistry.register({
      name: 'refresh_model_advice', category: 'kb',
      description: 'Refresh model advice using the explicitly configured Radar research authority and observed provider catalogues; optionally specify a critic focus. Paid research requires explicit spending authorization.',
      parameters: z.object({criticFocus: z.string().trim().min(1).optional()}).strict(),
      execute: async (args, ctx) => {
        if (ctx.executionAuthority !== 'project-write') throw new Error('Model advice refresh requires project-write authority.');
        return refreshDefaultModelAdvice(ctx.projectRoot, args.criticFocus);
      }
    });
    registerAgentTools();
    registerHostTools();
    registerPublicCommands();
    initialized = true;
  }
  return commandRegistry;
}

export { commandRegistry, type CommandRegistry, type ToolContext, type ToolDefinition };
