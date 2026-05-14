import path from "node:path";
import { stableId } from "../lib/hash.ts";

const GRAPH_SOURCE_KIND = "graph-sync";
const GRAPH_SYNC_TOKEN = "graph-sync-v1";
const PROJECT_NODE_ID = "project:root";

const CANONICAL_CAPABILITIES = [
  {
    id: "capability:workflow-db",
    title: "Canonical workflow DB",
    summary: "Owns durable project memory, workflow truth, and controlled state transitions."
  },
  {
    id: "capability:textual-projections",
    title: "Bidirectional textual projections",
    summary: "Keeps kanban, epics, mission, and host guides reconciled with the workflow DB."
  },
  {
    id: "capability:knowledge-graph",
    title: "Knowledge graph retrieval",
    summary: "Connects files, symbols, tickets, codelets, and plans through explicit predicates."
  },
  {
    id: "capability:provider-routing",
    title: "Cheapest-capable provider routing",
    summary: "Routes work by task class, model fit, quota, and local-vs-remote capability."
  },
  {
    id: "capability:governed-execution",
    title: "Governed execution",
    summary: "Applies workflow discipline, verification, and protocol enforcement before mutation."
  },
  {
    id: "capability:ticket-context",
    title: "Ticket context extraction",
    summary: "Builds compact working sets from tickets, files, symbols, and workflow evidence."
  },
  {
    id: "capability:codelet-promotion",
    title: "Codelet promotion",
    summary: "Turns repeated AI-driven workflows into reusable code-bearing automation."
  },
  {
    id: "capability:mcp-hosting",
    title: "MCP host integration",
    summary: "Exposes the shared workflow core to external hosts through an adapter surface."
  }
];

const CANONICAL_INTEGRATIONS = [
  {
    id: "integration:cli-shell",
    title: "CLI and shell surface",
    summary: "Interactive operator surface for workflow queries, planning, and execution."
  },
  {
    id: "integration:ask-host",
    title: "Ask and host surface",
    summary: "Read-oriented host transport for status, readiness, and guidance extraction."
  },
  {
    id: "integration:mcp",
    title: "MCP adapter",
    summary: "Primary coded extension surface for external AI hosts."
  },
  {
    id: "integration:skill-bridge",
    title: "Optional skill bridge",
    summary: "Instruction-only convenience layer that points hosts at the coded MCP and shell surfaces."
  }
];

const PROJECTION_SPECS = [
  { path: "kanban.md", title: "Kanban projection" },
  { path: "epics.md", title: "Epics projection" },
  { path: "MISSION.md", title: "Mission projection" },
  { path: ".gemini/GEMINI.md", title: "Gemini bridge guide" },
  { path: "GEMINI.md", title: "Gemini guide" },
  { path: "CLAUDE.md", title: "Claude guide" }
];

