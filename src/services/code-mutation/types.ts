/** Source-only request, target and mutation contracts. */
import type {LspPosition, LspRange, WorkspaceEditLike} from '../typescript/types.ts';
import type {ChangePreview as Preview, ChangeApplyResult as ApplyResult} from '../../model/change-result.ts';
import type {WorkflowStore} from '../../graph/store.ts';
import type {TsLspClient} from '../typescript/ts-lsp.ts';
import type {Ts6RefactorClient} from '../typescript/ts6-refactor.ts';

export type SourceChangeMutation = {kind: 'workspace_edit'; source: 'typescript-lsp' | 'typescript6-refactor' | 'workspace-text'; edit: WorkspaceEditLike};

export interface SourcePreviewContext {
  store: WorkflowStore;
  projectRoot: string;
  lspClient: TsLspClient;
  ts6Client: Ts6RefactorClient;
}

export interface PreparedSourceOperation {
  mutation: SourceChangeMutation;
  summary: string;
  resolvedTarget?: ResolvedCodeTarget;
}

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

export type SourceFileChange =
  | { action: 'replace_text'; filePath: string; oldText: string; newText: string }
  | { action: 'create_file'; filePath: string; content: string }
  | { action: 'delete_file'; filePath: string };

export type SourceChangeRequest =
  | { action: 'source_change'; changes: SourceFileChange[] }
  | { action: 'delete_file'; filePath: string }
  | { action: 'replace_text'; filePath: string; oldText: string; newText: string }
  | { action: 'create_file'; filePath: string; content: string; productContextEntityId?: string }
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


export type SourceChangePreview = Preview<SourceChangeRequest, SourceChangeMutation, ResolvedCodeTarget>;
export type SourceChangeApplyResult = ApplyResult<SourceChangePreview>;
