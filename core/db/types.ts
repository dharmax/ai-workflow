/**
 * Responsibility: Centralize common entity types for the workflow database.
 */

export interface Entity {
  id: string;
  entityType: string;
  title: string;
  lane: string | null;
  state: string;
  confidence: number;
  provenance: string;
  sourceKind: string;
  reviewState: string;
  parentId: string | null;
  relevantUntil?: string | null;
  consultationQuestion?: string | null;
  data: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Ticket extends Entity {
  entityType: "ticket";
}

export interface Epic extends Entity {
  entityType: "epic";
}

export interface FileRecord {
  path: string;
  language: string;
  fileKind: string;
  sha1: string;
  sizeBytes: number;
  mtimeMs: number;
  metadata: Record<string, any>;
  indexedAt: string;
}

export interface SymbolRecord {
  id: string;
  filePath: string;
  name: string;
  kind: string;
  exported: boolean;
  line: number | null;
  column: number | null;
  metadata: Record<string, any>;
  sourceKind: string;
  updatedAt: string;
}