export async function syncKnowledgeGraphEntities(store, { projectRoot = process.cwd() } = {}) {
  store.deleteEntitiesBySourceKind(GRAPH_SOURCE_KIND, [
    "projection",
    "guideline",
    "capability",
    "integration",
    "problem",
    "plan",
    "governance"
  ]);
  store.deleteArchitecturalPredicatesByMetadataToken(GRAPH_SYNC_TOKEN);

  const projectionEntities = buildProjectionEntities(store, projectRoot);
  const guidelineEntities = buildGuidelineEntities(store);
  const capabilityEntities = buildCapabilityEntities();
  const integrationEntities = buildIntegrationEntities();
  const problemEntities = buildProblemEntities(store);
  const planEntities = buildPlanEntities(store);
  const governanceEntities = buildGovernanceEntities(store);

  const allEntities = [
    ...projectionEntities,
    ...guidelineEntities,
    ...capabilityEntities,
    ...integrationEntities,
    ...problemEntities,
    ...planEntities,
    ...governanceEntities
  ];

  for (const entity of allEntities) {
    store.upsertEntity(entity);
  }

  for (const entity of projectionEntities) {
    appendEdge(store, entity.id, "belongs_to", PROJECT_NODE_ID, { relation: "projection-project" });
    appendEdge(store, entity.id, "implemented_by", "capability:textual-projections", { relation: "projection-capability" });
  }

  for (const entity of guidelineEntities) {
    appendEdge(store, entity.id, "belongs_to", PROJECT_NODE_ID, { relation: "guideline-project" });
    if (entity.data?.category === "process") {
      appendEdge(store, entity.id, "governs", "capability:governed-execution", { relation: "guideline-governance" });
    }
    if (entity.data?.sourceFile === "project-guidelines.md") {
      appendEdge(store, entity.id, "governs", "capability:knowledge-graph", { relation: "guideline-graph" });
    }
  }

  for (const entity of capabilityEntities) {
    appendEdge(store, entity.id, "belongs_to", PROJECT_NODE_ID, { relation: "capability-project" });
  }

  for (const entity of integrationEntities) {
    appendEdge(store, entity.id, "belongs_to", PROJECT_NODE_ID, { relation: "integration-project" });
  }

  appendEdge(store, "integration:cli-shell", "consumes", "capability:ticket-context", { relation: "surface-capability" });
  appendEdge(store, "integration:cli-shell", "consumes", "capability:governed-execution", { relation: "surface-capability" });
  appendEdge(store, "integration:ask-host", "consumes", "capability:knowledge-graph", { relation: "surface-capability" });
  appendEdge(store, "integration:mcp", "consumes", "capability:mcp-hosting", { relation: "surface-capability" });
  appendEdge(store, "integration:mcp", "consumes", "capability:knowledge-graph", { relation: "surface-capability" });
  appendEdge(store, "integration:skill-bridge", "consumes", "integration:mcp", { relation: "skill-to-mcp" });

  for (const codelet of store.listEntities({ entityType: "codelet" })) {
    const lower = `${codelet.id} ${codelet.title} ${String(codelet.data?.summary ?? "")}`.toLowerCase();
    for (const capability of CANONICAL_CAPABILITIES) {
      if (matchesCapability(lower, capability.id)) {
        appendEdge(store, capability.id, "implemented_by", codelet.id, { relation: "capability-codelet" });
      }
    }
  }

  for (const entity of problemEntities) {
    appendEdge(store, entity.id, "belongs_to", PROJECT_NODE_ID, { relation: "problem-project" });
    if (entity.data?.ticketId) {
      appendEdge(store, entity.id, "tracked_by", entity.data.ticketId, { relation: "problem-ticket" });
    }
  }

  for (const entity of planEntities) {
    appendEdge(store, entity.id, "belongs_to", PROJECT_NODE_ID, { relation: "plan-project" });
    if (entity.data?.epicId) {
      appendEdge(store, entity.id, "planned_by", entity.data.epicId, { relation: "plan-epic" });
    }
  }

  for (const entity of governanceEntities) {
    appendEdge(store, entity.id, "belongs_to", PROJECT_NODE_ID, { relation: "governance-project" });
    appendEdge(store, entity.id, "governs", "capability:governed-execution", { relation: "governance-capability" });
  }
}

