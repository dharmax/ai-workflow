/**
 * Responsibility: Manage the tool's execution mode (Shell vs Skill).
 * Scope: Handles detection and propagation of context-specific behavior.
 */

export enum ExecutionMode {
  Shell = "shell", // Interactive human REPL
  Skill = "skill"  // Headless agent tool
}

export interface ExecutionContext {
  mode: ExecutionMode;
  projectRoot: string;
  parentAgent?: string;
}

export function detectExecutionMode(): ExecutionMode {
  if (process.env.AI_WORKFLOW_CONTEXT === "skill" || process.argv.includes("--skill-mode")) {
    return ExecutionMode.Skill;
  }
  return ExecutionMode.Shell;
}
