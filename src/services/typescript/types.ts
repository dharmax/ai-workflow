/** Shared TypeScript/LSP structural contracts used by read-only and mutation clients. */
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

