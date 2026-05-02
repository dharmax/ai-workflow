/**
 * Responsibility: Bridge ai-workflow operator plans into the shared @dharmax/text-compiler host boundary.
 * Scope: Keeps repo-specific service wiring and workflow persistence thin while delegating compilation/execution to the package.
 */

import vm from "node:vm";
import { HeuristicContextManager } from "@dharmax/context-manager";
import {
  AnnotatedStateMachine,
  CompilerToolkit,
  TextCompiler,
  type PromptExecutor,
  type ServiceDescriptor
} from "@dharmax/text-compiler";

import { stableId } from "../lib/hash.ts";
import { generateCompletion } from "./providers.ts";
import { routeTask } from "./router.ts";
import { runHooks } from "./hooks.ts";
import { getGlobalConfigPath, getProjectConfigPath, readConfigSafe } from "../../cli/lib/config-store.ts";

type WorkflowStoreLike = {
  upsertWorkflowRun(run: Record<string, unknown>): void;
  upsertWorkflowStep(step: Record<string, unknown>): void;
  addWorkflowTransition(transition: Record<string, unknown>): void;
  setWorkflowState(runId: string, key: string, value: unknown): void;
  getWorkflowStateMap?(runId: string): Record<string, unknown>;
  upsertWorkflowIssue(issue: Record<string, unknown>): void;
  listWorkflowSteps(runId: string): any[];
  getWorkflowState(runId: string, key: string, fallback: any): any;
};

type OperatorServices = Record<string, any>;

type ExecuteTextCompilerWorkflowOptions = {
  workflowStore: WorkflowStoreLike;
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
  const runtimeToolkit = buildRuntimeToolkit({
    workflowStore,
    runId: finalRunId,
    initialState,
    services,
    root,
    traceWorkflow,
    workflowLogger
  });
  const compiler = new TextCompiler({
    toolkit: new CompilerToolkit(new AiWorkflowPromptExecutor(root, planner)),
    services: buildOperatorServiceDescriptors(services)
  });

  const compiled = await compiler.compile(instructions, {
    useCritic: "auto",
    maxRetries: 3
  });
  const contextStore = {
    async query() {
      return [];
    },
    async add() {}
  };
  const contextManager = new HeuristicContextManager(contextStore);

  workflowStore.upsertWorkflowRun({
    id: finalRunId,
    prompt,
    code: compiled.sourceCode,
    status: "running",
    result: null
  });

  const result = await compiled.execute(
    {
      sessionId: finalRunId,
      sessionState: { ...initialState },
      history: [],
      contextStore,
      contextManager,
      async queryGraph() {
        return [];
      },
      async mutateGraph() {}
    },
    runtimeToolkit
  );

  persistWorkflowState(workflowStore, finalRunId, runtimeToolkit.sm.memory);
  persistWorkflowTrace(workflowStore, finalRunId, result.executionTrace ?? []);

  if (!result.success) {
    workflowStore.upsertWorkflowIssue({
      id: stableId("workflow-issue", finalRunId, "compiler"),
      runId: finalRunId,
      issueType: "exception",
      severity: "error",
      summary: result.errorReport ?? "Text compiler execution failed.",
      details: {
        instructions,
        trace: result.executionTrace ?? []
      },
      status: "open"
    });
    workflowStore.upsertWorkflowRun({
      id: finalRunId,
      status: "failed",
      currentState: result.suspensionSnapshot?.resumeState ?? null,
      result: {
        error: result.errorReport ?? "Unknown text compiler failure",
        trace: result.executionTrace ?? [],
        instructions
      }
    });
    return {
      runId: finalRunId,
      ok: false,
      error: result.errorReport ?? "Unknown text compiler failure",
      result: null,
      compiledSource: compiled.sourceCode
    };
  }

  workflowStore.upsertWorkflowRun({
    id: finalRunId,
    status: result.status === "suspended" ? "running" : "completed",
    currentState: result.suspensionSnapshot?.resumeState ?? null,
    result: {
      output: result.output,
      trace: result.executionTrace ?? [],
      instructions
    }
  });

  return {
    runId: finalRunId,
    ok: true,
    result: result.output,
    trace: result.executionTrace ?? [],
    status: result.status ?? "completed",
    compiledSource: compiled.sourceCode
  };
}

