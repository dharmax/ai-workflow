/**
 * Responsibility: Native TypeScript 7 LSP client over stdio using vscode-jsonrpc.
 * Scope: Manages long-lived `tsc --lsp -stdio` child process per project root.
 * Rules:
 *   - No home-grown Content-Length framing; uses mature vscode-jsonrpc.
 *   - Capability-probe runtime rather than assuming unsupported refactors.
 *   - Clean shutdown with no orphaned child processes.
 */

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import * as rpc from 'vscode-jsonrpc/node';
import { closeLspTransport } from './lsp-shutdown.ts';
import { resolveTypeScriptRuntime, type TsResolverSeams } from '../typescript-runtime.ts';
import type {
  LspPosition,
  LspRange,
  LspTextEdit,
  WorkspaceEditLike
} from './types.ts';

export interface TsLspServerCapabilities {
  renameProvider?: boolean | { prepareProvider?: boolean };
  referencesProvider?: boolean;
  definitionProvider?: boolean;
  typeDefinitionProvider?: boolean;
  implementationProvider?: boolean;
  callHierarchyProvider?: boolean;
  codeActionProvider?: boolean | { codeActionKinds?: string[] };
  diagnosticProvider?: any;
  workspaceFileOperations?: {
    willRename?: any;
  };
  serverInfo?: {
    name: string;
    version?: string;
  };
  raw: any;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspDocumentSymbol {
  name: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children?: LspDocumentSymbol[];
}

export interface LspCallHierarchyItem {
  name: string;
  kind: number;
  uri: string;
  range: LspRange;
  selectionRange: LspRange;
  data?: unknown;
}

export interface LspPrepareRenameResult {
  range: LspRange;
  placeholder?: string;
}

export interface LspCodeAction {
  title: string;
  kind?: string;
  diagnostics?: any[];
  edit?: WorkspaceEditLike;
  command?: any;
}

export interface TsLspClientOptions {
  projectRoot: string;
  seams?: TsResolverSeams;
  customExecutable?: string;
}

export class TsLspClient {
  public readonly projectRoot: string;
  private child: ChildProcess | null = null;
  private connection: rpc.MessageConnection | null = null;
  private capabilities: TsLspServerCapabilities | null = null;
  private initPromise: Promise<void> | null = null;
  private options: TsLspClientOptions;
  private isClosed = false;
  private closePromise: Promise<void> | null = null;
  private fileWatcher: fs.FSWatcher | null = null;
  private readonly pendingFiles = new Map<string, 1 | 2 | 3>();
  private fileWatchError: unknown;

  constructor(options: TsLspClientOptions) {
    this.projectRoot = path.resolve(options.projectRoot);
    this.options = options;
  }

