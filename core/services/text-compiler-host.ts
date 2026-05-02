/**
 * Responsibility: Bridge ai-workflow operator plans into the shared @dharmax/text-compiler host boundary.
 * Scope: Keeps repo-specific service wiring and workflow persistence thin while delegating compilation/execution to the package.
 */

import { HeuristicContextManager } from "@dharmax/context-manager";
import {
  CompilerToolkit,
  TextCompiler,
  type PromptExecutor,
  type RuntimeToolkitOverrides,
  type WorkflowStoreLike
} from "@dharmax/text-compiler";

import { stableId } from "../lib/hash.ts";
import { generateCompletion } from "./providers.ts";
import { routeTask } from "./router.ts";
import { runHooks } from "./hooks.ts";
import { getGlobalConfigPath, getProjectConfigPath, readConfigSafe } from "../../cli/lib/config-store.ts";

type OperatorServices = Record<string, any>;

type ExecuteTextCompilerWorkflowOptions = {
  workflowStore: any;
  prompt: string;
  instructions: string;
  runId?: string;
  services?: OperatorServices;
  root?: string;
  planner?: Record<string, unknown> | null;
  traceWorkflow?: ((event: Record<string, unknown>) => void) | null;
  workflowLogger?: ((...args: unknown[]) => void) | null;
};

const COMPILER_JOB_TASK_CLASS: Record<string, string> = {
  "intent-analysis": "classification",
  "service-synthesis": "code-generation",
  "logic-generation": "project-planning",
  "logic-critique": "review"
};

class AiWorkflowPromptExecutor implements PromptExecutor {
  private readonly root: string;
  private readonly planner: Record<string, unknown> | null;

  constructor(root: string, planner: Record<string, unknown> | null = null) {
    this.root = root;
    this.planner = planner;
  }

  async prompt(text: string, jobType: string, systemPrompt?: string): Promise<string> {
    const plannerProviderId = typeof this.planner?.providerId === "string" ? this.planner.providerId : null;
    const plannerModelId = typeof this.planner?.modelId === "string" ? this.planner.modelId : null;
    let candidate = null;
    let provider = null;

    if (plannerProviderId && plannerModelId) {
      candidate = {
        providerId: plannerProviderId,
        modelId: plannerModelId,
        apiKey: this.planner?.apiKey,
        baseUrl: this.planner?.baseUrl,
        host: this.planner?.host
      };
    } else {
      const taskClass = COMPILER_JOB_TASK_CLASS[jobType] ?? "project-planning";
      const route = await routeTask({
        root: this.root,
        taskClass,
        allowWeak: jobType === "intent-analysis"
      } as never);
      candidate = route.recommended ?? route.candidates?.[0];
      provider = route.providers?.[candidate?.providerId ?? ""];
    }

    if (!candidate) {
      throw new Error(`No routed model available for compiler job '${jobType}'.`);
    }

    const completion = await generateCompletion({
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      system: systemPrompt,
      prompt: text,
      config: {
        apiKey: candidate.apiKey ?? provider?.apiKey ?? this.planner?.apiKey,
        baseUrl: candidate.baseUrl ?? provider?.baseUrl ?? this.planner?.baseUrl,
        host: candidate.host ?? provider?.host ?? this.planner?.host
      }
    });

    if (!completion?.ok) {
      throw new Error(`Compiler job '${jobType}' failed.`);
    }

    return String(completion.response ?? completion.text ?? "");
  }
}

export async function executeTextCompilerWorkflow({
  workflowStore,
  prompt,
  instructions,
  runId,
  services = {},
  root = process.cwd(),
  planner = null,
  traceWorkflow = null,
  workflowLogger = null
}: ExecuteTextCompilerWorkflowOptions) {
  const finalRunId = runId ?? stableId("run", prompt, Date.now());
  const initialState = workflowStore.getWorkflowStateMap?.(finalRunId) ?? {};
  
  const compiler = new TextCompiler({
    toolkit: new CompilerToolkit(new AiWorkflowPromptExecutor(root, planner))
  });
  
  // Directly register repo services as a bag
  compiler.serviceRegistry.registerBag("sh", services.sh ?? {});
  compiler.serviceRegistry.registerBag("shell", services.shell ?? {});
  compiler.serviceRegistry.registerBag("files", services.files ?? {});
  compiler.serviceRegistry.registerBag("status", services.status ?? {});
  compiler.serviceRegistry.registerBag("orchestrator", services.orchestrator ?? {});
  compiler.serviceRegistry.registerBag("codelets", services.codelets ?? {});
  compiler.serviceRegistry.registerBag("sync", services.sync ?? {}, {
    createTicket: { description: "Create a workflow ticket.", input: { title: "string", data: "object?" }, output: { entity: "ticket" } },
    updateTicketLifecycle: { description: "Move/resolve ticket.", input: { ticketId: "string", action: "string", lane: "string?" }, output: { ok: "boolean" } }
  });

  const compiled = await compiler.compile(instructions, { useCritic: "auto", maxRetries: 3 });

  workflowStore.upsertWorkflowRun({ id: finalRunId, prompt, code: compiled.sourceCode, status: "running", result: null });

  const result = await compiled.execute(
    {
      sessionId: finalRunId,
      sessionState: { ...initialState },
      history: [],
      contextManager: new HeuristicContextManager({ async query() { return []; }, async add() {} }),
      async queryGraph() { return []; },
      async mutateGraph() {}
    },
    buildRuntimeToolkitOverrides({ workflowStore, runId: finalRunId, traceWorkflow, workflowLogger })
  );

  finalizeWorkflowExecution(workflowStore, finalRunId, result, instructions);

  return {
    runId: finalRunId,
    ok: result.success,
    result: result.output,
    trace: result.executionTrace ?? [],
    status: result.status ?? "completed",
    compiledSource: compiled.sourceCode,
    error: result.errorReport
  };
}

