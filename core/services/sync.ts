/**
 * @file sync.js
 * @brief Auto-generated header for sync.js. Needs detailed responsibility and scope.
 */

import path from "node:path";
import { openWorkflowStore } from "../db/sqlite-store.ts";
import { collectProjectFileSnapshot, readProjectFile } from "../lib/filesystem.ts";
import { sha1, stableId } from "../lib/hash.ts";
import { parseIndexedFile } from "@dharmax/codebase-parser";
import { deriveCandidateFromNote, reviewCandidates } from "./lifecycle.ts";
import { buildProjectSummary, buildSmartProjectStatus, compareEpicPriority, createSearchDocumentsForEntities, deriveEpicState, extractTicketCompletionDate, importLegacyProjections, inferTicketLane, sanitizeProjectionTicketTitle, writeProjectProjections } from "./projections.ts";
import { auditArchitecture } from "./critic.ts";
import { SEMANTICS } from "../lib/registry.ts";
import { evaluateReadiness } from "./readiness-evaluator.ts";
import { runAssessment } from "./assessment.ts";
import { syncGuidelineBlocks } from "./guidelines.ts";
import { refreshCodeletRegistry, listCodeletsFromStore, getCodeletFromStore, searchCodeletsFromStore, listProjectCodelets } from "./codelets.ts";
import { withWorkspaceMutationGuardDisabled } from "../lib/workspace-mutation.ts";
import { readStatusEvidenceFingerprint, syncStatusGraph } from "./status.ts";

const AUTO_ASSESSMENT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const AUTO_ASSESSMENT_STALE_MS = 20 * 60 * 1000;
const ACTIVE_ASSESSMENT_STATUSES = new Set(["pending", "planned", "criticized", "executing"]);

export async function syncProject({ projectRoot = process.cwd(), writeProjections = false } = {}) {
  const startedAt: string = new Date().toISOString();

  return withWorkspaceMutationGuardDisabled(async () => {
    // LAY-003: Dynamic Artifact Detection
    const dynamicIgnores = await detectBuildArtifacts(projectRoot);
    const store = await openWorkflowStore({ projectRoot });

    try {
      const snapshot = await collectProjectFileSnapshot(projectRoot, { ignore: dynamicIgnores });
      const fingerprint = await computeProjectFingerprint({ projectRoot, store, snapshot });
      const lastSync = store.getMeta("lastSyncFingerprint", null);
      const integrityRepair = repairWorkflowEntityIntegrity(store);
    const files = snapshot.map((entry) => entry.relativePath);

		    if (lastSync?.fingerprint === fingerprint && !integrityRepair.changed) {
		      const summary = buildProjectSummary(store);
		      const projections = writeProjections
		        ? await writeProjectProjections(store, { projectRoot })
		        : null;
	      if (projections) {
	        const projectionSnapshot = await collectProjectFileSnapshot(projectRoot, { ignore: dynamicIgnores });
	        recordProjectionMutation(store, projectRoot, projections, projectionSnapshot);
	      }
		      return {
		        projectRoot,
		        dbPath: store.dbPath,
	        indexedFiles: summary.fileCount ?? 0,
	        indexedSymbols: summary.symbolCount ?? 0,
	        indexedClaims: summary.claimCount ?? 0,
	        indexedNotes: summary.noteCount ?? 0,
	        codeletRegistry: {
	          codeletsIndexed: summary.codeletCount ?? 0
	        },
        importSummary: {
          importedTickets: 0
        },
        lifecycle: {
          reviewed: [],
          skipped: true
        },
	        projections,
	        summary,
	        skipped: true,
	        reason: "project state unchanged",
	        indexedDelta: {
	          files: 0,
	          symbols: 0,
	          claims: 0,
	          notes: 0
	        }
	      };
	    }

    if (integrityRepair.changed) {
      createSearchDocumentsForEntities(store);
    }

    store.pruneIndexedFiles(files);
    let symbolCount = 0;
    let claimCount = 0;
    let noteCount = 0;

    for (const relativePath of files) {
      const file = await readProjectFile(projectRoot, relativePath);
      if (file.isBinary) {
        continue;
      }
      const parsed = parseIndexedFile({ filePath: relativePath, content: file.content });
      const filteredNotes = filterIndexedNotes(relativePath, parsed.notes);
      const notes = filteredNotes.map((note) => ({
        ...note,
        ...deriveCandidateScores(note, relativePath)
      }));
      parsed.notes = notes;
      store.replaceIndexedFile({
        file,
        parsed,
        sha1: sha1(file.content),
        indexedAt: startedAt
      });
      symbolCount += parsed.symbols.length;
      claimCount += parsed.facts.length;
      noteCount += parsed.notes.length;
    }

    const importSummary = await importLegacyProjections(store, { projectRoot });
    const postImportIntegrityRepair = repairWorkflowEntityIntegrity(store);
    
    // Architectural Mapping (Heuristic Phase 1)
    await syncArchitecture(projectRoot, store);
    await reconcileEpicStates(store);

    store.cleanupDerivedState();
    for (const note of store.listNotes()) {
      const candidate = deriveCandidateFromNote(note);
      if (candidate.status === "ignored") {
        continue;
      }
      store.upsertCandidate(candidate);
    }

    const lifecycle = reviewCandidates(store);
    const codeletRegistry = await refreshCodeletRegistry(store, { projectRoot });

    // Trigger Automatic Assessment if project is messy
    const projectStatus = buildSmartProjectStatus(store);
    if (!process.env.AI_WORKFLOW_SKIP_AUTO_ASSESSMENT && (projectStatus.includes("FAILURE") || projectStatus.includes("Medium issues"))) {
      await maybeRunAutoAssessment(store, { projectRoot, scope: "health" });
    }

    await syncStatusGraph({ projectRoot, store });
    await syncGuidelineBlocks(store, { projectRoot });
    createSearchDocumentsForEntities(store);

    // RAG-003: Shadow Sync
    await performShadowSync(store, projectRoot);

	    let projections = null;
	    if (writeProjections) {
	      projections = await writeProjectProjections(store, { projectRoot, reconcileLegacy: false });
	      const projectionSnapshot = await collectProjectFileSnapshot(projectRoot, { ignore: dynamicIgnores });
	      recordProjectionMutation(store, projectRoot, projections, projectionSnapshot);
	    }

    const finalFingerprint = await computeProjectFingerprint({ projectRoot, store, snapshot });

    store.setMeta("lastSync", {
      startedAt,
      fileCount: files.length,
      symbolCount,
      claimCount,
      noteCount,
      codeletCount: codeletRegistry.codeletsIndexed
    });
    store.setMeta("lastSyncFingerprint", {
      startedAt,
      fingerprint: finalFingerprint,
      fileCount: files.length
    });

    const summary = buildProjectSummary(store);
    return {
      projectRoot,
      dbPath: store.dbPath,
      indexedFiles: files.length,
      indexedSymbols: symbolCount,
      indexedClaims: claimCount,
      indexedNotes: noteCount,
      codeletRegistry,
      importSummary,
      lifecycle,
      projections,
      summary,
      integrityRepair: {
        promotedEpics: integrityRepair.promotedEpics + postImportIntegrityRepair.promotedEpics,
        removedPlaceholderEpics: integrityRepair.removedPlaceholderEpics + postImportIntegrityRepair.removedPlaceholderEpics,
        sanitizedTicketTitles: integrityRepair.sanitizedTicketTitles + postImportIntegrityRepair.sanitizedTicketTitles,
        archivedOpaqueSyntheticTickets: integrityRepair.archivedOpaqueSyntheticTickets + postImportIntegrityRepair.archivedOpaqueSyntheticTickets
      }
    };
    } finally {
      store.close();
    }
  });
	}

