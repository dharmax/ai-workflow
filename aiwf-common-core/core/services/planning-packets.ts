/**
 * Responsibility: Persist and validate ticket planning packets before reliability mutations.
 * Scope: Stores planning state on ticket entities and produces epic-level traceability matrices.
 */

import { openWorkflowStore } from "../db/sqlite-store.ts";
import { createSearchDocumentsForEntities, writeProjectProjections } from "./projections.ts";

const REQUIRED_PACKET_FIELDS = [
  "problemStatement",
  "sourceEvidence",
  "affectedSurfaces",
  "linkedFiles",
  "acceptanceCriteria",
  "verificationCommands",
  "nonGoals",
  "riskFallbackPlan",
  "weaknesses"
];

export const RELIABILITY_WEAKNESSES = [
  { id: "REL-WEAK-TRUTH", summary: "workflow truth, stale Done cards, mutation provenance, and projections can disagree" },
  { id: "REL-WEAK-GOE", summary: "GoE policy is documented but not a persisted runtime gate" },
  { id: "REL-WEAK-HOOKS", summary: "guardrails and hooks can remain passive prompt text instead of blocking weak plans" },
  { id: "REL-WEAK-GRAPH", summary: "planning retrieval lacks graph plus semantic plus lexical confidence checks" },
  { id: "REL-WEAK-LLM", summary: "Ollama and cheapest-capable routing can fail silently or waste repeated bad attempts" },
  { id: "REL-WEAK-CODEGEN", summary: "code generation and execute-ticket quality are brittle for real project mutation" },
  { id: "REL-WEAK-PARITY", summary: "shell, ask, and MCP/plugin surfaces can expose different planning and guardrail behavior" },
  { id: "REL-WEAK-BENCH", summary: "AIWF lacks a repeatable benchmark against Gemini CLI and external agents" },
  { id: "REL-WEAK-READINESS", summary: "final readiness can close without proof for every weakness and gate" }
];