export function buildKnowledgeGraphSnapshot(store, { projectRoot = process.cwd() } = {}) {
  const entities = store.listEntities();
  const files = store.listFiles();
  const symbols = store.listSymbols();
  const claims = store.listClaims();
  const predicates = store.listArchitecturalPredicates();

  const nodes = [
    {
      id: PROJECT_NODE_ID,
      type: "project",
      title: path.basename(projectRoot),
      sourceKind: "derived",
      data: { projectRoot }
    },
    ...entities.map((entity) => ({
      id: entity.id,
      type: entity.entityType,
      title: entity.title,
      sourceKind: entity.sourceKind,
      data: entity.data ?? {}
    })),
    ...files.map((file) => ({
      id: `file:${file.path}`,
      type: "file",
      title: file.path,
      sourceKind: "indexed",
      data: {
        language: file.language,
        fileKind: file.fileKind
      }
    })),
    ...symbols.map((symbol) => ({
      id: `symbol:${symbol.id}`,
      type: "symbol",
      title: `${symbol.name} (${symbol.kind})`,
      sourceKind: symbol.sourceKind,
      data: {
        filePath: symbol.filePath,
        line: symbol.line,
        kind: symbol.kind,
        exported: symbol.exported
      }
    }))
  ];

  const edges = [
    ...predicates.map((edge) => ({
      id: edge.id,
      subjectId: edge.subjectId,
      predicate: edge.predicate,
      objectId: edge.objectId,
      metadata: edge.metadata ?? {},
      source: "architectural-graph"
    })),
    ...claims.map((claim) => ({
      id: claim.id,
      subjectId: claim.subjectId,
      predicate: claim.predicate,
      objectId: claim.objectId ?? (claim.objectText ? `text:${claim.id}` : null),
      metadata: {
        kind: claim.kind,
        confidence: claim.confidence,
        provenance: claim.provenance,
        filePath: claim.filePath ?? null,
        objectText: claim.objectText ?? null
      },
      source: "claims"
    })).filter((edge) => edge.objectId)
  ];

  const entityTypeCounts = countBy(nodes, (node) => node.type);
  const predicateCounts = countBy(edges, (edge) => edge.predicate);

  return {
    projectRoot,
    nodes,
    edges,
    stats: {
      entityCount: entities.length,
      fileNodeCount: files.length,
      symbolNodeCount: symbols.length,
      claimEdgeCount: claims.length,
      predicateCount: predicates.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      entityTypeCounts,
      predicateCounts
    },
    semantika: buildSemantikaProjection({ projectRoot, nodes, edges })
  };
}

export function buildSemantikaProjection({ projectRoot, nodes, edges }) {
  return {
    packageName: "@dharmax/semantika",
    status: "adapter-ready",
    recommendedAsCanonicalStore: false,
    rationale: "Semantika is graph-first, but ai-workflow keeps SQLite and the core facade as the canonical mutable truth. Exporting a semantika-shaped projection preserves core DB control while allowing richer host-side graph work.",
    export: {
      projectRoot,
      concepts: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        label: node.title,
        properties: node.data ?? {}
      })),
      relations: edges.map((edge) => ({
        id: edge.id,
        from: edge.subjectId,
        predicate: edge.predicate,
        to: edge.objectId,
        properties: edge.metadata ?? {}
      }))
    }
  };
}

function buildProjectionEntities(store, projectRoot) {
  const entities = [];
  for (const spec of PROJECTION_SPECS) {
    const normalized = spec.path;
      const hasContent = normalized === "MISSION.md"
        ? Boolean(store.getMeta("mission"))
        : normalized === ".gemini/GEMINI.md" || normalized === "GEMINI.md" || normalized === "CLAUDE.md"
          ? Boolean(store.getMeta("gemini"))
          : Boolean(store.getFile(normalized));
    if (!hasContent) {
      continue;
    }
    entities.push({
      id: `projection:${normalized}`,
      entityType: "projection",
      title: spec.title,
      state: "active",
      confidence: 1,
      provenance: "graph-sync",
      sourceKind: GRAPH_SOURCE_KIND,
      reviewState: "active",
      data: {
        filePath: normalized,
        absolutePath: path.resolve(projectRoot, normalized)
      }
    });
  }
  return entities;
}

function buildGuidelineEntities(store) {
  return store.listGuidelineBlocks().map((block) => ({
    id: `guideline:${block.id}`,
    entityType: "guideline",
    title: block.title,
    state: "active",
    confidence: 1,
    provenance: "graph-sync",
    sourceKind: GRAPH_SOURCE_KIND,
    reviewState: "active",
    data: {
      blockId: block.id,
      sourceFile: block.sourceFile,
      category: block.category,
      tags: block.tags,
      checksum: block.checksum
    }
  }));
}

function buildCapabilityEntities() {
  return CANONICAL_CAPABILITIES.map((capability) => ({
    id: capability.id,
    entityType: "capability",
    title: capability.title,
    state: "active",
    confidence: 1,
    provenance: "graph-sync",
    sourceKind: GRAPH_SOURCE_KIND,
    reviewState: "active",
    data: {
      summary: capability.summary
    }
  }));
}

function buildIntegrationEntities() {
  return CANONICAL_INTEGRATIONS.map((integration) => ({
    id: integration.id,
    entityType: "integration",
    title: integration.title,
    state: "active",
    confidence: 1,
    provenance: "graph-sync",
    sourceKind: GRAPH_SOURCE_KIND,
    reviewState: "active",
    data: {
      summary: integration.summary
    }
  }));
}