async function maybeRunAutoAssessment(store, { projectRoot, scope = "health" } = {}) {
  const targetId = path.basename(projectRoot);
  const assessments = store.listAssessments({ targetType: "project", targetId }).filter((item) => item.scope === scope);
  const now = Date.now();

  for (const assessment of assessments) {
    if (!ACTIVE_ASSESSMENT_STATUSES.has(assessment.status)) {
      continue;
    }
    const updatedAtMs = Date.parse(assessment.updatedAt ?? assessment.createdAt ?? 0);
    if (!Number.isFinite(updatedAtMs) || now - updatedAtMs < AUTO_ASSESSMENT_STALE_MS) {
      continue;
    }
    store.upsertAssessment({
      ...assessment,
      status: "failed",
      result: {
        error: "Auto-assessment abandoned before completion.",
        stale: true
      }
    });
  }

  const latest = store.listAssessments({ targetType: "project", targetId }).find((item) => item.scope === scope) ?? null;
  if (latest) {
    const updatedAtMs = Date.parse(latest.updatedAt ?? latest.createdAt ?? 0);
    const staleFailure = latest.status === "failed" && latest.result?.stale === true;
    if (!staleFailure && Number.isFinite(updatedAtMs) && now - updatedAtMs < AUTO_ASSESSMENT_COOLDOWN_MS) {
      return latest;
    }
  }

  try {
    return await runAssessment(
      { type: "project", id: targetId },
      { root: projectRoot, scope }
    );
  } catch (error) {
    console.error(`[sync] Auto-assessment failed: ${error.message}`);
    return null;
  }
}

function recordProjectionMutation(store, projectRoot, projections, snapshot = []) {
  store.appendWorkspaceMutation({
    root: projectRoot,
    operation: "sync projections",
    status: "completed",
    beforeDirty: false,
    afterDirty: false,
    changedFiles: [
      path.relative(projectRoot, projections.kanbanPath),
      path.relative(projectRoot, projections.epicsPath)
    ],
    details: {
      source: "syncProject",
      writtenAt: projections.writtenAt,
      snapshot
    },
    startedAt: projections.writtenAt,
    completedAt: projections.writtenAt
  });
}

async function computeProjectFingerprint({ projectRoot, store, snapshot }) {
  const [derivedState, projectCodelets, statusEvidence] = await Promise.all([
    readDerivedProjectionState(projectRoot, store),
    listProjectCodelets(projectRoot).catch(() => []),
    readStatusEvidenceFingerprint(projectRoot)
  ]);
  const fingerprintEntries = snapshot.filter((entry) => !isDerivedProjectionSnapshot(entry.relativePath, derivedState));
  const codeletEntries = projectCodelets
    .map((codelet) => ({
      id: codelet.id,
      summary: codelet.summary ?? "",
      stability: codelet.stability ?? "",
      status: codelet.status ?? "",
      entry: codelet.entry ?? "",
      manifestPath: codelet.manifestPath ?? "",
      sourceKind: codelet.sourceKind ?? "project"
    }))
    .sort((left, right) => String(left.manifestPath).localeCompare(String(right.manifestPath)) || String(left.id).localeCompare(String(right.id)));
  return sha1(JSON.stringify({ snapshot: fingerprintEntries, codelets: codeletEntries, statusEvidence }));
}