const RELIABILITY_BLUEPRINTS: Record<string, any> = {
  "TKT-REL-001": blueprint("TKT-REL-001", ["REL-WEAK-TRUTH"], {
    problemStatement: "Make sync, mutation provenance, kanban archive state, assessments, candidates, and projections agree before any new readiness claim.",
    sourceEvidence: ["honest reliability report", "AIWF sync protocol violations", "kanban.md Done lane", "kanban-archive.md"],
    affectedSurfaces: ["sync", "kanban projection", "epics projection", "workflow audit", "ticket lifecycle"],
    linkedFiles: [
      "kanban.md",
      "kanban-archive.md",
      "aiwf-common-core/core/services/projections.ts",
      "aiwf-common-core/core/services/sync.ts",
      "aiwf-common-core/core/services/planning-packets.ts"
    ],
    acceptanceCriteria: [
      row("REL-WEAK-TRUTH", "sync reports reliability planning state for active tickets"),
      row("REL-WEAK-TRUTH", "completed tickets keep a single completion suffix in live kanban and are mirrored in kanban-archive.md"),
      row("REL-WEAK-TRUTH", "reliability tickets cannot start mutation without an approved planning packet"),
      row("REL-WEAK-TRUTH", "reliability tickets cannot close while acceptance rows are unverified")
    ],
    verificationCommands: [
      "bun test tests/workflow-db.test.ts --test-name-pattern planning",
      "bun test tests/ai-workflow-cli.test.ts --test-name-pattern \"ticket plan\"",
      "AI_WORKFLOW_SKIP_AUTO_ASSESSMENT=1 ai-workflow sync --json"
    ]
  }),
  "TKT-REL-002": blueprint("TKT-REL-002", ["REL-WEAK-GOE"], {
    problemStatement: "Turn GoE policy into persisted runtime verdicts before protected mutation.",
    sourceEvidence: ["honest reliability report", "docs/goe-triad-contract.md", "docs/goe-default-on-policy.md"],
    affectedSurfaces: ["GoE runtime", "mutation gates", "workflow DB"],
    linkedFiles: ["aiwf-common-core/core/services", "docs/goe-triad-contract.md"],
    acceptanceCriteria: [row("REL-WEAK-GOE", "suggester, critic, and auditor verdicts persist with evidence refs")],
    verificationCommands: ["bun test tests/hooks.test.ts --test-name-pattern GoE"]
  }),
  "TKT-REL-003": blueprint("TKT-REL-003", ["REL-WEAK-HOOKS"], {
    problemStatement: "Create blocking hook points before plan, mutation, verification, and closure.",
    sourceEvidence: ["honest reliability report", "aiwf-common-core/core/services/hooks.ts"],
    affectedSurfaces: ["shell", "ask", "MCP/plugin", "codelets"],
    linkedFiles: ["aiwf-common-core/core/services/hooks.ts", "aiwf-common-core/core/lib/workspace-mutation.ts"],
    acceptanceCriteria: [row("REL-WEAK-HOOKS", "beforePlan, afterPlan, beforeMutation, and beforeClosure hooks can block weak work")],
    verificationCommands: ["bun test tests/hooks.test.ts"]
  }),
  "TKT-REL-004": blueprint("TKT-REL-004", ["REL-WEAK-GRAPH"], {
    problemStatement: "Use Semantika or equivalent graph retrieval to select planning context with confidence.",
    sourceEvidence: ["honest reliability report", "workflow DB graph state"],
    affectedSurfaces: ["retrieval", "planning context", "SQLite graph"],
    linkedFiles: ["aiwf-common-core/core/services/knowledge-graph.ts", "aiwf-common-core/core/services/context-packer.ts"],
    acceptanceCriteria: [row("REL-WEAK-GRAPH", "planning context uses lexical, graph, and semantic evidence with confidence diagnostics")],
    verificationCommands: ["bun test tests/shell-retrieval.test.ts"]
  }),
  "TKT-REL-005": blueprint("TKT-REL-005", ["REL-WEAK-LLM"], {
    problemStatement: "Make flaky local providers visible, bounded, and economical.",
    sourceEvidence: ["honest reliability report", "provider metrics", "Ollama failures"],
    affectedSurfaces: ["providers", "router", "metrics", "planner"],
    linkedFiles: ["aiwf-common-core/core/services/providers.ts", "aiwf-common-core/core/services/router.ts"],
    acceptanceCriteria: [row("REL-WEAK-LLM", "provider attempts report latency, failure class, retry, cooldown, and fallback reason")],
    verificationCommands: ["bun test tests/providers.test.ts --test-name-pattern ollama"]
  }),
  "TKT-REL-006": blueprint("TKT-REL-006", ["REL-WEAK-CODEGEN"], {
    problemStatement: "Raise execute-ticket and code generation from brittle search/replace to reliable scoped mutation.",
    sourceEvidence: ["honest reliability report", "execute-ticket codelet behavior"],
    affectedSurfaces: ["generate-code", "execute-ticket", "verification"],
    linkedFiles: ["aiwf-common-core/core/codelets/execute-ticket.ts", "aiwf-common-core/core/services/orchestrator.ts"],
    acceptanceCriteria: [row("REL-WEAK-CODEGEN", "ticket execution validates working set, structured patch intent, file creation, and end-to-end build evidence")],
    verificationCommands: ["bun test tests/codelet-executor.test.ts --test-name-pattern execute-ticket"]
  }),
  "TKT-REL-007": blueprint("TKT-REL-007", ["REL-WEAK-PARITY"], {
    problemStatement: "Guarantee shell, ask, and MCP/plugin use the same planning contract.",
    sourceEvidence: ["honest reliability report", "dual-surface protocol"],
    affectedSurfaces: ["shell", "ask", "MCP", "plugin"],
    linkedFiles: ["aiwf-shell/cli/lib/main.ts", "aiwf-mcp/server.ts", "aiwf-common-core/core/services/workflow-facade.ts"],
    acceptanceCriteria: [row("REL-WEAK-PARITY", "the same prompt exposes equivalent planning packet, guardrails, route, and verification plan across surfaces")],
    verificationCommands: ["bun test tests/workflow-facade.test.ts tests/router-and-cli.test.ts"]
  }),
  "TKT-REL-008": blueprint("TKT-REL-008", ["REL-WEAK-BENCH"], {
    problemStatement: "Benchmark AIWF against Gemini CLI and external agents on a repeatable task corpus.",
    sourceEvidence: ["honest reliability report", "docs/gemini-cli-handout.md"],
    affectedSurfaces: ["benchmark harness", "reports", "metrics"],
    linkedFiles: ["aiwf-common-core/core/services/shell-benchmark.ts", "docs/gemini-cli-handout.md"],
    acceptanceCriteria: [row("REL-WEAK-BENCH", "benchmark records correctness, scope control, verification, speed, token/cost, recovery, and honesty")],
    verificationCommands: ["bun test tests/shell-benchmark.test.ts"]
  }),
  "TKT-REL-009": blueprint("TKT-REL-009", ["REL-WEAK-READINESS"], {
    problemStatement: "Publish final readiness only after every weakness has proof and no unresolved reliability limitations remain hidden.",
    sourceEvidence: ["honest reliability report", "dogfood reports", "workflow audit"],
    affectedSurfaces: ["readiness", "dogfood", "workflow audit", "reports"],
    linkedFiles: ["docs/reports", "aiwf-common-core/core/services/readiness-evaluator.ts"],
    acceptanceCriteria: [row("REL-WEAK-READINESS", "final report links clean sync, dogfood, audit, builds, parity tests, benchmark, and zero planning gaps")],
    verificationCommands: [
      "ai-workflow dogfood --surface shell,workflow,provider,init,mcp,goe --profile reliability --json",
      "ai-workflow audit workflow --json",
      "AI_WORKFLOW_SKIP_AUTO_ASSESSMENT=1 ai-workflow sync --json"
    ]
  })
};

