/**
 * Responsibility: Data Models & Contracts for Content-Addressable Knowledgebase.
 * Scope: Shared across KnowledgeBaseClient, CLI, and Agent Tools.
 */

export type KnowledgeType = 'service' | 'skill' | 'pattern';
export type KnowledgeTarget = 'universal' | 'ai-cli' | 'aiwf';

export interface KnowledgeItemMeta {
  id: string; // e.g. "patterns/pubsub-event-routing"
  type: KnowledgeType;
  title: string;
  description: string;
  target: KnowledgeTarget;
  tags: string[];
  path: string;
  entrypoint?: string;
  files?: string[];
  sourceCode?: string;
  requirements?: {
    daemons?: string[];
    binaries?: string[];
  };
  sha256: string;
  sizeBytes: number;
}

export interface KnowledgeManifest {
  version: string;
  generatedAt: string;
  repo: string;
  totalItems: number;
  items: KnowledgeItemMeta[];
}

export interface KnowledgeItem {
  meta: KnowledgeItemMeta;
  rawContent: string;
  parsed?: any;
  verified: boolean;
}

export interface KnowledgeSearchFilter {
  query?: string;
  type?: KnowledgeType;
  target?: KnowledgeTarget;
  tag?: string;
}