async function readDerivedProjectionState(projectRoot, store) {
  const [kanbanMd, epicsMd, missionMd, geminiMd, rootGeminiMd] = await Promise.all([
    readProjectFileOptional(projectRoot, "kanban.md"),
    readProjectFileOptional(projectRoot, "epics.md"),
    readProjectFileOptional(projectRoot, "MISSION.md"),
    readProjectFileOptional(projectRoot, ".gemini/GEMINI.md"),
    readProjectFileOptional(projectRoot, "GEMINI.md")
  ]);

  const lastProjectionDigest = store.getMeta("lastProjectionDigest", null);
  const missionText = String(store.getMeta("mission") ?? "");
  const geminiText = String(store.getMeta("gemini") ?? "");

  return {
    kanbanHash: kanbanMd ? sha1(kanbanMd.content) : null,
    epicsHash: epicsMd ? sha1(epicsMd.content) : null,
    missionHash: missionMd ? sha1(missionMd.content) : null,
    geminiHash: geminiMd ? sha1(geminiMd.content) : (rootGeminiMd ? sha1(rootGeminiMd.content) : null),
    lastProjectionDigest,
    missionDigest: missionText ? sha1(missionText) : null,
    geminiDigest: geminiText ? sha1(geminiText) : null
  };
}

function isDerivedProjectionSnapshot(relativePath, derivedState) {
  const normalized = String(relativePath ?? "").replace(/\\/g, "/");
  if (normalized === "kanban.md") {
    return Boolean(derivedState.lastProjectionDigest?.kanban && derivedState.kanbanHash === derivedState.lastProjectionDigest.kanban);
  }
  if (normalized === "epics.md") {
    return Boolean(derivedState.lastProjectionDigest?.epics && derivedState.epicsHash === derivedState.lastProjectionDigest.epics);
  }
  if (normalized === "MISSION.md") {
    return Boolean(derivedState.missionDigest && derivedState.missionHash === derivedState.missionDigest);
  }
  if (normalized === ".gemini/GEMINI.md" || normalized === "GEMINI.md") {
    return Boolean(derivedState.geminiDigest && derivedState.geminiHash === derivedState.geminiDigest);
  }
  return false;
}

async function readProjectFileOptional(projectRoot, relativePath) {
  try {
    return await readProjectFile(projectRoot, relativePath);
  } catch {
    return null;
  }
}

async function reconcileEpicStates(store) {
  const tickets = store.listEntities({ entityType: "ticket" });
  let updated = 0;

  for (const epic of store.listEntities({ entityType: "epic" })) {
    const linkedTickets = tickets.filter((ticket) => ticket.parentId === epic.id || ticket.data?.epic === epic.id)
      .map((ticket) => ({
        state: ticket.state,
        lane: ticket.lane
      }));
    const nextState = deriveEpicState(epic, linkedTickets);

    if (nextState === epic.state) {
      continue;
    }

    store.upsertEntity({
      ...epic,
      state: nextState
    });
    updated += 1;
  }

  return updated;
}

const EPIC_ID_PATTERN = /^(?:EPIC|EPC)-[A-Z0-9-]+$/i;
const PLACEHOLDER_ENTITY_IDS = new Set(["true", "false", "null", "undefined"]);
const OPAQUE_SYNTHETIC_TICKET_ID_PATTERN = /^[a-f0-9]{40}$/i;

function repairWorkflowEntityIntegrity(store) {
  const tickets = store.listEntities({ entityType: "ticket" });
  const epics = store.listEntities({ entityType: "epic" });
  const promotedTicketIds = new Set();
  let promotedEpics = 0;
  let removedPlaceholderEpics = 0;
  let sanitizedTicketTitles = 0;
  let archivedOpaqueSyntheticTickets = 0;

  for (const ticket of tickets) {
    const cleanedTitle = sanitizeProjectionTicketTitle(ticket.title);
    const extractedCompletedAt = extractTicketCompletionDate(ticket.title);
    const nextData = {
      ...(ticket.data ?? {}),
      ...(extractedCompletedAt && !ticket.data?.completedAt ? { completedAt: extractedCompletedAt } : {})
    };
    const normalizedTicket = {
      ...ticket,
      title: cleanedTitle,
      data: nextData
    };

    if (cleanedTitle !== ticket.title || (extractedCompletedAt && ticket.data?.completedAt !== extractedCompletedAt)) {
      store.upsertEntity(normalizedTicket);
      sanitizedTicketTitles += 1;
    }

    if (shouldArchiveLowSignalSyntheticTicket(normalizedTicket, tickets) || shouldArchiveMalformedSyntheticTicket(normalizedTicket, tickets)) {
      const archivedReason = shouldArchiveMalformedSyntheticTicket(normalizedTicket, tickets)
        ? "malformed synthetic ticket with no supporting workflow context"
        : "opaque synthetic ticket with no supporting workflow context";
      store.upsertEntity({
        ...normalizedTicket,
        lane: "Archived",
        state: "archived",
        provenance: "integrity-repair",
        data: {
          ...nextData,
          previousLane: normalizedTicket.lane ?? "Todo",
          archivedReason
        }
      });
      archivedOpaqueSyntheticTickets += 1;
      continue;
    }

    if (!shouldPromoteTicketToEpic(normalizedTicket, tickets)) {
      continue;
    }

    const placeholderSource = epics.find((epic) =>
      epic.id === normalizedTicket.parentId
      || epic.id === normalizedTicket.data?.epic
      || epic.id === normalizedTicket.data?.parent
    ) ?? null;
    const linkedTickets = tickets.filter((candidate) =>
      candidate.id !== normalizedTicket.id
      && (candidate.parentId === normalizedTicket.id || candidate.data?.epic === normalizedTicket.id)
    );

    store.upsertEntity({
      id: normalizedTicket.id,
      entityType: "epic",
      title: normalizedTicket.title,
      lane: null,
      state: deriveEpicState({ state: "open" }, linkedTickets),
      confidence: normalizedTicket.confidence ?? 1,
      provenance: "integrity-repair",
      sourceKind: normalizedTicket.sourceKind ?? "manual",
      reviewState: normalizedTicket.reviewState ?? "active",
      createdAt: normalizedTicket.createdAt,
      updatedAt: normalizedTicket.updatedAt,
      parentId: null,
      relevantUntil: normalizedTicket.relevantUntil ?? null,
      consultationQuestion: normalizedTicket.consultationQuestion ?? null,
      data: {
        summary: firstNonEmptyString(normalizedTicket.data?.summary, placeholderSource?.data?.summary, ""),
        userStories: normalizeStringList(placeholderSource?.data?.userStories ?? placeholderSource?.data?.stories),
        ticketBatches: normalizeStringList(placeholderSource?.data?.ticketBatches ?? placeholderSource?.data?.batches),
        graphNotes: normalizeStringList(placeholderSource?.data?.graphNotes)
      }
    });
    promotedTicketIds.add(normalizedTicket.id);
    promotedEpics += 1;
  }

  for (const epic of epics) {
    if (!shouldDeletePlaceholderEpic(epic, tickets, promotedTicketIds)) {
      continue;
    }
    store.deleteEntity(epic.id);
    removedPlaceholderEpics += 1;
  }

  return {
    changed: promotedEpics > 0 || removedPlaceholderEpics > 0 || sanitizedTicketTitles > 0 || archivedOpaqueSyntheticTickets > 0,
    promotedEpics,
    removedPlaceholderEpics,
    sanitizedTicketTitles,
    archivedOpaqueSyntheticTickets
  };
}