  /**
   * Lazily starts and initializes the TS7 native LSP server.
   */
  async ensureStarted(): Promise<void> {
    if (this.isClosed) throw new Error('TsLspClient is closed');
    if (this.capabilities && this.connection) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      let tscPath = this.options.customExecutable;
      if (!tscPath) {
        const resolved = await resolveTypeScriptRuntime(this.projectRoot, this.options.seams);
        if (!resolved.isCompatible || !resolved.executablePath) {
          throw new Error(resolved.error || 'No compatible TypeScript 7 executable found for LSP client.');
        }
        tscPath = resolved.executablePath;
      }

      if (this.isClosed) throw new Error('TsLspClient is closed');
      // Launch tsc --lsp -stdio over child_process stdio
      const child = spawn(tscPath, ['--lsp', '-stdio'], {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32'
      });

      this.child = child;

      child.stderr?.on('data', (chunk) => {
        // Keep stderr non-fatal for diagnostics logging
        const msg = chunk.toString();
        if (process.env.DEBUG_LSP) {
          console.error(`[TS7 LSP stderr] ${msg}`);
        }
      });

      child.on('error', (err) => {
        this.connection = null;
        this.capabilities = null;
      });

      child.on('exit', () => {
        this.connection = null;
        this.capabilities = null;
      });

      const reader = new rpc.StreamMessageReader(child.stdout!);
      const writer = new rpc.StreamMessageWriter(child.stdin!);
      const connection = rpc.createMessageConnection(reader, writer);
      this.connection = connection;
      if (process.env.DEBUG_LSP) connection.trace(rpc.Trace.Verbose, {
        log: (message: string, data?: string) => console.error(`[TS7 LSP ${this.projectRoot}] ${message}`, data ?? '')
      });
      connection.listen();

      const rootUri = pathToFileURL(this.projectRoot).toString();

      const initParams = {
        processId: process.pid,
        rootUri,
        rootPath: this.projectRoot,
        capabilities: {
          textDocument: {
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            rename: { dynamicRegistration: false, prepareSupport: true },
            references: { dynamicRegistration: false },
            definition: { dynamicRegistration: false },
            codeAction: {
              dynamicRegistration: false,
              codeActionLiteralSupport: {
                codeActionKind: {
                  valueSet: [
                    'quickfix',
                    'source.organizeImports',
                    'source.removeUnusedImports',
                    'source.sortImports',
                    'source.fixAll'
                  ]
                }
              }
            }
          },
          workspace: {
            workspaceEdit: {
              documentChanges: true,
              resourceOperations: ['create', 'rename', 'delete']
            },
            fileOperations: {
              willRename: true
            }
          }
        }
      };

      const response: any = await connection.sendRequest('initialize', initParams);
      await connection.sendNotification('initialized', {});

      if (this.isClosed) throw new Error('TsLspClient is closed');
      const serverCaps = response.capabilities || {};
      this.capabilities = {
        renameProvider: serverCaps.renameProvider,
        referencesProvider: serverCaps.referencesProvider,
        definitionProvider: serverCaps.definitionProvider,
        typeDefinitionProvider: serverCaps.typeDefinitionProvider,
        implementationProvider: serverCaps.implementationProvider,
        callHierarchyProvider: serverCaps.callHierarchyProvider,
        codeActionProvider: serverCaps.codeActionProvider,
        diagnosticProvider: serverCaps.diagnosticProvider,
        workspaceFileOperations: serverCaps.workspace?.fileOperations,
        serverInfo: response.serverInfo,
        raw: serverCaps
      };
      this.watchFiles();
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /** TS7 delegates workspace filesystem notifications to its host client. */
  private watchFiles(): void {
    if (this.fileWatcher) return;
    const ignored = new Set(['node_modules','.git','.ai-workflow','dist','coverage']);
    this.fileWatcher = fs.watch(this.projectRoot,{recursive:true},(event,filename) => {
      if (this.isClosed) return;
      if (!filename) {this.fileWatchError = Error('Workspace watch event has no path.'); return;}
      const relative = filename.toString();
      if (relative.split(path.sep).some(part => ignored.has(part))) return;
      try {
        const info = fs.lstatSync(path.resolve(this.projectRoot,relative),{throwIfNoEntry:false});
        if (info?.isDirectory()) return;
        const uri = this.toUri(relative);
        this.pendingFiles.set(uri,!info ? 3 : event === 'rename' || this.pendingFiles.get(uri) === 1 ? 1 : 2);
      } catch (error) {this.fileWatchError = error;}
    });
    this.fileWatcher.on('error',error => {this.fileWatchError = error;});
    this.fileWatcher.unref();
  }

  private async prepareRequest(): Promise<void> {
    await this.ensureStarted();
    // Let queued native filesystem events run before sending a semantic request.
    await new Promise<void>(resolve => setImmediate(resolve));
    if (this.fileWatchError) throw new Error('TypeScript workspace watch failed.',{cause:this.fileWatchError});
    if (!this.pendingFiles.size) return;
    const changes = [...this.pendingFiles].map(([uri,type]) => ({uri,type}));
    this.pendingFiles.clear();
    await this.connection!.sendNotification('workspace/didChangeWatchedFiles',{changes});
  }

  getCapabilities(): TsLspServerCapabilities | null {
    return this.capabilities;
  }

  toUri(filePath: string): string {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(this.projectRoot, filePath);
    return pathToFileURL(abs).toString();
  }

  fromUri(uri: string): string {
    return fileURLToPath(uri);
  }

  async getDocumentSymbols(filePath: string): Promise<LspDocumentSymbol[]> {
    await this.prepareRequest();
    const connection = this.connection;
    if (!connection) throw new Error('TypeScript LSP client is closed.');
    if (!this.capabilities?.raw.documentSymbolProvider) throw new Error('TypeScript document symbols unavailable.');
    const uri = this.toUri(filePath);
    await connection.sendNotification('textDocument/didOpen', { textDocument: {
      uri, languageId: /\.[cm]?tsx?$/.test(filePath) ? 'typescript' : 'javascript', version: 1,
      text: fs.readFileSync(path.resolve(this.projectRoot, filePath), 'utf8')
    } });
    try {
      return await connection.sendRequest('textDocument/documentSymbol', { textDocument: { uri } }) as LspDocumentSymbol[] || [];
    } finally {
      try { await connection.sendNotification('textDocument/didClose', { textDocument: { uri } }); }
      catch (error) { if (!this.isClosed) throw error; }
    }
  }

  async getIncomingCalls(filePath: string, position: LspPosition): Promise<Array<{ from: LspCallHierarchyItem; fromRanges: LspRange[] }>> {
    await this.prepareRequest();
    if (!this.capabilities?.callHierarchyProvider) throw new Error('TypeScript call hierarchy unavailable.');
    const items = await this.connection!.sendRequest('textDocument/prepareCallHierarchy', {
      textDocument: { uri: this.toUri(filePath) }, position
    }) as LspCallHierarchyItem[] | null;
    if (!items || items.length !== 1) throw new Error('Expected one exact call hierarchy target.');
    return await this.connection!.sendRequest('callHierarchy/incomingCalls', { item: items[0] }) as Array<{ from: LspCallHierarchyItem; fromRanges: LspRange[] }> || [];
  }

  /**
   * Resolves exact definition(s) for a location in a file.
   */
  async getDefinition(filePath: string, position: LspPosition): Promise<LspLocation[]> {
    await this.prepareRequest();
    const uri = this.toUri(filePath);
    const res: any = await this.connection!.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position
    });
    if (!res) return [];
    if (Array.isArray(res)) {
      return res.map(loc => ({
        uri: loc.uri || loc.targetUri,
        range: loc.range || loc.targetSelectionRange || loc.targetRange
      }));
    }
    return [{
      uri: res.uri || res.targetUri,
      range: res.range || res.targetSelectionRange || res.targetRange
    }];
  }

