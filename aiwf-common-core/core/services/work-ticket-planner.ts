/**
 * Responsibility: Build deterministic ticketed execution plans for broad coding goals.
 * Scope: Produces and optionally persists work tickets plus graph links to the context that should govern execution.
 */

import fs from "node:fs";
import path from "node:path";
import { stableId } from "../lib/hash.ts";
import { buildTicketEntity, createSearchDocumentsForEntities, inferTicketLane } from "./projections.ts";
import { withWorkflowStore } from "./sync.ts";

const DEFAULT_DOD_TICKETS = [
  {
    suffix: "001",
    title: "Shared work-ticket planner and graph links",
    summary: "Add the deterministic planner API, CLI/MCP entry points, and DB graph links that connect generated work tickets to files, artifacts, codelets, guardrails, and parent work.",
    files: [
      "aiwf-common-core/core/services/work-ticket-planner.ts",
      "aiwf-common-core/core/services/workflow-facade.ts",
      "aiwf-shell/cli/lib/main.ts",
      "aiwf-mcp/server.ts",
      "tests/workflow-db.test.ts",
      "tests/ai-workflow-cli.test.ts"
    ],
    codelets: ["extract-ticket", "guidance-summary", "assess-code"],
    acceptance: [
      "Dry-run planning returns stable ticket ids and graph predicates without mutating workflow state.",
      "Apply mode persists generated tickets and graph predicates under the selected parent ticket.",
      "Invalid linked artifacts fail before any workflow DB mutation."
    ],
    verification: [
      "bun test tests/workflow-db.test.ts --test-name-pattern planWorkTickets",
      "bun test tests/ai-workflow-cli.test.ts --test-name-pattern \"project ticket plan\""
    ]
  },
  {
    suffix: "002",
    title: "Shell-exclusive coding workflow from natural language to ticket-gated execution",
    summary: "Route broad coding prompts through sync, ticket extraction, guideline extraction, codelet planning, execute-ticket apply gates, verification, and reporting.",
    files: ["aiwf-shell/cli/lib/shell.ts", "aiwf-common-core/core/services/operator-brain.ts", "aiwf-common-core/core/services/codelet-runtime.ts"],
    codelets: ["generate-code", "debug-code", "assess-code", "execute-ticket"],
    acceptance: [
      "Plan-only mode emits the normalized execution plan without codelets, tests, writes, or long live AI calls.",
      "Mutation mode refuses coding writes unless a ticket id and verification plan are present.",
      "Bounded execution happens only through execute-ticket --apply."
    ],
    verification: [
      "bun test tests/ai-workflow-cli.test.ts --test-name-pattern \"plan-only|execute-ticket\"",
      "ai-workflow shell \"fix first todo\" --plan-only --json"
    ]
  },
  {
    suffix: "003",
    title: "Best-use enforcement across shell, ask, MCP, and codelets",
    summary: "Normalize coding/review/debug requests across surfaces so they share context extraction, selected programs, guardrails, work-ticket recommendations, and mutation gates.",
    files: ["aiwf-shell/cli/lib/main.ts", "aiwf-mcp/server.ts", "aiwf-common-core/core/services/workflow-facade.ts"],
    codelets: ["guideline-enforcer", "assess-code"],
    acceptance: [
      "Shell, ask, and MCP surfaces expose equivalent work-ticket recommendations for the same coding prompt.",
      "Guideline enforcement runs before closure and reports pass, fail, or unknown with evidence.",
      "Status-query and codelet-registry routing do not hijack coding prompts."
    ],
    verification: [
      "ai-workflow ask \"debug this repo\" --json",
      "ai-workflow project ticket plan --goal \"debug this repo\" --parent TKT-SHELL-002 --json"
    ]
  },
  {
    suffix: "004",
    title: "Planner and codelet timeout progress and degraded-path reliability",
    summary: "Make slow local provider and planner paths emit progress events, finite timeout diagnostics, retry metadata, and explicit degraded-path reasons.",
    files: ["aiwf-common-core/core/services/sync.ts", "aiwf-common-core/core/services/core-llm.ts", "aiwf-common-core/core/codelets/smart-codelet-runner.ts"],
    codelets: ["debug-code", "assess-code", "guideline-enforcer"],
    acceptance: [
      "Slow local Ollama or assessment calls report progress before timeout.",
      "Timeouts produce failed assessment records with provider, model, latency, attempts, and fallback reason when available.",
      "Degraded scaffolds prefer surgical context packs before broad fallback output."
    ],
    verification: [
      "AI_WORKFLOW_AUTO_ASSESSMENT_TIMEOUT_MS=1000 ai-workflow sync --json",
      "bun test tests/ai-workflow-cli.test.ts --test-name-pattern \"timeout|degraded\""
    ]
  },
  {
    suffix: "005",
    title: "Live dogfood benchmark and exclusive-use readiness report",
    summary: "Run the final shell/workflow/provider dogfood, workflow audit, workspace honesty checks, and publish an evidence-backed readiness report with explicit fallback gaps.",
    files: ["docs/reports/aiwf-dod-experience-2026-05-16.md", "aiwf-common-core/core/services/dogfood-harness.ts", "aiwf-common-core/core/services/readiness-evaluator.ts"],
    codelets: ["dogfood", "artifact-judge", "assess-code"],
    acceptance: [
      "The report states exactly where AIWF is ready for exclusive use and where fallback remains required.",
      "Dogfood, workflow-audit, and workspace honesty evidence are linked from the report.",
      "Efficiency metrics include provider/model, latency, attempts, token usage when available, validation errors, fallback reason, and selected guardrails."
    ],
    verification: [
      "ai-workflow dogfood --surface shell,workflow,provider,init --profile bootstrap --json",
      "ai-workflow audit workflow --json",
      "AI_WORKFLOW_SKIP_AUTO_ASSESSMENT=1 ai-workflow sync --json"
    ]
  }
];