function shouldPromoteTicketToEpic(ticket, tickets) {
  if (!looksLikeEpicId(ticket?.id)) {
    return false;
  }
  const linkedChildren = tickets.some((candidate) =>
    candidate.id !== ticket.id
    && (candidate.parentId === ticket.id || candidate.data?.epic === ticket.id)
  );
  if (linkedChildren) {
    return true;
  }
  return [ticket.parentId, ticket.data?.epic, ticket.data?.parent].some(isPlaceholderEntityId);
}

function shouldDeletePlaceholderEpic(epic, tickets, promotedTicketIds) {
  if (!isPlaceholderEntityId(epic?.id)) {
    return false;
  }

  const referencedByUnpromotedTicket = tickets.some((ticket) =>
    !promotedTicketIds.has(ticket.id)
    && (ticket.parentId === epic.id || ticket.data?.epic === epic.id || ticket.data?.parent === epic.id)
  );
  if (referencedByUnpromotedTicket) {
    return false;
  }

  const referencedByPromotedTicket = tickets.some((ticket) =>
    promotedTicketIds.has(ticket.id)
    && (ticket.parentId === epic.id || ticket.data?.epic === epic.id || ticket.data?.parent === epic.id)
  );
  const hasMeaningfulData = Boolean(String(epic.title ?? "").trim() && String(epic.title ?? "").trim() !== String(epic.id ?? "").trim())
    || firstNonEmptyString(epic.data?.summary, "") !== ""
    || normalizeStringList(epic.data?.userStories ?? epic.data?.stories).length > 0
    || normalizeStringList(epic.data?.ticketBatches ?? epic.data?.batches).length > 0;

  return referencedByPromotedTicket || !hasMeaningfulData;
}

function shouldArchiveLowSignalSyntheticTicket(ticket, tickets) {
  if (!OPAQUE_SYNTHETIC_TICKET_ID_PATTERN.test(String(ticket?.id ?? "").trim())) {
    return false;
  }
  if (String(ticket?.state ?? "").trim().toLowerCase() !== "open") {
    return false;
  }
  const lane = String(ticket?.lane ?? "").trim().toLowerCase();
  if (!["todo", "to-do", "todoo"].includes(lane)) {
    return false;
  }
  if (String(ticket?.sourceKind ?? "").trim() !== "manual" || String(ticket?.provenance ?? "").trim() !== "manual") {
    return false;
  }
  if (String(ticket?.data?.summary ?? "").trim() || String(ticket?.data?.userStory ?? "").trim()) {
    return false;
  }
  if (ticket?.parentId || ticket?.data?.epic || ticket?.data?.parent) {
    return false;
  }
  if (!/\b(?:Feature|Epic)\b/.test(String(ticket?.title ?? ""))) {
    return false;
  }
  return !tickets.some((candidate) =>
    candidate.id !== ticket.id
    && (candidate.parentId === ticket.id || candidate.data?.epic === ticket.id || candidate.data?.parent === ticket.id)
  );
}

function shouldArchiveMalformedSyntheticTicket(ticket, tickets) {
  const title = String(ticket?.title ?? "").trim();
  if (title !== "[object Object]") {
    return false;
  }
  if (String(ticket?.state ?? "").trim().toLowerCase() !== "open") {
    return false;
  }
  const lane = String(ticket?.lane ?? "").trim().toLowerCase();
  if (!["todo", "to-do", "todoo"].includes(lane)) {
    return false;
  }
  if (ticket?.parentId || ticket?.data?.epic || ticket?.data?.parent) {
    return false;
  }
  const id = String(ticket?.id ?? "").trim();
  if (!/^TKT-AUTO-OBJECT-OBJECT-/i.test(id) && String(ticket?.provenance ?? "").trim() !== "manual") {
    return false;
  }
  return !tickets.some((candidate) =>
    candidate.id !== ticket.id
    && (candidate.parentId === ticket.id || candidate.data?.epic === ticket.id || candidate.data?.parent === ticket.id)
  );
}

