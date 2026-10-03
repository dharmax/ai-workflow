/**
 * Responsibility: Shared contracts for the Causal Change Engine.
 * Scope: Change request, target identity, mutation, preview, verification, and fingerprinting types.
 * Rules:
 *   - Use 'change' terminology (not refactor-only) to naturally support upcoming Product Intent mutations.
 *   - Keep contracts small and JSON-serializable. No persisted plan tables.
 */

import type { ProductImpact } from '../product/impact.ts';
import type { ProductMutation } from '../product/mutation.ts';

export interface LspPosition {
  line: number;      // 0-based
  character: number; // 0-based
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspTextEdit {
  range: LspRange;
  newText: string;
}

export interface LspTextDocumentIdentifier {
  uri: string;
}

export interface LspVersionedTextDocumentIdentifier extends LspTextDocumentIdentifier {
  version: number | null;
}

export interface LspTextDocumentEdit {
  textDocument: LspVersionedTextDocumentIdentifier;
  edits: LspTextEdit[];
}

export interface LspCreateFile {
  kind: 'create';
  uri: string;
  options?: { overwrite?: boolean; ignoreIfExists?: boolean };
}

export interface LspRenameFile {
  kind: 'rename';
  oldUri: string;
  newUri: string;
  options?: { overwrite?: boolean; ignoreIfExists?: boolean };
}

export interface LspDeleteFile {
  kind: 'delete';
  uri: string;
  options?: { recursive?: boolean; ignoreIfNotExists?: boolean };
}

export type LspDocumentChange =
  | LspTextDocumentEdit
  | LspCreateFile
  | LspRenameFile
  | LspDeleteFile;

export interface WorkspaceEditLike {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: LspDocumentChange[];
}

export type ChangeMutation =
  | {
      kind: 'workspace_edit';
      source: 'typescript-lsp' | 'typescript6-refactor';
      edit: WorkspaceEditLike;
    }
  | ProductMutation;

export interface ResolvedCodeTarget {
  filePath: string;
  symbolName: string;
  containerName?: string;
  kind?: string;
  position: LspPosition;
  range?: LspRange;
  uri: string;
  graphEntityId?: string;
}

export type ChangeTarget =
  | { type: 'entity'; entityId: string }
  | { type: 'symbol'; filePath: string; symbolName: string; containerName?: string }
  | { type: 'position'; filePath: string; line: number; character: number }
  | { type: 'range'; filePath: string; startLine: number; startCharacter: number; endLine: number; endCharacter: number }
  | { type: 'file'; filePath: string };

export type ChangeRequest =
  | { action: 'create_file'; filePath: string; content: string; productContextEntityId?: string }
  | { action: 'product_change'; mutations: ProductMutation[] }
  | { action: 'replace_symbol'; target: ChangeTarget; replacement: string; productContextEntityId?: string }
  | {
      action: 'rename_symbol';
      target: ChangeTarget;
      newName: string;
      productContextEntityId?: string;
    }
  | {
      action: 'rename_file';
      oldPath: string;
      newPath: string;
      productContextEntityId?: string;
    }
  | {
      action: 'source_action';
      filePath: string;
      actionKind: 'source.organizeImports' | 'source.removeUnusedImports' | 'source.sortImports' | 'source.fixAll' | 'quickfix';
      productContextEntityId?: string;
    }
  | {
      action: 'refactor';
      target: ChangeTarget;
      refactorKind: string;
      actionName?: string;
      arguments?: Record<string, any>;
      productContextEntityId?: string;
    };

export interface VerificationPlan {
  diagnosticsExpected: boolean;
  typecheck: boolean;
  targetedTests: string[];
  graphChecks: {
    expectedDefinition?: string;
    oldDefinitionRemoved?: boolean;
    migratedAnchor?: {
      oldId: string;
      expectedNewId?: string;
    };
  };
}

export interface ChangePreview {
  fingerprint: string;
  summary: string;
  request: ChangeRequest;
  resolvedTarget?: ResolvedCodeTarget;
  mutations: ChangeMutation[];
  affectedFiles: string[];
  originalHashes: Record<string, string>;
  affectedProducts?: string[];
  dependents?: Array<{ sourceId: string; predicate: string; targetId: string }>;
  productImpact?: ProductImpact;
  productImpacts?: ProductImpact[];
  verification: VerificationPlan;
  warnings: string[];
  blocked: boolean;
  blockReason?: string;
  requiredArguments?: string[];
}

export interface ChangeApplyResult {
  ok: boolean;
  fingerprint: string;
  filesTouched: string[];
  filesRenamed: Array<{ from: string; to: string }>;
  reindexedFiles: string[];
  migratedAnchors: Array<{ oldId: string; newId: string }>;
  verification: {
    passed: boolean;
    diagnosticsOk: boolean;
    typecheckOk?: boolean;
    testsOk?: boolean;
    errors: string[];
  };
  error?: string;
}
