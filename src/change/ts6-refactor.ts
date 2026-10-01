/**
 * Responsibility: TypeScript 6 tsserver refactor sidecar using typescript-language-server.
 * Scope: Exposes mature tsserver refactoring operations (extract function/constant/type, move to file/new file, inline variable)
 *        that TypeScript 7 native LSP does not yet support.
 * Rules:
 *   - Clean shutdown with no orphaned child processes.
 *   - Started lazily only when a requested refactor requires TS6 mature tsserver capabilities.
 *   - Does not rewrite or re-implement refactoring algorithms; calls typescript.tsserverRequest or executeCommand.
 *   - Returns standard WorkspaceEditLike directly into the existing Change Engine.
 */

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import * as rpc from 'vscode-jsonrpc/node';
import { resolveTs6RefactorRuntime } from '../typescript-runtime.ts';
import type {
  LspPosition,
  LspRange,
  LspTextEdit,
  WorkspaceEditLike
} from './types.ts';

export interface Ts6RefactorClientOptions {
  projectRoot: string;
}

export interface Ts6ApplicableAction {
  name: string;
  description: string;
  kind?: string;
  notApplicableReason?: string;
}

export interface Ts6ApplicableRefactor {
  name: string;
  description: string;
  actions: Ts6ApplicableAction[];
}

export class Ts6RefactorClient {
  public readonly projectRoot: string;
  private child: ChildProcess | null = null;
  private connection: rpc.MessageConnection | null = null;
  private initPromise: Promise<void> | null = null;
  private isClosed = false;
  private interceptedWorkspaceEdit: WorkspaceEditLike | null = null;
  private openDocuments = new Set<string>();

  constructor(options: Ts6RefactorClientOptions) {
    this.projectRoot = path.resolve(options.projectRoot);
  }