  /**
   * Resolves all exact references for a location in a file.
   */
  async getReferences(filePath: string, position: LspPosition, includeDeclaration = true): Promise<LspLocation[]> {
    await this.prepareRequest();
    const uri = this.toUri(filePath);
    const res: any = await this.connection!.sendRequest('textDocument/references', {
      textDocument: { uri },
      position,
      context: { includeDeclaration }
    });
    if (!Array.isArray(res)) return [];
    return res.map(loc => ({
      uri: loc.uri,
      range: loc.range
    }));
  }

  /**
   * Tests whether a symbol at location can be renamed and returns its identifier range.
   */
  async prepareRename(filePath: string, position: LspPosition): Promise<LspPrepareRenameResult | null> {
    await this.prepareRequest();
    const uri = this.toUri(filePath);
    try {
      const res: any = await this.connection!.sendRequest('textDocument/prepareRename', {
        textDocument: { uri },
        position
      });
      if (!res) return null;
      if (res.range) {
        return { range: res.range, placeholder: res.placeholder };
      }
      if (res.start && res.end) {
        return { range: res };
      }
      return null;
    } catch (err: any) {
      // Server returns error when symbol cannot be renamed
      return null;
    }
  }

  /**
   * Generates exact WorkspaceEdit renaming symbol across the project.
   */
  async rename(filePath: string, position: LspPosition, newName: string): Promise<WorkspaceEditLike> {
    await this.prepareRequest();
    const uri = this.toUri(filePath);
    const res: any = await this.connection!.sendRequest('textDocument/rename', {
      textDocument: { uri },
      position,
      newName
    });
    return res || {};
  }

  /**
   * Computes import updates across workspace when a file is renamed.
   */
  async willRenameFiles(files: Array<{ oldPath: string; newPath: string }>): Promise<WorkspaceEditLike> {
    await this.prepareRequest();
    const lspFiles = files.map(f => ({
      oldUri: this.toUri(f.oldPath),
      newUri: this.toUri(f.newPath)
    }));

    try {
      const res: any = await this.connection!.sendRequest('workspace/willRenameFiles', {
        files: lspFiles
      });
      return res || {};
    } catch {
      return {};
    }
  }

  /**
   * Requests supported code/source actions for a file range.
   */
  async getCodeActions(filePath: string, range: LspRange, kinds?: string[]): Promise<LspCodeAction[]> {
    await this.prepareRequest();
    const uri = this.toUri(filePath);
    const res: any = await this.connection!.sendRequest('textDocument/codeAction', {
      textDocument: { uri },
      range,
      context: {
        only: kinds,
        diagnostics: []
      }
    });
    if (!Array.isArray(res)) return [];
    return res;
  }

  /**
   * Cleanly closes the LSP server.
   */
  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.isClosed = true;
    this.fileWatcher?.close();
    this.fileWatcher = null;
    this.pendingFiles.clear();
    const connection = this.connection;
    const child = this.child;
    this.connection = null;
    this.child = null;
    this.capabilities = null;
    this.closePromise = closeLspTransport(connection, child);
    return this.closePromise;
  }
}

/**
 * Shared registry of live TS7 LSP clients per project root.
 */
const clientRegistry = new Map<string, TsLspClient>();

export function getTsLspClient(projectRoot: string, options?: Partial<TsLspClientOptions>): TsLspClient {
  const normalized = path.resolve(projectRoot);
  let client = clientRegistry.get(normalized);
  if (!client) {
    client = new TsLspClient({ projectRoot: normalized, ...options });
    clientRegistry.set(normalized, client);
  }
  return client;
}

export async function closeAllTsLspClients(): Promise<void> {
  const clients = Array.from(clientRegistry.values());
  clientRegistry.clear();
  await Promise.all(clients.map(c => c.close()));
}