const GENERIC_TICKETS = [
  {
    suffix: "001",
    title: "Plan and guard the requested work",
    summary: "Extract the active ticket and guidelines, identify the bounded working set, and produce the verification plan before mutation.",
    codelets: ["extract-ticket", "guidance-summary", "assess-code"],
    acceptance: ["The work has a linked parent ticket, working set, guardrails, and verification commands."]
  },
  {
    suffix: "002",
    title: "Execute the bounded implementation",
    summary: "Apply only the scoped change through ticket-gated execution and keep generated code grounded in linked files.",
    codelets: ["generate-code", "debug-code", "execute-ticket"],
    acceptance: ["Writes happen only through a ticket-gated apply path and reference linked files."]
  },
  {
    suffix: "003",
    title: "Verify and report readiness",
    summary: "Run targeted verification, guideline enforcement, and final audit evidence before closure.",
    codelets: ["guideline-enforcer", "artifact-judge", "dogfood"],
    acceptance: ["Verification evidence is recorded and remaining fallback gaps are explicit."]
  }
];

export async function planWorkTickets(options: any = {}) {
  const {
    projectRoot = process.cwd(),
    goal,
    parentTicketId = null,
    artifacts = [],
    files = [],
    mode = "implementation",
    apply = false
  } = options;
  const root = path.resolve(String(projectRoot));
  const normalizedGoal = String(goal ?? "").trim();
  if (!normalizedGoal) {
    throw new Error("goal is required");
  }

  const linkedArtifacts = normalizeStringArray(artifacts);
  const linkedFiles = normalizeStringArray(files);
  const invalidArtifacts = linkedArtifacts.filter((artifact: string) => !fs.existsSync(path.resolve(root, artifact)));
  if (invalidArtifacts.length) {
    throw new Error(`Invalid artifact path(s): ${invalidArtifacts.join(", ")}`);
  }

  const parent = parentTicketId ? String(parentTicketId).trim() : null;
  const templates = selectTicketTemplates(normalizedGoal);
  const seed = stableId("work-ticket-plan", normalizedGoal, parent ?? "", mode);
  const plannedTickets = templates.map((template, index) => buildPlannedTicket({
    template,
    index,
    goal: normalizedGoal,
    parentTicketId: parent,
    artifacts: linkedArtifacts,
    files: uniqueStrings([...linkedFiles, ...((template as any).files ?? [])]),
    mode,
    seed
  }));
  const tickets = plannedTickets.map(toPublicTicket);
  const predicates = plannedTickets.flatMap((ticket) => ticket.graphPredicates);
  const result = {
    ok: true,
    applied: false,
    projectRoot: root,
    goal: normalizedGoal,
    parentTicketId: parent,
    mode,
    tickets,
    graphPredicates: predicates,
    diagnostics: {
      stableSeed: seed,
      invalidArtifacts: []
    }
  };

  if (!apply) {
    return result;
  }

  return withWorkflowStore(root, async (store) => {
    for (const ticket of plannedTickets) {
      store.upsertEntity(ticket.entity);
      for (const entity of ticket.linkedEntities) {
        store.upsertEntity(entity);
      }
      for (const predicate of ticket.graphPredicates) {
        store.appendArchitecturalPredicate(predicate);
      }
    }
    createSearchDocumentsForEntities(store);
    return {
      ...result,
      applied: true
    };
  });
}

function selectTicketTemplates(goal): any[] {
  const normalized = goal.toLowerCase();
  if (normalized.includes("shell-exclusive") || normalized.includes("exclusive-use") || normalized.includes("aiwf shell")) {
    return DEFAULT_DOD_TICKETS;
  }
  return GENERIC_TICKETS;
}

