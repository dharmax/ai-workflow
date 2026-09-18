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
import { registerTestTools } from './test-runner.ts';
import { registerScriptingTools } from './scripting.ts';
import { registerCompilerTools } from './compiler.ts';
import { registerScaffoldTools } from './scaffold.ts';
import { registerDebuggerTools } from './debugger.ts';
import { registerKnowledgebaseTools } from './kb.ts';
import { bucketRouter, TwoTierRouter, type ToolBucket } from './bucket-router.ts';

let initialized = false;

export function initializeTools(): ToolRegistry {
  if (!initialized) {
    registerTicketTools();
    registerGraphTools();
    registerGitTools();
    registerOsTools();
    registerPlanningTools();
    registerTestTools();
    registerScriptingTools();
    registerCompilerTools();
    registerScaffoldTools();
    registerDebuggerTools();
    registerKnowledgebaseTools();
    initialized = true;
  }
  return registry;
}

export { registry, type ToolRegistry, type ToolContext, type ToolDefinition, bucketRouter, TwoTierRouter, type ToolBucket };
