/**
 * Responsibility: Normalize coding/review/debug requests into the shared AIWF execution workflow.
 * Scope: Produces surface-neutral workflow plans, guardrails, work-ticket recommendations, mutation gates, and verification contracts.
 */

import { normalizeOperatorRequest, planExecutionProgram, buildHarnessContextPack, runExecutionProgram } from "./operator-harness.ts";
import { planWorkTickets } from "./work-ticket-planner.ts";
import { routeTask } from "./router.ts";

const CODING_PROMPT_RE = /\b(write|debug|review|refactor|fix|analy[sz]e|implement|change|modify|patch|todo|architecture|design|guideline|guardrail|goe|code)\b/i;
const TICKET_RE = /\b(?:BUG|TKT|EPC|EPIC|REL|REF|MOD|FEAT)-[A-Z0-9-]+\b/gi;

export function isCodingWorkflowRequest(text: string): boolean {
  const normalized = String(text ?? "").trim();
  if (!normalized) {
    return false;
  }
  return CODING_PROMPT_RE.test(normalized);
}

export async function planCodingWorkflow(options: any = {}) {
  const {
    projectRoot = process.cwd(),
    text,
    goal = text,
    parentTicketId = null,
    artifacts = [],
    files = [],
    surface = "operator",
    mode = "implementation",
    apply = false,
    includeRoute = false,
    plannerContext = null,
    continuationState = null
  } = options;
  const normalizedGoal = String(goal ?? "").trim();
  if (!normalizedGoal) {
    throw new Error("goal is required");
  }

  const normalizedRequest = await normalizeOperatorRequest(normalizedGoal, {
    surface,
    plannerContext,
    continuationState
  });
  const program = planExecutionProgram(normalizedRequest);
  const contextPack = await buildHarnessContextPack(projectRoot, {
    normalizedRequest,
    plannerContext,
    includeProviderAvailability: false,
    includeStatus: false,
    includeRelevantTargets: false
  });
  const harness = runExecutionProgram({
    normalizedRequest,
    program,
    contextPack
  });
  const effectiveParent = parentTicketId ?? extractTicketId(normalizedGoal);
  const ticketPlan = await planWorkTickets({
    projectRoot,
    goal: normalizedGoal,
    parentTicketId: effectiveParent,
    artifacts,
    files,
    mode,
    apply
  });
  const selectedCodelets = selectWorkflowCodelets(normalizedGoal, ticketPlan);
  const route = includeRoute
    ? await routeTask({
      root: projectRoot,
      taskClass: normalizedRequest.taskClass,
      preferLocal: true,
      allowWeak: true,
      allowRemoteEnrichment: false,
      allowWebEnrichment: false
    }).catch((error: any) => ({
      taskClass: normalizedRequest.taskClass,
      recommended: null,
      degradedPath: true,
      failureReasons: [error?.message ?? String(error)]
    }))
    : {
      taskClass: normalizedRequest.taskClass,
      recommended: null,
      degradedPath: true,
      failureReasons: ["route skipped for plan-only coding workflow"]
    };
  const verificationPlan = uniqueStrings([
    ...program.verificationPlan,
    ...ticketPlan.tickets.flatMap((ticket: any) => ticket.verificationCommands ?? [])
  ]);
  const mutationGate = buildMutationGate({
    normalizedRequest,
    parentTicketId: effectiveParent,
    verificationPlan
  });

  return {
    ok: true,
    surface,
    normalizedRequest,
    selectedProgram: {
      programKind: program.programKind,
      allowedMutations: program.allowedMutations,
      requiredEvidence: program.requiredEvidence,
      steps: program.steps
    },
    workflow: {
      steps: [
        "sync",
        "extract-ticket",
        "extract-guidelines",
        "plan-work-tickets",
        "codelet-plan",
        "execute-ticket",
        "verify",
        "report"
      ],
      typedCodelets: selectedCodelets,
      harnessTrace: harness.harnessTrace
    },
    guardrails: {
      selected: contextPack.guardrails ?? [],
      active: contextPack.guidelines ?? []
    },
    workTicketPlan: ticketPlan,
    route: {
      taskClass: route.taskClass,
      recommended: route.recommended ?? null,
      degradedPath: Boolean(route.degradedPath),
      failureReasons: route.failureReasons ?? []
    },
    mutationGate,
    verificationPlan,
    diagnostics: {
      planOnlySafe: true,
      ticketId: effectiveParent,
      selectedCodelets,
      degradedPath: Boolean(route.degradedPath || harness.harnessTrace?.degradedPath),
      fallbackReason: route.failureReasons?.[0] ?? null
    }
  };
}

function extractTicketId(text: string): string | null {
  const matches = String(text ?? "").match(TICKET_RE);
  return matches?.[0]?.toUpperCase() ?? null;
}

function selectWorkflowCodelets(goal: string, ticketPlan: any): string[] {
  const lower = String(goal ?? "").toLowerCase();
  const fromTickets = ticketPlan.tickets.flatMap((ticket: any) => ticket.recommendedCodelets ?? []);
  const selected = [];
  if (/\b(debug|bug|failing|failure|root cause|trace)\b/.test(lower)) selected.push("debug-code");
  if (/\b(review|assess|architecture|design|analy[sz]e)\b/.test(lower)) selected.push("assess-code");
  if (/\b(write|implement|fix|refactor|patch|change|modify|todo)\b/.test(lower)) selected.push("generate-code");
  if (/\b(guideline|guardrail|goe|enforce|audit)\b/.test(lower)) selected.push("guideline-enforcer");
  selected.push(...fromTickets);
  return uniqueStrings(selected);
}

function buildMutationGate({ normalizedRequest, parentTicketId, verificationPlan }: any) {
  const wantsMutation = normalizedRequest.mutationIntent !== "read-only";
  const hasTicket = Boolean(parentTicketId);
  const hasVerification = Array.isArray(verificationPlan) && verificationPlan.length > 0;
  return {
    wantsMutation,
    canMutate: wantsMutation ? hasTicket && hasVerification : false,
    requiresTicket: wantsMutation,
    requiresExecuteTicketApply: wantsMutation,
    requiresVerificationPlan: wantsMutation,
    refusalReason: wantsMutation && !hasTicket
      ? "coding mutation requires a workflow ticket before execute-ticket --apply"
      : wantsMutation && !hasVerification
        ? "coding mutation requires a verification plan before execute-ticket --apply"
        : null
  };
}

function uniqueStrings(values: any[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}