/**
 * Orchestrates raw JS-based workflows with unified persistence and recovery.
 * Replaces the legacy js-orchestrator.ts.
 */
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
  
  const runtimeToolkit = buildRuntimeToolkit({
    workflowStore,
    runId: finalRunId,
    initialState: actualInitialState,
    services,
    root,
    traceWorkflow,
    workflowLogger
  });

  const sandbox = {
    ...services,
    sm: runtimeToolkit.sm,
    log: runtimeToolkit.log.bind(runtimeToolkit),
    trigger: runtimeToolkit.trigger.bind(runtimeToolkit),
    scheduleResume: runtimeToolkit.scheduleResume.bind(runtimeToolkit),
    step: async (id: string, description: string, fn: () => Promise<any>) => {
      const start = Date.now();
      runtimeToolkit.trigger("StateMachine", "StateEnter", { state: id, description });
      try {
        const result = await fn();
        runtimeToolkit.sm.trace.push({
          state: id,
          action: description,
          result: "SUCCESS",
          duration: Date.now() - start
        });
        return result;
      } catch (error: any) {
        runtimeToolkit.sm.trace.push({
          state: id,
          action: description,
          result: "ERROR",
          duration: Date.now() - start
        });
        throw error;
      }
    },
    shellAction: async (action: any) => {
      if (typeof services.shellAction === "function") {
        return services.shellAction(action);
      }
      // Fallback for standalone use if shellAction service wasn't provided
      const { executeShellAction } = await import("../../cli/lib/shell.ts");
      return executeShellAction(action, { root });
    },
    services,
    db: workflowStore,
    console: {
      log: (...args: any[]) => workflowLogger?.(`[Run:${finalRunId}] ${args.join(" ")}`),
      error: (...args: any[]) => workflowLogger?.(`[ERROR] [Run:${finalRunId}] ${args.join(" ")}`),
    },
    process: {
      cwd: () => root,
      env: { ...process.env }
    }
  };

  try {
    const trimmedCode = code.trim().replace(/^```javascript/, "").replace(/^```js/, "").replace(/^```/, "").replace(/```$/, "");
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const argKeys = Object.keys(sandbox);
    const argValues = Object.values(sandbox);
    
    let userFn;
    if (trimmedCode.startsWith("async") || trimmedCode.startsWith("function")) {
      const context = vm.createContext(sandbox);
      userFn = vm.runInContext(`(${trimmedCode})`, context);
    } else {
      userFn = new AsyncFunction(...argKeys, trimmedCode);
    }

    const result = await (trimmedCode.startsWith("async") || trimmedCode.startsWith("function") 
      ? userFn.call(sandbox) 
      : userFn(...argValues));

    persistWorkflowState(workflowStore, finalRunId, runtimeToolkit.sm.memory);
    workflowStore.upsertWorkflowRun({
      id: finalRunId,
      status: "completed",
      result: { output: result }
    });

    return { runId: finalRunId, ok: true, result };
  } catch (err: any) {
    const errorDetails = { error: err.message, stack: err.stack };
    workflowStore.upsertWorkflowIssue({
      id: stableId("workflow-issue", finalRunId, "sandbox-crash"),
      runId: finalRunId,
      issueType: "exception",
      severity: "error",
      summary: "Sandbox crash",
      details: errorDetails,
      status: "open"
    });
    workflowStore.upsertWorkflowRun({
      id: finalRunId,
      status: "failed",
      result: { error: err.message }
    });
    throw err;
  }
}

