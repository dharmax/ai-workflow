/**
 * Responsibility: Core type definitions for the AST+ Semantic Graph, Tickets, and Entities.
 * Scope: Typed contracts for Semantika ontology nodes, predicates, claims, and project health.
 */

export type TicketLane = 'Backlog' | 'Todo' | 'In Progress' | 'Done' | 'Blocked';
export type TicketStatus = 'planned' | 'in_progress' | 'verified' | 'blocked' | 'rejected';
export type EntityStatus = 'draft' | 'proposed' | 'accepted' | 'implemented' | 'verified' | 'deprecated';

export interface TicketClaim {
  agentId: string;
  claimedAt: string;
  expiresAt: string;
}

export interface BaseEntityData {
  id: string;
  title: string;
  status?: string;
  body?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface IdeaData extends BaseEntityData {
  feasibility?: 'low' | 'medium' | 'high';
  impact?: 'low' | 'medium' | 'high';
}

export interface EpicData extends BaseEntityData {
  priority?: number;
}

export interface UserStoryData extends BaseEntityData {
  actor?: string;
  story?: string;
  context?: string;
  acceptanceCriteria?: string[];
  sla?: string;
  linkedTicket?: string;
  epicId?: string;
}

export interface TicketData extends BaseEntityData {
  lane: TicketLane;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  claim?: TicketClaim;
  estimateTokens?: number;
}

export interface ModuleData extends BaseEntityData {
  path: string;
  completionPercent?: number;
}

export interface FileData extends BaseEntityData {
  path: string;
  language?: string;
  fileKind?: string;
  size?: number;
  hash?: string;
}

export interface SymbolData extends BaseEntityData {
  filePath: string;
  kind: 'function' | 'class' | 'method' | 'type' | 'interface' | 'variable' | 'const' | 'enum';
  exported: boolean;
  line: number;
  column: number;
  signature?: string;
}

export interface TestData extends BaseEntityData {
  targetPath: string;
  framework?: string;
  lastRun?: string;
  passed?: boolean;
}

export interface DecisionData extends BaseEntityData {
  decision: string;
  context?: string;
  consequences?: string;
}

export interface LessonData extends BaseEntityData {
  ticketId?: string;
  filePath?: string;
  noteType: 'BUG' | 'FIXME' | 'TODO' | 'LESSON' | 'TRAP';
  preventionPattern?: string;
}

export interface ArtifactData extends BaseEntityData {
  action: string;
  output?: string;
  patchPath?: string;
  reportUrl?: string;
}

export interface CallSiteData extends BaseEntityData {
  callerFile: string;
  calleeName: string;
  line: number;
  column: number;
}

export interface TraceData extends BaseEntityData {
  traceId: string;
  step: number;
  input?: any;
  output?: any;
  durationMs?: number;
}

export interface SemanticPredicatePayload {
  confidence?: 'speculative' | 'probable' | 'confirmed';
  state?: 'abstract' | 'designed' | 'implemented' | 'verified';
  weight?: number; // 0.0 - 1.0 for fuzzy/speculative ranking
  note?: string;
  sourceRange?: { startLine: number; endLine: number };
  timestamp?: number;
  [key: string]: any;
}

export type SemanticPredicateName =
  | 'contains'
  | 'calls'
  | 'inherits'
  | 'depends_on'
  | 'imports'
  | 'implements'
  | 'addresses'
  | 'modifies'
  | 'targets'
  | 'verifies'
  | 'fuzzy_relates'
  | 'potentially_affects'
  | 'governs'
  | 'blocks'
  | 'inspires'
  | 'generates'
  | 'trace_links';

export interface ModuleHealth {
  name: string;
  path: string;
  completionPercent: number;
  symbolCount: number;
  bugsCount: number;
  activeTickets: string[];
}

export interface ProjectHealth {
  totalTickets: number;
  byLane: Record<TicketLane, number>;
  completionPercent: number;
  modules: ModuleHealth[];
  activeClaims: Array<{ ticketId: string; claim: TicketClaim }>;
}