function buildProblemEntities(store) {
  const ticketProblems = store.listEntities({ entityType: "ticket" })
    .filter((ticket) => ticket.state !== "archived")
    .map((ticket) => ({
      id: `problem:ticket:${ticket.id}`,
      entityType: "problem",
      title: ticket.title,
      state: ticket.state ?? "open",
      confidence: 1,
      provenance: "graph-sync",
      sourceKind: GRAPH_SOURCE_KIND,
      reviewState: "active",
      data: {
        ticketId: ticket.id,
        lane: ticket.lane ?? null,
        summary: ticket.data?.summary ?? ""
      }
    }));

  const workflowProblems = store.listWorkflowIssues({ status: "open" }).map((issue) => ({
    id: `problem:issue:${issue.id}`,
    entityType: "problem",
    title: issue.summary,
    state: "open",
    confidence: 1,
    provenance: "graph-sync",
    sourceKind: GRAPH_SOURCE_KIND,
    reviewState: "active",
    data: {
      issueId: issue.id,
      issueType: issue.issueType,
      severity: issue.severity
    }
  }));

  return [...ticketProblems, ...workflowProblems];
}

function buildPlanEntities(store) {
  return store.listEntities({ entityType: "epic" })
    .filter((epic) => epic.state !== "archived")
    .map((epic) => ({
      id: `plan:epic:${epic.id}`,
      entityType: "plan",
      title: epic.title,
      state: epic.state ?? "open",
      confidence: 1,
      provenance: "graph-sync",
      sourceKind: GRAPH_SOURCE_KIND,
      reviewState: "active",
      data: {
        epicId: epic.id,
        summary: epic.data?.summary ?? "",
        userStories: epic.data?.userStories ?? epic.data?.stories ?? [],
        ticketBatches: epic.data?.ticketBatches ?? epic.data?.batches ?? []
      }
    }));
}

function buildGovernanceEntities(store) {
  return store.listGuidelineBlocks()
    .filter((block) =>
      block.sourceFile === "enforcement.md"
      || block.sourceFile === "execution-protocol.md"
      || block.sourceFile === "project-guidelines.md"
    )
    .slice(0, 24)
    .map((block) => ({
      id: `governance:${block.id}`,
      entityType: "governance",
      title: block.title,
      state: "active",
      confidence: 1,
      provenance: "graph-sync",
      sourceKind: GRAPH_SOURCE_KIND,
      reviewState: "active",
      data: {
        sourceFile: block.sourceFile,
        category: block.category,
        checksum: block.checksum
      }
    }));
}

function appendEdge(store, subjectId, predicate, objectId, metadata = {}) {
  store.appendArchitecturalPredicate({
    subjectId,
    predicate,
    objectId,
    metadata: {
      ...metadata,
      source: GRAPH_SYNC_TOKEN
    }
  });
}

function matchesCapability(text, capabilityId) {
  const normalizedCapability = capabilityId.toLowerCase();
  if (normalizedCapability.includes("ticket-context")) {
    return /\b(ticket|context|extract|working set)\b/.test(text);
  }
  if (normalizedCapability.includes("provider-routing")) {
    return /\b(route|routing|provider|model)\b/.test(text);
  }
  if (normalizedCapability.includes("textual-projections")) {
    return /\b(projection|kanban|epic|mission|gemini)\b/.test(text);
  }
  if (normalizedCapability.includes("knowledge-graph")) {
    return /\b(graph|search|status|symbol|dependency)\b/.test(text);
  }
  if (normalizedCapability.includes("governed-execution")) {
    return /\b(execute|audit|dogfood|verify|govern)\b/.test(text);
  }
  if (normalizedCapability.includes("codelet-promotion")) {
    return /\b(codelet|promot|tool)\b/.test(text);
  }
  if (normalizedCapability.includes("mcp-hosting")) {
    return /\b(host|mcp|adapter|plugin)\b/.test(text);
  }
  return /\b(db|workflow|store)\b/.test(text);
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = String(keyFn(item) ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