function buildRuntimeToolkit({
  workflowStore,
  runId,
  initialState,
  services,
  root,
  traceWorkflow,
  workflowLogger
}: {
  workflowStore: WorkflowStoreLike;
  runId: string;
  initialState: Record<string, unknown>;
  services: OperatorServices;
  root: string;
  traceWorkflow?: ((event: Record<string, unknown>) => void) | null;
  workflowLogger?: ((...args: any[]) => void) | null;
}) {
  const sm = new AnnotatedStateMachine();
  sm.memory = { ...initialState };

  return {
    sm,
    services,
    log(message: string, level: "info" | "warn" | "error" | "success" = "info") {
      try {
        workflowLogger?.(`[Workflow:${runId}] [${level}] ${message}`);
      } catch {
        // Ignore logger failures.
      }
    },
    trigger(sourceName: string, eventName: string, data: unknown) {
      const payload = {
        runId,
        recordedAt: new Date().toISOString(),
        sourceName,
        eventName,
        data
      };
      try {
        traceWorkflow?.(payload);
      } catch {
        // Ignore trace sink failures.
      }

      if (sourceName === "StateMachine" && eventName === "StateEnter") {
        const stateName = String((data as Record<string, unknown>)?.state ?? "").trim();
        if (stateName) {
          workflowStore.upsertWorkflowRun({
            id: runId,
            currentState: stateName,
            status: "running"
          });
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


function buildOperatorServiceDescriptors(services: OperatorServices): ServiceDescriptor[] {
  const descriptors: ServiceDescriptor[] = [];

  const registerGroup = (
    prefix: string,
    group: Record<string, unknown> | undefined,
    schemaByMethod: Record<string, { input: Record<string, unknown>; output: Record<string, unknown>; description: string }> = {}
  ) => {
    for (const [methodName, value] of Object.entries(group ?? {})) {
      if (typeof value !== "function") {
        continue;
      }
      const schema = schemaByMethod[methodName] ?? {
        input: { args: "any" },
        output: { result: "any" },
        description: `${prefix}.${methodName}`
      };
      descriptors.push({
        name: `${prefix}${capitalize(methodName)}`,
        description: schema.description,
        schema: {
          input: schema.input,
          output: schema.output
        },
        async execute(args: unknown) {
          return callService(value, args);
        }
      });
    }
  };

  registerGroup("sync", services.sync as Record<string, unknown>, {
    createTicket: {
      description: "Create a workflow ticket before mutating project state.",
      input: { title: "string", data: "object?" },
      output: { entity: "ticket" }
    },
    updateTicketLifecycle: {
      description: "Move or resolve a workflow ticket.",
      input: { ticketId: "string", action: "string", lane: "string?" },
      output: { ok: "boolean" }
    },
    assess: {
      description: "Run a deeper assessment before risky architectural changes.",
      input: { target: "object|string", options: "object?" },
      output: { status: "string", report: "object?" }
    }
  });
  registerGroup("status", services.status as Record<string, unknown>);
  registerGroup("files", services.files as Record<string, unknown>, {
    write: {
      description: "Write a project file. Use only after ticket creation/update requirements are satisfied.",
      input: { relativePath: "string", content: "string" },
      output: { ok: "boolean" }
    }
  });
  registerGroup("orchestrator", services.orchestrator as Record<string, unknown>);
  registerGroup("codelets", services.codelets as Record<string, unknown>);
  registerGroup("shell", services.shell as Record<string, unknown>);
  registerGroup("sh", services.sh as Record<string, unknown>, {
    execute: {
      description: "Run a subprocess with explicit args. Prefer service calls when possible.",
      input: { command: "string", args: "string[]" },
      output: { stdout: "string", stderr: "string", ok: "boolean" }
    }
  });

  return descriptors;
}

async function callService(fn: unknown, args: unknown) {
  if (typeof fn !== "function") {
    throw new Error("Service is not callable.");
  }

  if (Array.isArray(args)) {
    return await fn(...args);
  }

  if (args && typeof args === "object" && "title" in (args as Record<string, unknown>) && "data" in (args as Record<string, unknown>)) {
    const payload = args as { title: unknown; data: unknown };
    return await fn(payload.title, payload.data);
  }

  if (args && typeof args === "object" && "target" in (args as Record<string, unknown>) && "options" in (args as Record<string, unknown>)) {
    const payload = args as { target: unknown; options: unknown };
    return await fn(payload.target, payload.options);
  }

  if (args && typeof args === "object" && "relativePath" in (args as Record<string, unknown>) && "content" in (args as Record<string, unknown>)) {
    const payload = args as { relativePath: unknown; content: unknown };
    return await fn(payload.relativePath, payload.content);
  }

  if (args && typeof args === "object" && "command" in (args as Record<string, unknown>) && "args" in (args as Record<string, unknown>)) {
    const payload = args as { command: unknown; args: unknown };
    return await fn(payload.command, payload.args);
  }

  return await fn(args);
}

function persistWorkflowState(workflowStore: WorkflowStoreLike, runId: string, memory: Record<string, unknown>) {
  for (const [key, value] of Object.entries(memory ?? {})) {
    workflowStore.setWorkflowState(runId, key, value);
  }
}

function persistWorkflowTrace(
  workflowStore: WorkflowStoreLike,
  runId: string,
  trace: Array<{ state?: string | null; action?: string; result?: unknown; duration?: number }>
) {
  const seenStateCounts = new Map<string, number>();

  for (let index = 0; index < trace.length; index += 1) {
    const entry = trace[index] ?? {};
    const rawState = String(entry.state ?? `trace-${index + 1}`);
    const stateCount = (seenStateCounts.get(rawState) ?? 0) + 1;
    seenStateCounts.set(rawState, stateCount);
    const stepId = stateCount > 1 ? `${rawState}#${stateCount}` : rawState;
    const failed = entry.result === "ERROR";

    workflowStore.upsertWorkflowStep({
      runId,
      stepId,
      description: String(entry.action ?? rawState),
      status: failed ? "failed" : "completed",
      result: failed ? null : entry.result,
      error: failed ? { message: `State '${rawState}' failed.` } : null,
      completedAt: new Date().toISOString()
    });

    if (index > 0) {
      const previous = trace[index - 1] ?? {};
      workflowStore.addWorkflowTransition({
        runId,
        from: String(previous.state ?? `trace-${index}`),
        to: rawState,
        label: String(entry.action ?? rawState),
        triggerType: "state-machine",
        payload: {
          duration: entry.duration ?? null
        }
      });
    }
  }
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