  toUri(filePath: string): string {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);
    return pathToFileURL(abs).toString();
  }

  fromUri(uri: string): string {
    return fileURLToPath(uri);
  }

  async ensureStarted(): Promise<void> {
    if (this.isClosed) {
      throw new Error(`Ts6RefactorClient for '${this.projectRoot}' is closed.`);
    }
    if (this.connection) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const runtime = await resolveTs6RefactorRuntime(this.projectRoot);
      if (!runtime.isAvailable || !runtime.tslsBinPath || !runtime.tsserverPath) {
        throw new Error(runtime.error || 'TypeScript 6 refactor sidecar is not available. Run `aiwf setup`.');
      }

      const child = spawn(runtime.tslsBinPath, ['--stdio'], {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.child = child;

      child.stderr?.on('data', () => {});
      child.on('error', () => {
        this.connection = null;
      });
      child.on('exit', () => {
        this.connection = null;
      });

      const reader = new rpc.StreamMessageReader(child.stdout!);
      const writer = new rpc.StreamMessageWriter(child.stdin!);
      const connection = rpc.createMessageConnection(reader, writer);
      this.connection = connection;

      // Handle workspace/applyEdit sent from typescript-language-server
      connection.onRequest('workspace/applyEdit', (params: any) => {
        this.interceptedWorkspaceEdit = params.edit;
        return { applied: true };
      });

      // Handle client-side rename callback if server triggers _typescript.rename
      connection.onRequest('_typescript.rename', () => null);

      connection.listen();

      const rootUri = pathToFileURL(this.projectRoot).toString();

      await connection.sendRequest('initialize', {
        processId: process.pid,
        rootUri,
        initializationOptions: {
          tsserver: {
            path: runtime.tsserverPath
          },
          preferences: {
            allowRenameOfImportPath: true
          }
        },
        capabilities: {
          textDocument: {
            codeAction: {
              dynamicRegistration: false,
              codeActionLiteralSupport: {
                codeActionKind: {
                  valueSet: [
                    'quickfix',
                    'refactor',
                    'refactor.extract',
                    'refactor.inline',
                    'refactor.rewrite',
                    'refactor.move'
                  ]
                }
              }
            }
          },
          workspace: {
            applyEdit: true,
            workspaceEdit: {
              documentChanges: true,
              resourceOperations: ['create', 'rename', 'delete']
            },
            executeCommand: {
              dynamicRegistration: false
            }
          }
        }
      });

      connection.sendNotification('initialized', {});
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Notifies tsserver that a document is open.
   */
  async ensureDocumentOpen(filePath: string): Promise<void> {
    await this.ensureStarted();
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);
    const uri = this.toUri(absPath);
    if (this.openDocuments.has(uri)) return;

    if (fs.existsSync(absPath)) {
      const text = fs.readFileSync(absPath, 'utf8');
      this.connection!.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: 'typescript',
          version: 1,
          text
        }
      });
      this.openDocuments.add(uri);
    }
  }

  /**
   * Queries applicable tsserver refactors for a range or symbol location.
   */
  async getApplicableRefactors(filePath: string, range: LspRange): Promise<Ts6ApplicableRefactor[]> {
    await this.ensureDocumentOpen(filePath);
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);

    // Convert 0-based LSP range to 1-based line & character offset for tsserver
    const startLine = range.start.line + 1;
    const startOffset = range.start.character + 1;
    const endLine = range.end.line + 1;
    const endOffset = range.end.character + 1;

    try {
      const res: any = await this.connection!.sendRequest('workspace/executeCommand', {
        command: 'typescript.tsserverRequest',
        arguments: [
          'getApplicableRefactors',
          {
            file: absPath,
            startLine,
            startOffset,
            endLine,
            endOffset
          }
        ]
      });

      const list: any[] = res?.body || [];
      return list.map(item => ({
        name: item.name,
        description: item.description,
        actions: (item.actions || []).map((a: any) => ({
          name: a.name,
          description: a.description,
          kind: a.kind,
          notApplicableReason: a.notApplicableReason
        }))
      }));
    } catch (err) {
      return [];
    }
  }

  /**
   * Executes a refactor and returns a standard WorkspaceEditLike.
   */
  async getEditsForRefactor(
    filePath: string,
    range: LspRange,
    refactorName: string,
    actionName: string,
    extraArgs?: Record<string, any>
  ): Promise<WorkspaceEditLike | null> {
    await this.ensureDocumentOpen(filePath);
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);

    const startLine = range.start.line + 1;
    const startOffset = range.start.character + 1;
    const endLine = range.end.line + 1;
    const endOffset = range.end.character + 1;

    // First try via tsserverRequest getEditsForRefactor
    try {
      const requestArgs: any = {
        file: absPath,
        startLine,
        startOffset,
        endLine,
        endOffset,
        refactor: refactorName,
        action: actionName
      };

      if (extraArgs?.targetFile) {
        const targetAbs = path.isAbsolute(extraArgs.targetFile)
          ? extraArgs.targetFile
          : path.resolve(this.projectRoot, extraArgs.targetFile);
        if (fs.existsSync(targetAbs)) {
          await this.ensureDocumentOpen(targetAbs);
        }
        requestArgs.interactiveRefactorArguments = {
          targetFile: targetAbs
        };
      }

      const res: any = await this.connection!.sendRequest('workspace/executeCommand', {
        command: 'typescript.tsserverRequest',
        arguments: ['getEditsForRefactor', requestArgs]
      });

      const body = res?.body;
      if (body?.edits && Array.isArray(body.edits)) {
        // Convert tsserver edits format to WorkspaceEditLike
        const changes: Record<string, LspTextEdit[]> = {};
        for (const fileEdit of body.edits) {
          const fileUri = this.toUri(fileEdit.fileName);
          const edits: LspTextEdit[] = (fileEdit.textChanges || []).map((tc: any) => ({
            range: {
              start: {
                line: Math.max(0, tc.start.line - 1),
                character: Math.max(0, tc.start.offset - 1)
              },
              end: {
                line: Math.max(0, tc.end.line - 1),
                character: Math.max(0, tc.end.offset - 1)
              }
            },
            newText: tc.newText || ''
          }));
          changes[fileUri] = edits;
        }
        return { changes };
      }
    } catch {}

    // Fallback: try codeAction / applyRefactoring command if direct tsserver call returned null
    this.interceptedWorkspaceEdit = null;
    try {
      const codeActions: any = await this.connection!.sendRequest('textDocument/codeAction', {
        textDocument: { uri: this.toUri(absPath) },
        range,
        context: {
          only: ['refactor'],
          diagnostics: []
        }
      });

      const targetAction = (codeActions || []).find((a: any) =>
        a.title?.toLowerCase().includes(actionName.toLowerCase()) ||
        a.title?.toLowerCase().includes(refactorName.toLowerCase()) ||
        a.command?.arguments?.[0]?.action === actionName
      );

      if (targetAction?.command) {
        await this.connection!.sendRequest('workspace/executeCommand', targetAction.command);
        if (this.interceptedWorkspaceEdit) {
          return this.interceptedWorkspaceEdit;
        }
      }
    } catch {}

    return null;
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    if (this.connection) {
      try {
        await this.connection.sendRequest('shutdown');
        this.connection.sendNotification('exit');
      } catch {}
      try {
        this.connection.dispose();
      } catch {}
      this.connection = null;
    }

    if (this.child) {
      try {
        if (!this.child.killed) {
          this.child.kill('SIGTERM');
        }
      } catch {}
      this.child = null;
    }

    this.openDocuments.clear();
  }
}

/**
 * Shared registry of live TS6 refactor clients per project root.
 */
const ts6Registry = new Map<string, Ts6RefactorClient>();

export function getTs6RefactorClient(projectRoot: string): Ts6RefactorClient {
  const normalized = path.resolve(projectRoot);
  let client = ts6Registry.get(normalized);
  if (!client) {
    client = new Ts6RefactorClient({ projectRoot: normalized });
    ts6Registry.set(normalized, client);
  }
  return client;
}

export async function closeAllTs6RefactorClients(): Promise<void> {
  const clients = Array.from(ts6Registry.values());
  ts6Registry.clear();
  await Promise.all(clients.map(c => c.close()));
}