export async function validateTicketPlanningPacket({ projectRoot = process.cwd(), ticketId }: any = {}) {
  return withPlanningStore(projectRoot, (store) => validateTicketInStore(store, ticketId));
}

export async function approveTicketPlanningPacket({ projectRoot = process.cwd(), ticketId, writeProjections = true }: any = {}) {
  return withPlanningStore(projectRoot, async (store) => {
    const ticket = requireTicket(store, ticketId);
    const packet = normalizePlanningPacket(RELIABILITY_BLUEPRINTS[ticket.id] ?? ticket.data?.planningPacket ?? derivePacketFromTicket(ticket), ticket);
    const validation = validatePacketShape(packet);
    if (!validation.ok) {
      return { ok: false, ticketId: ticket.id, errors: validation.errors, packet };
    }
    const approvedAt = new Date().toISOString();
    const approvedPacket = {
      ...packet,
      status: "approved",
      verdict: "approved",
      approvedAt,
      acceptanceMatrix: packet.acceptanceMatrix.map((entry: any) => ({
        ...entry,
        status: entry.status ?? "pending",
        verified: Boolean(entry.verified),
        evidenceRefs: normalizeStringArray(entry.evidenceRefs)
      }))
    };
    store.upsertEntity({
      ...ticket,
      data: {
        ...(ticket.data ?? {}),
        planningStatus: "approved",
        planningVerdict: "approved",
        planningPacket: approvedPacket
      }
    });
    createSearchDocumentsForEntities(store);
    if (writeProjections) {
      await writeProjectProjections(store, { projectRoot });
    }
    return { ok: true, ticketId: ticket.id, planningStatus: "approved", packet: approvedPacket };
  });
}

export async function verifyTicketPlanningAcceptance({ projectRoot = process.cwd(), ticketId, acceptanceId = null, evidenceRefs = [], writeProjections = true }: any = {}) {
  return withPlanningStore(projectRoot, async (store) => {
    const ticket = requireTicket(store, ticketId);
    const validation = validatePlanningPacketOnTicket(ticket);
    if (!validation.ok || validation.packet?.verdict !== "approved") {
      return { ok: false, ticketId: ticket.id, errors: validation.errors.length ? validation.errors : ["planning packet is not approved"], packet: validation.packet };
    }
    const refs = normalizeStringArray(evidenceRefs);
    if (!refs.length) {
      return { ok: false, ticketId: ticket.id, errors: ["at least one evidence ref is required"], packet: validation.packet };
    }
    const targetId = String(acceptanceId ?? "all").trim();
    const verifyAll = !targetId || targetId === "all" || targetId === "*";
    const verifiedAt = new Date().toISOString();
    let matched = 0;
    const acceptanceMatrix = validation.packet.acceptanceMatrix.map((entry: any) => {
      if (!verifyAll && entry.id !== targetId) {
        return entry;
      }
      matched += 1;
      return {
        ...entry,
        status: "verified",
        verified: true,
        verifiedAt,
        evidenceRefs: normalizeStringArray([...normalizeStringArray(entry.evidenceRefs), ...refs])
      };
    });
    if (!matched) {
      return { ok: false, ticketId: ticket.id, errors: [`acceptance row ${targetId} not found`], packet: validation.packet };
    }
    const packet = {
      ...validation.packet,
      acceptanceMatrix
    };
    store.upsertEntity({
      ...ticket,
      data: {
        ...(ticket.data ?? {}),
        planningStatus: "approved",
        planningVerdict: "approved",
        planningPacket: packet
      }
    });
    createSearchDocumentsForEntities(store);
    if (writeProjections) {
      await writeProjectProjections(store, { projectRoot });
    }
    return { ok: true, ticketId: ticket.id, verifiedRows: matched, evidenceRefs: refs, packet };
  });
}

