/**
 * Responsibility: Provide a unified hub for all core services.
 * Scope: Acts as the Service Adapter Pattern entry point for codelets and tools.
 */

import { KanbanManager } from "./kanban-manager.ts";
import { WorkflowFacade } from "./workflow-facade.ts";
import { CoreLLM } from "./core-llm.ts";
import { TerminalContext } from "./terminal-context.ts";
import { detectExecutionMode } from "./execution-context.ts";
import type { ExecutionContext } from "./execution-context.ts";

export interface ServiceHub {
  facade: WorkflowFacade;
  kanban: KanbanManager;
  llm: CoreLLM;
  terminal: typeof TerminalContext;
  context: ExecutionContext;
}

export function createServiceHub(projectRoot: string = process.cwd()): ServiceHub {
  const mode = detectExecutionMode();
  const context: ExecutionContext = { projectRoot, mode };
  
  return {
    facade: new WorkflowFacade(context),
    kanban: new KanbanManager(context),
    llm: new CoreLLM(context),
    terminal: TerminalContext,
    context
  };
}