export async function executeJsOrchestrator(code: string, { 
  workflowStore, 
  prompt, 
  runId,
  services = {},
  initialState = {},
  root = process.cwd(),
  traceWorkflow = null,
  workflowLogger = (...args: any[]) => console.error(...args)
}: any = {}) {
  const finalRunId = runId ?? stableId("run", prompt, Date.now());
  const actualInitialState = { ...initialState, ...(workflowStore.getWorkflowStateMap?.(finalRunId) ?? {}) };
  
  const compiler = new TextCompiler({
    toolkit: new CompilerToolkit(new AiWorkflowPromptExecutor(root))
  });
  compiler.serviceRegistry.registerBag("shell", services);

  workflowStore.upsertWorkflowRun({ id: finalRunId, prompt, code, status: "running", result: null });

  const result = await compiler.executeRaw(
    code,
    {
      sessionId: finalRunId,
      sessionState: actualInitialState,
      history: [],
      contextManager: new HeuristicContextManager({ async query() { return []; }, async add() {} }),
      async queryGraph() { return []; },
      async mutateGraph() {}
    },
    {
      ...buildRuntimeToolkitOverrides({ workflowStore, runId: finalRunId, traceWorkflow, workflowLogger }),
      services: { ...services, db: workflowStore }
    }
  );

  finalizeWorkflowExecution(workflowStore, finalRunId, result, code);

  if (!result.success) throw new Error(result.errorReport);
  return { runId: finalRunId, ok: true, result: result.output };
}

function buildRuntimeToolkitOverrides({
  workflowStore,
  runId,
  traceWorkflow,
  workflowLogger
}: {
  workflowStore: any;
  runId: string;
  traceWorkflow?: ((event: Record<string, unknown>) => void) | null;
  workflowLogger?: ((...args: unknown[]) => void) | null;
}): RuntimeToolkitOverrides {
  return {
    log(message: string, level: "info" | "warn" | "error" | "success" = "info") {
      workflowLogger?.(`[Workflow:${runId}] [${level}] ${message}`);
    },
    trigger(sourceName: string, eventName: string, data: unknown) {
      const payload = { runId, recordedAt: new Date().toISOString(), sourceName, eventName, data };
      try { traceWorkflow?.(payload); } catch { /* ignore */ }

      if (sourceName === "StateMachine" && eventName === "StateEnter") {
        const stateName = String((data as Record<string, unknown>)?.state ?? "").trim();
        if (stateName) {
          workflowStore.upsertWorkflowRun({ id: runId, currentState: stateName, status: "running" });
        }
      }
    },
    scheduleResume(delayMs: number, resumeState: string, payload?: unknown) {
      workflowStore.upsertWorkflowIssue({
        id: stableId("workflow-issue", runId, "resume", delayMs, resumeState),
        runId,
        issueType: "resume-scheduled",
        severity: "info",
        summary: `Workflow suspended for resume state '${resumeState}'.`,
        details: { delayMs, resumeState, payload },
        status: "open"
      });
    }
  };
}

function finalizeWorkflowExecution(workflowStore: any, runId: string, result: any, source: string) {
    if (result.executionTrace) {
        TextCompiler.persistTrace(workflowStore, runId, result.executionTrace);
    }

    if (!result.success) {
        workflowStore.upsertWorkflowIssue({
            id: stableId("workflow-issue", runId, "execution-failure"),
            runId,
            issueType: "exception",
            severity: "error",
            summary: result.errorReport ?? "Execution failed.",
            details: { source, trace: result.executionTrace ?? [] },
            status: "open"
        });
        workflowStore.upsertWorkflowRun({
            id: runId, status: "failed", currentState: result.suspensionSnapshot?.resumeState ?? null,
            result: { error: result.errorReport, trace: result.executionTrace ?? [], source }
        });
    } else {
        workflowStore.upsertWorkflowRun({
            id: runId, status: result.status === "suspended" ? "running" : "completed",
            currentState: result.suspensionSnapshot?.resumeState ?? null,
            result: { output: result.output, trace: result.executionTrace ?? [], source }
        });
    }
}