function looksLikeEpicId(value) {
  return EPIC_ID_PATTERN.test(String(value ?? "").trim());
}

function isPlaceholderEntityId(value) {
  return PLACEHOLDER_ENTITY_IDS.has(String(value ?? "").trim().toLowerCase());
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function filterIndexedNotes(relativePath, notes = []) {
  if (!shouldSuppressIndexedNotes(relativePath)) {
    return notes;
  }
  return [];
}

function shouldSuppressIndexedNotes(relativePath) {
  const normalized = String(relativePath ?? "").replace(/\\/g, "/").toLowerCase();
  return normalized === "kanban.md"
    || normalized === "epics.md"
    || normalized === "docs/kanban.md"
    || normalized === "docs/epics.md"
    || normalized.endsWith("/kanban.md")
    || normalized.endsWith("/epics.md")
    || normalized === "progress.md"
    || normalized.endsWith("/progress.md");
}

async function detectBuildArtifacts(root) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root).catch(() => []);
  const suspects = ["dist", "build", "target", "out", ".next", ".turbo"];
  return entries.filter(e => suspects.includes(e));
}

async function performShadowSync(store, root) {
  const tickets = store.listEntities({ entityType: "ticket", states: ["open"] });
  const claims = store.db.prepare("SELECT * FROM claims WHERE lifecycle_state = 'active'").all();
  
  for (const ticket of tickets) {
    const ticketId = ticket.id.toLowerCase();
    const titlePhrase = ticket.title.toLowerCase().replace(/\s+/g, " ").trim();

    // Only mutate workflow state when we have strong evidence:
    // an explicit ticket-id mention, or repeated exact-title mentions for long titles.
    const idMatches = claims.filter((claim) => (claim.object_text ?? "").toLowerCase().includes(ticketId));
    const titleMatches = titlePhrase.length >= 24
      ? claims.filter((claim) => (claim.object_text ?? "").toLowerCase().includes(titlePhrase))
      : [];

    if ((idMatches.length >= 1 || titleMatches.length >= 2) && ticket.lane === "Todo") {
      store.upsertEntity({ ...ticket, lane: "In Progress", provenance: "shadow-sync-inference" });
    }
  }
}

export async function withWorkflowStore(projectRoot, callback) {
  const store = await openWorkflowStore({ projectRoot });
  try {
    return await callback(store);
  } finally {
    store.close();
  }
}

export async function getActiveTickets({ projectRoot = process.cwd() } = {}) {
  return withWorkflowStore(projectRoot, async (store) => {
    return store.listEntities({ entityType: "ticket" })
      .filter((ticket) => !["Done", "Archived"].includes(ticket.lane ?? ""))
      .sort(compareEpicPriority);
  });
}

export async function getProjectSummary({ projectRoot = process.cwd() } = {}) {
  return withWorkflowStore(projectRoot, async (store) => buildProjectSummary(store));
}

export async function getSmartProjectStatus({ projectRoot = process.cwd() } = {}) {
  const auditFindings = await auditArchitecture(projectRoot);
  return withWorkflowStore(projectRoot, async (store) => buildSmartProjectStatus(store, { auditFindings }));
}

export async function getProjectMetrics({ projectRoot = process.cwd() } = {}) {
  return withWorkflowStore(projectRoot, async (store) => store.getMetricsSummary());
}

export async function evaluateProjectReadiness({ projectRoot = process.cwd(), request } = {}) {
  return withWorkflowStore(projectRoot, async (store) => evaluateReadiness(store, request));
}

export async function recordMetric({ projectRoot = process.cwd(), metric }) {
  return withWorkflowStore(projectRoot, async (store) => store.appendMetric(metric));
}

export async function searchProject({ projectRoot = process.cwd(), query, limit = 20 } = {}) {
  return withWorkflowStore(projectRoot, async (store) => store.search(query, { limit }));
}

export async function listCodelets({ projectRoot = process.cwd(), sourceKind = null } = {}) {
  return withWorkflowStore(projectRoot, async (store) => listCodeletsFromStore(store, { sourceKind }));
}

export async function getCodelet({ projectRoot = process.cwd(), codeletId } = {}) {
  if (!codeletId) {
    return null;
  }

  return withWorkflowStore(projectRoot, async (store) => getCodeletFromStore(store, codeletId));
}

export async function searchCodelets({ projectRoot = process.cwd(), query, limit = 20, sourceKind = null } = {}) {
  return withWorkflowStore(projectRoot, async (store) => searchCodeletsFromStore(store, query, { limit, sourceKind }));
}

export async function listEpics({ projectRoot = process.cwd(), includeArchived = false } = {}) {
  return withWorkflowStore(projectRoot, async (store) => {
    const epics = store.listEntities({ entityType: "epic" })
      .filter((epic) => includeArchived || epic.state !== "archived")
      .sort(compareEpicPriority)
      .map((epic) => buildEpicSummary(store, epic));
    return epics;
  });
}

export async function getEpic({ projectRoot = process.cwd(), epicId } = {}) {
  if (!epicId) {
    return null;
  }

  return withWorkflowStore(projectRoot, async (store) => {
    const epic = store.getEntity(epicId);
    return epic?.entityType === "epic" ? buildEpicDetail(store, epic) : null;
  });
}