function buildPlannedTicket({ template, index, goal, parentTicketId, artifacts, files, mode, seed }) {
  const id = ticketIdForTemplate(template, index, seed);
  const verificationCommands = uniqueStrings([...(template.verification ?? []), "AI_WORKFLOW_SKIP_AUTO_ASSESSMENT=1 ai-workflow sync --json"]);
  const recommendedCodelets = uniqueStrings(template.codelets ?? []);
  const acceptanceCriteria = uniqueStrings(template.acceptance ?? []);
  const acceptanceMatrix = acceptanceCriteria.map((criterion, index) => ({
    id: `${id}-AC-${index + 1}`,
    criterion,
    weaknessIds: ["work-ticket-planning"],
    verificationCommands,
    evidenceRefs: [],
    status: "pending",
    verified: false
  }));
  const entity = buildTicketEntity({
    id,
    title: template.title,
    lane: inferTicketLane({ id, title: template.title, lane: "Todo" }),
    epicId: parentTicketId,
    summary: template.summary
  });
  entity.parentId = parentTicketId;
  entity.sourceKind = "work-ticket-planner";
  entity.provenance = "work-ticket-planner";
  entity.data = {
    ...(entity.data ?? {}),
    goal,
    mode,
    parentTicketId,
    summary: template.summary,
    linkedFiles: files,
    linkedArtifacts: artifacts,
    acceptanceCriteria,
    verificationCommands,
    recommendedCodelets,
    planningStatus: "draft",
    planningVerdict: "pending",
    planningPacket: {
      ticketId: id,
      status: "draft",
      verdict: "pending",
      problemStatement: template.summary,
      sourceEvidence: uniqueStrings([goal, parentTicketId, ...artifacts]),
      affectedSurfaces: uniqueStrings([mode, ...recommendedCodelets]),
      linkedFiles: files,
      linkedArtifacts: artifacts,
      linkedPackages: [],
      acceptanceCriteria,
      acceptanceMatrix,
      verificationCommands,
      nonGoals: ["Do not mutate files outside the planned working set."],
      riskFallbackPlan: ["Stop before mutation and report the missing planning or verification evidence."],
      weaknesses: ["work-ticket-planning"]
    },
    graphPredicates: []
  };

  const linkedEntities = [
    ...files.map((filePath) => linkedEntity(`file:${filePath}`, "file", filePath)),
    ...artifacts.map((artifactPath) => linkedEntity(`artifact:${artifactPath}`, "artifact", artifactPath)),
    ...recommendedCodelets.map((codeletId) => linkedEntity(`codelet:${codeletId}`, "codelet", codeletId)),
    linkedEntity(`guardrail:ticket-gated-execution`, "guardrail", "ticket-gated execution"),
    linkedEntity(`guardrail:verification-required`, "guardrail", "verification required")
  ];
  const graphPredicates = [
    ...(parentTicketId ? [predicate(id, "planned_under", parentTicketId, { kind: "parent" })] : []),
    ...files.map((filePath) => predicate(id, "touches_file", `file:${filePath}`, { filePath })),
    ...artifacts.map((artifactPath) => predicate(id, "uses_artifact", `artifact:${artifactPath}`, { artifactPath })),
    ...recommendedCodelets.map((codeletId) => predicate(id, "recommends_codelet", `codelet:${codeletId}`, { codeletId })),
    predicate(id, "guarded_by", "guardrail:ticket-gated-execution", { guardrail: "ticket-gated execution" }),
    predicate(id, "guarded_by", "guardrail:verification-required", { guardrail: "verification required" }),
    ...verificationCommands.map((command) => predicate(id, "verified_by", `command:${stableId(command).slice(0, 12)}`, { command }))
  ];
  entity.data.graphPredicates = graphPredicates.map(({ subjectId, predicate, objectId, metadata }) => ({ subjectId, predicate, objectId, metadata }));

  return {
    id,
    title: template.title,
    parent: parentTicketId,
    summary: template.summary,
    linkedFiles: files,
    linkedArtifacts: artifacts,
    graphPredicates,
    acceptanceCriteria,
    verificationCommands,
    recommendedCodelets,
    entity,
    linkedEntities
  };
}

function ticketIdForTemplate(template, index, seed) {
  if (DEFAULT_DOD_TICKETS.includes(template)) {
    return `TKT-AIWF-DOD-${template.suffix}`;
  }
  return `TKT-WORK-${seed.slice(0, 8).toUpperCase()}-${String(index + 1).padStart(3, "0")}`;
}

function toPublicTicket(ticket) {
  return {
    id: ticket.id,
    title: ticket.title,
    parent: ticket.parent,
    summary: ticket.summary,
    linkedFiles: ticket.linkedFiles,
    linkedArtifacts: ticket.linkedArtifacts,
    graphPredicates: ticket.graphPredicates,
    acceptanceCriteria: ticket.acceptanceCriteria,
    verificationCommands: ticket.verificationCommands,
    recommendedCodelets: ticket.recommendedCodelets
  };
}

function linkedEntity(id, entityType, title) {
  return {
    id,
    entityType,
    title,
    lane: null,
    state: "active",
    confidence: 1,
    provenance: "work-ticket-planner",
    sourceKind: "work-ticket-planner",
    reviewState: "active",
    parentId: null,
    data: {}
  };
}

function predicate(subjectId, predicateName, objectId, metadata = {}) {
  return {
    subjectId,
    predicate: predicateName,
    objectId,
    metadata: {
      ...metadata,
      source: "work-ticket-planner"
    }
  };
}

function normalizeStringArray(value): string[] {
  return uniqueStrings((Array.isArray(value) ? value : [value]).flatMap((item) => String(item ?? "").split(",")).map((item) => item.trim()).filter(Boolean));
}

function uniqueStrings(values: any[]): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}