export async function buildPlanningMatrix({ projectRoot = process.cwd(), epicId }: any = {}) {
  return withPlanningStore(projectRoot, (store) => {
    const tickets = store.listEntities({ entityType: "ticket" })
      .filter((ticket: any) => !epicId || ticket.parentId === epicId || ticket.data?.epic === epicId)
      .sort((left: any, right: any) => String(left.id).localeCompare(String(right.id)));
    const rows = tickets.map((ticket: any) => {
      const validation = validateTicketInStore(store, ticket.id);
      const packet = ticket.data?.planningPacket ?? null;
      return {
        ticketId: ticket.id,
        title: ticket.title,
        lane: ticket.lane,
        planningStatus: ticket.data?.planningStatus ?? packet?.status ?? "missing",
        verdict: packet?.verdict ?? "missing",
        weaknesses: normalizeStringArray(packet?.weaknesses),
        acceptanceCriteria: normalizeAcceptanceCriteria(packet)
          .map((entry: any) => ({ id: entry.id, weaknessIds: normalizeStringArray(entry.weaknessIds), verified: Boolean(entry.verified) })),
        ok: validation.ok,
        errors: validation.errors
      };
    });
    const coverage = RELIABILITY_WEAKNESSES.map((weakness) => {
      const coveredBy = rows.flatMap((row) => row.acceptanceCriteria
        .filter((entry: any) => entry.weaknessIds.includes(weakness.id))
        .map((entry: any) => ({ ticketId: row.ticketId, acceptanceId: entry.id, verified: entry.verified })));
      return { ...weakness, covered: coveredBy.length > 0, coveredBy };
    });
    const uncoveredWeaknesses = coverage.filter((entry) => !entry.covered).map((entry) => entry.id);
    const missingOrRejectedTickets = rows.filter((row) => !row.ok).map((row) => row.ticketId);
    return {
      ok: uncoveredWeaknesses.length === 0 && missingOrRejectedTickets.length === 0,
      epicId: epicId ?? null,
      rows,
      coverage,
      uncoveredWeaknesses,
      missingOrRejectedTickets
    };
  });
}

export function assertPlanningApprovedForMutation(ticket: any) {
  if (!requiresReliabilityPlanning(ticket)) {
    return;
  }
  const validation = validatePlanningPacketOnTicket(ticket);
  if (!validation.ok || validation.packet?.verdict !== "approved") {
    throw new Error(`Planning packet is required before mutating ${ticket.id}: ${validation.errors.join("; ") || "packet is not approved"}`);
  }
}

export function assertPlanningVerifiedForClosure(ticket: any) {
  if (!requiresReliabilityPlanning(ticket)) {
    return;
  }
  const validation = validatePlanningPacketOnTicket(ticket);
  if (!validation.ok || validation.packet?.verdict !== "approved") {
    throw new Error(`Planning packet is required before closing ${ticket.id}: ${validation.errors.join("; ") || "packet is not approved"}`);
  }
  const unverified = normalizeAcceptanceCriteria(validation.packet).filter((entry: any) => !entry.verified || !normalizeStringArray(entry.evidenceRefs).length);
  if (unverified.length) {
    throw new Error(`Cannot close ${ticket.id}; unverified acceptance rows: ${unverified.map((entry: any) => entry.id).join(", ")}`);
  }
}

export function validatePlanningPacketOnTicket(ticket: any) {
  if (!ticket || ticket.entityType !== "ticket") {
    return { ok: false, errors: ["ticket not found"], packet: null };
  }
  const packet = ticket.data?.planningPacket ?? null;
  if (!packet) {
    return { ok: false, errors: ["planning packet is missing"], packet: null };
  }
  const normalized = normalizePlanningPacket(packet, ticket);
  const validation = validatePacketShape(normalized);
  return { ...validation, packet: normalized };
}