export async function searchEpics({ projectRoot = process.cwd(), query, limit = 20 } = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  return withWorkflowStore(projectRoot, async (store) => {
    const epics = store.listEntities({ entityType: "epic" })
      .filter((epic) => epic.state !== "archived")
      .map((epic) => buildEpicDetail(store, epic))
      .map((epic) => ({
        ...epic,
        score: scoreEpicMatch(epic, normalizedQuery)
      }))
      .filter((epic) => epic.score > 0)
      .sort((left, right) => right.score - left.score || compareEpicPriority(left, right) || String(left.id).localeCompare(String(right.id)))
      .slice(0, limit);

    return epics;
  });
}

export async function listEpicUserStories({ projectRoot = process.cwd(), epicId, includeArchived = false } = {}) {
  return withWorkflowStore(projectRoot, async (store) => {
    const epic = epicId ? store.getEntity(epicId) : null;
    if (epicId && (!epic || epic.entityType !== "epic")) {
      return [];
    }

    const epics = epic
      ? [epic]
      : store.listEntities({ entityType: "epic" }).filter((entry) => includeArchived || entry.state !== "archived").sort(compareEpicPriority);

    return epics.flatMap((entry) => buildEpicStories(store, entry));
  });
}

export async function searchEpicUserStories({ projectRoot = process.cwd(), query, epicId = null, limit = 20 } = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  return withWorkflowStore(projectRoot, async (store) => {
    const epics = epicId
      ? [store.getEntity(epicId)].filter(Boolean)
      : store.listEntities({ entityType: "epic" }).filter((entry) => entry.state !== "archived");

    return epics
      .sort(compareEpicPriority)
      .flatMap((entry) => buildEpicStories(store, entry))
      .map((story) => ({
        ...story,
        score: scoreStoryMatch(story, normalizedQuery)
      }))
      .filter((story) => story.score > 0)
      .sort((left, right) => right.score - left.score || String(left.epic.id).localeCompare(String(right.epic.id)) || left.index - right.index)
      .slice(0, limit);
  });
}

export async function createTicket({ projectRoot = process.cwd(), entity }) {
  return withWorkflowStore(projectRoot, async (store) => {
    store.upsertEntity(entity);
    createSearchDocumentsForEntities(store);
    return entity;
  });
}

export async function updateTicketLifecycle({
  projectRoot = process.cwd(),
  ticketId,
  action,
  lane = null
} = {}) {
  const normalizedAction = String(action ?? "").trim().toLowerCase();
  if (!ticketId) {
    throw new Error("ticketId is required");
  }
  if (!["resolve", "reopen", "move"].includes(normalizedAction)) {
    throw new Error(`unsupported ticket lifecycle action: ${action}`);
  }

  return withWorkflowStore(projectRoot, async (store) => {
    const ticket = store.getEntity(ticketId);
    if (!ticket || ticket.entityType !== "ticket") {
      throw new Error(`Ticket ${ticketId} not found.`);
    }

    const timestamp = new Date().toISOString();
    const currentData = { ...(ticket.data ?? {}) };
    const preservedPreviousLane = currentData.previousLane && !["Done", "Archived"].includes(String(currentData.previousLane))
      ? currentData.previousLane
      : null;

    let nextTicket;
    if (normalizedAction === "resolve") {
      const previousLane = !["Done", "Archived"].includes(String(ticket.lane ?? ""))
        ? (ticket.lane ?? inferTicketLane({ id: ticket.id, title: ticket.title }))
        : (preservedPreviousLane ?? inferTicketLane({ id: ticket.id, title: ticket.title }));
      nextTicket = {
        ...ticket,
        lane: "Done",
        state: "archived",
        updatedAt: timestamp,
        data: {
          ...currentData,
          previousLane,
          completedAt: timestamp.slice(0, 10)
        }
      };
    } else if (normalizedAction === "reopen") {
      const reopenedLane = lane
        ? String(lane).trim()
        : (preservedPreviousLane ?? inferTicketLane({ id: ticket.id, title: ticket.title, lane: ticket.lane }));
      const nextData = { ...currentData };
      delete nextData.completedAt;
      nextTicket = {
        ...ticket,
        lane: reopenedLane,
        state: "open",
        updatedAt: timestamp,
        data: nextData
      };
    } else if (normalizedAction === "move") {
      if (!lane) {
        throw new Error("lane is required for move action");
      }
      nextTicket = {
        ...ticket,
        lane: String(lane).trim(),
        updatedAt: timestamp,
        data: {
          ...currentData,
          movedAt: timestamp,
          previousLane: ticket.lane
        }
      };
    }

    store.upsertEntity(nextTicket);
    await reconcileEpicStates(store);
    createSearchDocumentsForEntities(store);
    await writeProjectProjections(store, { projectRoot });
    return store.getEntity(ticketId);
  });
}

export async function addManualNote({ projectRoot = process.cwd(), note }) {
  return withWorkflowStore(projectRoot, async (store) => {
    const candidateScores = deriveCandidateScores(note, note.filePath ?? "manual");
    const materialized = {
      ...note,
      id: note.id ?? stableId("manual-note", note.filePath ?? "manual", note.noteType, note.body),
      sourceKind: "manual",
      provenance: note.provenance ?? "manual"
    };
    store.upsertNote({
      ...materialized,
      ...candidateScores
    });
    const stored = store.listNotes({ filePath: note.filePath }).find((item) => item.id === materialized.id)
      ?? store.listNotes().find((item) => item.id === materialized.id);
    if (stored) {
      const candidate = deriveCandidateFromNote(stored);
      if (candidate.status !== "ignored") {
        store.upsertCandidate(candidate);
      }
    }
    return stored ?? materialized;
  });
}

