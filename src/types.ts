/**
 * Shared types for the ai-workflow Causal Engineering OS.
 */

export type EntityType = 
  | 'epic' 
  | 'feature' 
  | 'ticket' 
  | 'intent_block' 
  | 'decision' 
  | 'guideline' 
  | 'module' 
  | 'file' 
  | 'symbol';

export type TicketLane = 'Backlog' | 'Todo' | 'In Progress' | 'Done' | 'Blocked';

export type EntityStatus = 
  | 'planned' 
  | 'partial' 
  | 'implemented' 
  | 'verified' 
  | 'proposed' 
  | 'accepted' 
  | 'deprecated' 
  | 'reverted' 
  | 'superseded';

export interface Entity {
  id: string;
  type: EntityType;
  title: string;
  lane?: TicketLane;
  status?: EntityStatus;
  body?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export type RelationType = 
  | 'implements' 
  | 'depends_on' 
  | 'modifies' 
  | 'governs' 
  | 'verified_by' 
  | 'failed_with' 
  | 'supersedes' 
  | 'contains';

export interface Relation {
  fromId: string;
  toId: string;
  relation: RelationType;
  metadata?: Record<string, any>;
}

export interface CodeNote {
  id?: number;
  filePath: string;
  line: number;
  column?: number;
  noteType: 'BUG' | 'FIXME' | 'TODO' | 'HACK' | 'NOTE';
  body: string;
  ticketId?: string;
}

export interface RunArtifact {
  id: string;
  ticketId?: string;
  action: string;
  status: 'passed' | 'failed' | 'skipped';
  output?: string;
  lessons?: Record<string, any>;
  createdAt?: string;
}

export interface ProjectHealth {
  modules: Array<{
    name: string;
    path: string;
    symbolCount: number;
    implementedSymbols: number;
    completionPercent: number;
    bugsCount: number;
    todoCount: number;
    activeTickets: string[];
  }>;
  totalTickets: number;
  laneCounts: Record<TicketLane, number>;
  openBugsCount: number;
  acceptedDecisionsCount: number;
}

export interface TicketContext {
  ticket: Entity;
  epic?: Entity;
  decisions: Entity[];
  guidelines: Entity[];
  linkedFiles: string[];
  linkedSymbols: Array<{ name: string; kind: string; file: string; line: number }>;
  pastLessons: RunArtifact[];
  verificationCommand?: string;
}