export function getPlanningProjectionState(ticket: any) {
  const packet = ticket?.data?.planningPacket ?? null;
  const status = ticket?.data?.planningStatus ?? packet?.status ?? "missing";
  const verdict = packet?.verdict ?? ticket?.data?.planningVerdict ?? "missing";
  const acceptance = normalizeAcceptanceCriteria(packet);
  return {
    status,
    verdict,
    totalRows: acceptance.length,
    verifiedRows: acceptance.filter((entry: any) => entry.verified && normalizeStringArray(entry.evidenceRefs).length).length
  };
}

function validateTicketInStore(store: any, ticketId: string) {
  const ticket = requireTicket(store, ticketId);
  return {
    ticketId: ticket.id,
    ...validatePlanningPacketOnTicket(ticket)
  };
}

async function withPlanningStore(projectRoot: string, callback: any) {
  const store = await openWorkflowStore({ projectRoot });
  try {
    return await callback(store);
  } finally {
    store.close();
  }
}

function requireTicket(store: any, ticketId: string) {
  const id = String(ticketId ?? "").trim();
  if (!id) {
    throw new Error("ticketId is required");
  }
  const ticket = store.getEntity(id);
  if (!ticket || ticket.entityType !== "ticket") {
    throw new Error(`Ticket ${id} not found.`);
  }
  return ticket;
}

function requiresReliabilityPlanning(ticket: any) {
  return String(ticket?.id ?? "").startsWith("TKT-REL-")
    || ticket?.parentId === "EPC-AIWF-RELIABILITY-001"
    || ticket?.data?.epic === "EPC-AIWF-RELIABILITY-001"
    || ticket?.data?.requiresPlanningPacket === true;
}