export async function resolveProjectNote({ projectRoot = process.cwd(), noteId, reason = null }) {
  return withWorkflowStore(projectRoot, async (store) => {
    const existing = store.getNoteById(noteId);
    if (!existing) {
      throw new Error(`Unknown note: ${noteId}`);
    }
    const timestamp = new Date().toISOString();
    const resolved = store.updateNoteStatus(noteId, "resolved", timestamp);
    const relatedCandidate = store.listCandidates().find((candidate) => candidate.noteId === noteId);
    const candidateToArchive = relatedCandidate ?? {
      ...deriveCandidateFromNote({ ...existing, status: "active" }),
      status: "ai-candidate",
      score: 0
    };
    if (candidateToArchive) {
      store.upsertCandidate({
        ...candidateToArchive,
        status: "archived",
        reason: reason
          ? `${candidateToArchive.reason}; note resolved: ${reason}`
          : `${candidateToArchive.reason}; note resolved`,
        updatedAt: timestamp,
        lastReviewAt: timestamp,
        nextReviewAt: null
      });
    }
    store.appendEvent({
      eventType: "note_resolved",
      entityType: "note",
      entityId: noteId,
      payload: {
        reason,
        noteType: existing.noteType,
        body: existing.body
      },
      createdAt: timestamp
    });
    createSearchDocumentsForEntities(store);
    return resolved ?? existing;
  });
}

export async function reviewProjectCandidates({ projectRoot = process.cwd() } = {}) {
  return withWorkflowStore(projectRoot, async (store) => reviewCandidates(store));
}

export async function listProjectAssessments({ projectRoot = process.cwd(), filters = {} } = {}) {
  return withWorkflowStore(projectRoot, async (store) => store.listAssessments(filters));
}

export async function getProjectAssessment({ projectRoot = process.cwd(), assessmentId } = {}) {
  return withWorkflowStore(projectRoot, async (store) => store.getAssessmentById(assessmentId));
}

export async function createProjectAssessment({ projectRoot = process.cwd(), target, options = {} } = {}) {
  return runAssessment(target, { root: projectRoot, ...options });
}

export async function enrichProjectGuidelines({ projectRoot = process.cwd(), options = {} } = {}) {
  const { enrichGuidelineBlocks } = await import("./guidelines.ts");
  return withWorkflowStore(projectRoot, async (store) => enrichGuidelineBlocks(store, { projectRoot, options }));
}

async function syncArchitecture(projectRoot, store) {
  const files = store.db.prepare("SELECT path FROM files").all();
  const modules = new Map();
  const moduleFiles = new Map();

  // Rebuild the heuristic module map from the current indexed snapshot only.
  store.resetArchitecture();

  for (const file of files) {
    const moduleName = inferModuleName(file.path);
    if (!moduleName) continue;

    if (!modules.has(moduleName)) {
      const moduleId = `MOD-${moduleName.toUpperCase().replace(/\//g, "-")}`;
      modules.set(moduleName, moduleId);
    }
    const paths = moduleFiles.get(moduleName) ?? [];
    paths.push(file.path);
    moduleFiles.set(moduleName, paths);

    const moduleId = modules.get(moduleName);
    store.appendArchitecturalPredicate({
      subjectId: file.path,
      predicate: "belongs_to",
      objectId: moduleId
    });
  }

  for (const [moduleName, moduleId] of modules.entries()) {
    store.upsertModule({
      id: moduleId,
      name: moduleName,
      responsibility: inferModuleResponsibility(moduleName, moduleFiles.get(moduleName) ?? [])
    });
  }
}

function buildEpicSummary(store, epic) {
  const detail = buildEpicDetail(store, epic);
  return {
    id: detail.id,
    title: detail.title,
    state: detail.state,
    summary: detail.summary,
    userStoryCount: detail.userStories.length,
    ticketBatchCount: detail.ticketBatches.length,
    linkedTicketCount: detail.linkedTickets.length
  };
}

function buildEpicDetail(store, epic) {
  const linkedTickets = store.listEntities({ entityType: "ticket" })
    .filter((ticket) => ticket.parentId === epic.id || ticket.data?.epic === epic.id)
    .map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      lane: ticket.lane,
      state: ticket.state,
      userStory: ticket.data?.userStory ?? null
    }));

  const userStories = normalizeStoryList(epic.data?.userStories ?? epic.data?.stories ?? []);
  const ticketBatches = normalizeStoryList(epic.data?.ticketBatches ?? epic.data?.batches ?? []);

  return {
    id: epic.id,
    title: epic.title,
    state: epic.state,
    summary: String(epic.data?.summary ?? "").trim(),
    userStories,
    ticketBatches,
    linkedTickets,
    data: epic.data ?? {}
  };
}

function buildEpicStories(store, epic) {
  const detail = buildEpicDetail(store, epic);
  return detail.userStories.map((story, index) => ({
    epic: {
      id: detail.id,
      title: detail.title,
      state: detail.state,
      summary: detail.summary,
      data: epic.data ?? {}
    },
    index: index + 1,
    heading: `Story ${index + 1}`,
    body: story,
    ticketBatch: detail.ticketBatches[index] ?? null
  }));
}

function normalizeStoryList(values = []) {
  return values.map((story) => String(story ?? "").trim()).filter(Boolean);
}

function normalizeSearchQuery(query) {
  return String(query ?? "").trim().toLowerCase();
}

function scoreEpicMatch(epic, query) {
  const haystacks = [
    epic.id,
    epic.title,
    epic.summary,
    epic.userStories.join("\n"),
    epic.ticketBatches.join("\n")
  ].join("\n").toLowerCase();

  if (!haystacks.includes(query)) {
    const tokens = query.split(/\s+/).filter(Boolean);
    if (!tokens.every((token) => haystacks.includes(token))) {
      return 0;
    }
  }

  let score = 10;
  if (epic.id.toLowerCase().includes(query)) score += 40;
  if (epic.title.toLowerCase().includes(query)) score += 30;
  if (epic.summary.toLowerCase().includes(query)) score += 15;
  if (epic.userStories.some((story) => story.toLowerCase().includes(query))) score += 10;
  if (epic.ticketBatches.some((batch) => batch.toLowerCase().includes(query))) score += 5;
  return score;
}

function scoreStoryMatch(story, query) {
  const haystack = [
    story.epic.id,
    story.epic.title,
    story.heading,
    story.body,
    story.ticketBatch ?? ""
  ].join("\n").toLowerCase();

  if (!haystack.includes(query)) {
    const tokens = query.split(/\s+/).filter(Boolean);
    if (!tokens.every((token) => haystack.includes(token))) {
      return 0;
    }
  }

  let score = 10;
  if (story.body.toLowerCase().includes(query)) score += 35;
  if (story.epic.title.toLowerCase().includes(query)) score += 10;
  if (story.heading.toLowerCase().includes(query)) score += 5;
  if (story.ticketBatch?.toLowerCase().includes(query)) score += 5;
  return score;
}

function inferModuleName(filePath) {
  const parts = String(filePath).split("/").filter(Boolean);
  if (!parts.length) {
    return null;
  }

  const [root, second] = parts;
  const sourceRoots = new Set(["src", "core", "cli", "runtime", "functions"]);
  const auxiliaryRoots = new Set(["tests", "scripts", "docs", "design", "public"]);
  const ignoredRoots = new Set([
    ".ai-workflow",
    ".claude",
    ".github",
    ".obsidian",
    "artifacts",
    "playwright-report",
    "test-results",
    "coverage",
    "output"
  ]);

  if (ignoredRoots.has(root)) {
    return null;
  }

  if (parts.length === 1) {
    return null;
  }

  if (sourceRoots.has(root)) {
    if (second && !looksLikeFileName(second)) {
      return `${root}/${second}`;
    }
    return root;
  }

  if (auxiliaryRoots.has(root)) {
    if (second && !looksLikeFileName(second)) {
      return `${root}/${second}`;
    }
    return root;
  }

  if (parts.length >= 2 && !looksLikeFileName(second)) {
    return `${root}/${second}`;
  }

  return root;
}

function looksLikeFileName(segment) {
  return /\.[A-Za-z0-9]+$/.test(segment);
}

function inferModuleResponsibility(moduleName, filePaths = []) {
  const normalized = String(moduleName ?? "").trim();
  const lower = normalized.toLowerCase();
  const basenames = [...new Set(
    filePaths
      .map((filePath) => path.basename(String(filePath), path.extname(String(filePath))))
      .filter((name) => name && !["index", "main", "mod"].includes(name))
  )];

  if (lower === "cli" || lower.startsWith("cli/")) {
    return "CLI entrypoints, interactive shell behavior, and local operator tooling.";
  }
  if (lower === "core/services" || lower.startsWith("core/services")) {
    return "Core workflow services for sync, orchestration, routing, status, and verification.";
  }
  if (lower === "core/db" || lower.startsWith("core/db")) {
    return "Workflow database persistence, schema management, and indexed state storage.";
  }
  if (lower === "core/lib" || lower.startsWith("core/lib")) {
    return "Shared workflow runtime helpers used across the CLI and core services.";
  }
  if (lower === "core/parsers" || lower.startsWith("core/parsers")) {
    return "Parsers and extraction logic for indexed source files and structured project facts.";
  }
  if (lower === "runtime/scripts" || lower.startsWith("runtime/scripts")) {
    return "Runtime automation scripts, dogfood helpers, and operator utilities.";
  }
  if (lower === "runtime/web" || lower.startsWith("runtime/web")) {
    return "Web runtime assets and browser-facing workflow surfaces.";
  }
  if (lower === "docs" || lower.startsWith("docs/")) {
    return lower.startsWith("docs/handoffs")
      ? "Implementation handoffs, audit notes, and execution guidance for ongoing tickets."
      : "Project documentation, operating guidance, and design notes.";
  }
  if (lower === "tests" || lower.startsWith("tests")) {
    return "Automated test coverage, fixtures, and workflow verification scenarios.";
  }
  if (lower === "scripts" || lower.startsWith("scripts")) {
    return "Local scripts for project setup, maintenance, and developer workflows.";
  }
  if (lower.startsWith("shared/")) {
    return "Shared templates, codelets, and reusable workflow assets.";
  }
  if (lower === ".gemini") {
    return "Gemini-specific prompts, configuration, and local provider support files.";
  }
  if (basenames.length) {
    return `Owns ${basenames.slice(0, 4).join(", ")}.`;
  }
  return `Owns the ${normalized} area of the workflow toolkit.`;
}

function deriveCandidateScores(note, filePath) {
  const derived = deriveCandidateFromNote({
    ...note,
    id: note.id ?? stableId("note-score", filePath, note.noteType, note.line ?? 0, note.body),
    filePath
  });
  return {
    riskScore: derived.riskScore,
    leverageScore: derived.leverageScore,
    ticketValueScore: derived.ticketValueScore,
    candidateScore: derived.score
  };
}