function validatePacketShape(packet: any) {
  const errors = [];
  for (const field of REQUIRED_PACKET_FIELDS) {
    const value = packet?.[field];
    const present = Array.isArray(value) ? value.length > 0 : String(value ?? "").trim().length > 0;
    if (!present) {
      errors.push(`planningPacket.${field} is required`);
    }
  }
  const acceptance = normalizeAcceptanceCriteria(packet);
  if (!acceptance.length) {
    errors.push("planningPacket.acceptanceMatrix is required");
  }
  for (const entry of acceptance) {
    if (!normalizeStringArray(entry.weaknessIds).length) {
      errors.push(`acceptance row ${entry.id} must map to at least one weakness`);
    }
    if (!String(entry.criterion ?? "").trim()) {
      errors.push(`acceptance row ${entry.id} requires criterion`);
    }
    if (!normalizeStringArray(entry.verificationCommands).length) {
      errors.push(`acceptance row ${entry.id} requires verificationCommands`);
    }
  }
  const rowWeaknesses = new Set(acceptance.flatMap((entry: any) => normalizeStringArray(entry.weaknessIds)));
  for (const weakness of normalizeStringArray(packet?.weaknesses)) {
    if (!rowWeaknesses.has(weakness)) {
      errors.push(`weakness ${weakness} is not mapped to an acceptance row`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function normalizePlanningPacket(packet: any, ticket: any) {
  const verificationCommands = normalizeStringArray(packet?.verificationCommands);
  const acceptance = normalizeAcceptanceCriteria(packet).map((entry: any, index: number) => ({
    id: String(entry.id ?? `${ticket.id}-AC-${index + 1}`).trim(),
    criterion: String(entry.criterion ?? entry.text ?? "").trim(),
    weaknessIds: normalizeStringArray(entry.weaknessIds ?? entry.weaknesses),
    verificationCommands: normalizeStringArray(entry.verificationCommands).length
      ? normalizeStringArray(entry.verificationCommands)
      : verificationCommands,
    evidenceRefs: normalizeStringArray(entry.evidenceRefs),
    status: entry.status ?? "pending",
    verified: Boolean(entry.verified)
  }));
  return {
    ticketId: ticket.id,
    status: packet?.status ?? "draft",
    verdict: packet?.verdict ?? "pending",
    problemStatement: String(packet?.problemStatement ?? "").trim(),
    sourceEvidence: normalizeStringArray(packet?.sourceEvidence),
    affectedSurfaces: normalizeStringArray(packet?.affectedSurfaces),
    linkedFiles: normalizeStringArray(packet?.linkedFiles),
    linkedPackages: normalizeStringArray(packet?.linkedPackages),
    acceptanceCriteria: acceptance.map((entry: any) => entry.criterion),
    acceptanceMatrix: acceptance,
    verificationCommands,
    nonGoals: normalizeStringArray(packet?.nonGoals),
    riskFallbackPlan: normalizeStringArray(packet?.riskFallbackPlan),
    weaknesses: normalizeStringArray(packet?.weaknesses),
    goeReview: packet?.goeReview ?? {
      suggester: "deterministic packet blueprint generated from reliability plan",
      critic: "validation requires every weakness to map to acceptance rows and verification commands",
      auditor: "closure is blocked until acceptance rows have evidence refs"
    }
  };
}

function derivePacketFromTicket(ticket: any) {
  const weakness = requiresReliabilityPlanning(ticket) ? ["REL-WEAK-TRUTH"] : ["ticket-planning"];
  return {
    problemStatement: String(ticket.data?.summary ?? ticket.title ?? "").trim(),
    sourceEvidence: [ticket.id, ticket.parentId, ticket.data?.epic].filter(Boolean),
    affectedSurfaces: ["workflow state"],
    linkedFiles: normalizeStringArray(ticket.data?.linkedFiles),
    acceptanceCriteria: normalizeStringArray(ticket.data?.acceptanceCriteria).map((criterion: string, index: number) => ({
      id: `${ticket.id}-AC-${index + 1}`,
      criterion,
      weaknessIds: weakness
    })),
    verificationCommands: normalizeStringArray(ticket.data?.verificationCommands),
    nonGoals: ["Unscoped refactors outside this ticket are not part of this plan."],
    riskFallbackPlan: ["Stop mutation and leave the ticket open with explicit blocker evidence."],
    weaknesses: weakness
  };
}

function blueprint(ticketId: string, weaknesses: string[], values: any) {
  const verificationCommands = normalizeStringArray(values.verificationCommands);
  return {
    ticketId,
    status: "draft",
    verdict: "pending",
    linkedPackages: ["aiwf-common-core", "aiwf-shell", "aiwf-mcp"],
    nonGoals: ["Do not close the reliability epic from this slice.", "Do not hide unverified acceptance rows."],
    riskFallbackPlan: ["Stop mutation, keep the ticket active, and report the blocker through sync/matrix output."],
    ...values,
    weaknesses,
    verificationCommands,
    acceptanceMatrix: normalizeAcceptanceCriteria({ acceptanceMatrix: values.acceptanceCriteria }).map((entry: any, index: number) => ({
      id: `${ticketId}-AC-${index + 1}`,
      criterion: entry.criterion,
      weaknessIds: entry.weaknessIds,
      verificationCommands,
      evidenceRefs: [],
      status: "pending",
      verified: false
    })),
    acceptanceCriteria: normalizeAcceptanceCriteria({ acceptanceMatrix: values.acceptanceCriteria }).map((entry: any) => entry.criterion)
  };
}

function row(weaknessId: string, criterion: string) {
  return { criterion, weaknessIds: [weaknessId] };
}

function normalizeAcceptanceCriteria(packet: any) {
  const matrix = Array.isArray(packet?.acceptanceMatrix) ? packet.acceptanceMatrix : packet?.acceptanceCriteria;
  if (!Array.isArray(matrix)) {
    return [];
  }
  return matrix.map((entry: any, index: number) => typeof entry === "string"
    ? { id: `AC-${index + 1}`, criterion: entry, weaknessIds: normalizeStringArray(packet?.weaknesses) }
    : {
        id: entry.id ?? `AC-${index + 1}`,
        criterion: entry.criterion ?? entry.text ?? "",
        weaknessIds: normalizeStringArray(entry.weaknessIds ?? entry.weaknesses),
        verificationCommands: normalizeStringArray(entry.verificationCommands),
        evidenceRefs: normalizeStringArray(entry.evidenceRefs),
        status: entry.status,
        verified: entry.verified
      });
}

function normalizeStringArray(value: any): string[] {
  return Array.from(new Set((Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item ?? "").split(","))
    .map((item) => item.trim())
    .filter(Boolean)));
}
