/**
 * Responsibility: Codebase walker, incremental freshness monitor, and AST+ Graph indexer using @dharmax/codebase-parser.
 * Scope: Populating and synchronizing the Semantika AST+ Graph with modules, files, symbols, calls, imports, and notes.
 */

import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, statSync, lstatSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { parseIndexedFile } from '@dharmax/codebase-parser';
import { WorkflowStore } from './store.ts';
import type {AbstractEntity} from '@dharmax/semantika';
import type {Stats} from 'node:fs';
import {canonical} from '../kb/canonical.ts';
import {workspacePath} from '../change/workspace-path.ts';
import {
  ModuleNode,
  FileNode,
  SymbolNode,
  TestNode,
  Lesson
} from './ontology.ts';
import {findTestsVerifying, isTestSource, reconcileTestVerificationEdges, testArtifactId, upsertTestArtifact} from './test-artifacts.ts';

const INDEX_EXCLUSIONS = new Set([
  'node_modules', '.git', '.ai-workflow', 'dist', '.idea', '.gemini',
  '.lean-ctx', '.obsidian', 'tmp', 'coverage', '.cache', 'output', 'fixtures', '__fixtures__', 'legacy-reference'
]);

const WORKSPACE_TOOL_DIRS = new Set(['node_modules', '.git', '.ai-workflow', 'dist', '.idea', '.gemini', '.lean-ctx', '.obsidian', '.cache', '.codex', 'coverage']);

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go',
  '.sh', '.bash', '.css', '.scss', '.html', '.riot', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.md', '.markdown'
]);

/** One workspace enumeration owner for structural indexing and literal discovery. */
export async function discoverWorkspaceFiles(rootDir: string): Promise<{files: string[]; scope: string; skippedFiles: string[]; excludedDirectories: string[]}> {
  const git = Bun.spawnSync(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: rootDir, stderr: 'pipe'});
  const files: string[] = [], skippedFiles: string[] = [];
  const admitted = (file: string) => !file.split(path.sep).some(part => WORKSPACE_TOOL_DIRS.has(part));
  if (git.success) {
    for (const file of new Set(git.stdout.toString().split('\0').filter(Boolean))) {
      if (!admitted(file)) continue;
      let relative: string;
      try {relative = workspacePath(rootDir, file);} catch {skippedFiles.push(file); continue;}
      const info = lstatSync(path.resolve(rootDir, relative), {throwIfNoEntry: false});
      if (info?.isFile()) files.push(file);
      else if (info) skippedFiles.push(file);
    }
    return {files: files.sort(), skippedFiles, scope: 'git-tracked-and-unignored-workspace-files', excludedDirectories: [...WORKSPACE_TOOL_DIRS]};
  }
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      if (WORKSPACE_TOOL_DIRS.has(entry.name)) continue;
      const full = path.join(directory, entry.name), relative = path.relative(rootDir, full);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push(relative);
      else skippedFiles.push(relative);
    }
  }
  await walk(rootDir);
  return {files: files.sort(), skippedFiles, scope: 'workspace-files-excluding-tool-directories', excludedDirectories: [...WORKSPACE_TOOL_DIRS]};
}

export function resolveModulePath(relPath: string): string {
  const parts = relPath.split(path.sep);
  if (parts.length === 1) return 'root';
  if (parts[0] === 'src') {
    if (parts.length >= 3) return `src/${parts[1]}`;
    const baseName = path.basename(parts[1], path.extname(parts[1]));
    return `src/${baseName}`;
  }
  return parts[0];
}

export interface IndexResult {
  filesCount: number;
  symbolsCount: number;
  notesCount: number;
  modulesCount: number;
  testsCount: number;
}

export interface IndexOptions {
  onProgress?: (current: number, total: number, label: string) => void;
}

export interface FreshnessResult {
  updatedFiles: string[];
  deletedFiles: string[];
  totalFiles: number;
  isStale: boolean;
}

/**
 * Indexes or updates a single file in the AST+ Graph.
 * Cleans up any prior symbols and notes for this file before re-indexing.
 */
/** Preserve source entity revisions when forced parsing produces identical facts. */
async function upsertSource<T extends AbstractEntity>(store: WorkflowStore, type: typeof FileNode.dcr,
  fields: Record<string, unknown> & {id: string}): Promise<T> {
  const previous = await store.getEntity<T>(fields.id, type);
  if (previous && Object.entries(fields).every(([key, value]) => key === 'id' ||
      canonical((previous as unknown as Record<string, unknown>)[key]) === canonical(value))) return previous;
  return store.upsertEntity<T>(type, fields);
}

type ParsedFile = ReturnType<typeof parseIndexedFile>;
type ParsedSymbol = ParsedFile['symbols'][number];

/** Reconcile only source-derived state; authored work targets survive missing source. */
export async function indexSingleFile(
  store: WorkflowStore, fullPath: string, relPath: string, rootDir: string = store.root
): Promise<{symbolsCount: number; notesCount: number}> {
  return store.withIndexCriticalSection(() => indexSingleFileUnlocked(store, fullPath, relPath, rootDir));
}

async function indexSingleFileUnlocked(
  store: WorkflowStore, fullPath: string, relPath: string, rootDir: string
): Promise<{symbolsCount: number; notesCount: number}> {
  const fileStat = await stat(fullPath);
  const content = await readFile(fullPath, 'utf8');
  const parsed = parseIndexedFile({filePath: relPath, content});
  const modName = resolveModulePath(relPath);
  const module = await store.getEntity<ModuleNode>(`mod:${modName}`, ModuleNode.dcr)
    ?? await store.upsertEntity<ModuleNode>(ModuleNode.dcr, {
      id: `mod:${modName}`, title: modName, path: modName, status: 'implemented'
    });
  const existing = await store.getEntity<FileNode>(relPath, FileNode.dcr);
  if (existing) for (const predicate of ['calls'])
    for (const edge of await store.getOutgoing(existing.id, predicate))
      await store.unrelate(existing.id, predicate, edge.targetId);
  const file = await upsertSource<FileNode>(store, FileNode.dcr, {
    id: relPath, title: path.basename(relPath), path: relPath,
    language: parsed.language, fileKind: parsed.fileKind, size: fileStat.size, mtime: fileStat.mtimeMs,
    status: 'implemented', metadata: {...existing?.metadata, ...parsed.metadata, missing: false, isStub: false, ctimeMs: fileStat.ctimeMs, structureVersion: 2,
      callCandidates: parsed.facts.filter(fact => fact.predicate === 'calls').map(fact => ({
        name: fact.objectText, confidence: fact.confidence, provenance: 'parser-syntax', resolution: 'unresolved'
      }))}
  });
  await store.relate(module, 'contains', file);
  await reconcileFileSymbols(store, file, relPath, parsed.symbols);
  await indexFileImports(store, file, fullPath, rootDir, parsed);
  const test = isTestSource(relPath, content) ? await upsertTestArtifact(store, file, relPath, content) : null;
  if (test) await reconcileTestVerificationEdges(store, test);
  await reconcileFileNotes(store, file, relPath, parsed);
  return {symbolsCount: parsed.symbols.length, notesCount: parsed.notes.length};
}

function symbolKey(name: string, kind: string, container: string | undefined, isStatic: unknown): string {
  return JSON.stringify([container ?? '', kind, name, Boolean(isStatic)]);
}

async function hasAuthoredAnchor(store: WorkflowStore, id: string): Promise<boolean> {
  return (await store.getIncoming(id)).some(edge =>
    ['modifies', 'targets', 'governs'].includes(edge.predicateName) ||
    edge.predicateName === 'verifies' && edge.payload?.state !== 'derived');
}

async function retireSymbol(store: WorkflowStore, symbol: SymbolNode): Promise<void> {
  if (await hasAuthoredAnchor(store, symbol.id))
    await store.upsertEntity(SymbolNode.dcr, {id: symbol.id, status: 'deprecated',
      metadata: {...symbol.metadata, missing: true}});
  else await store.deleteEntity(symbol.id);
}

/** Stable structural keys preserve line-moved declarations, including static and nested members. */
async function reconcileFileSymbols(store: WorkflowStore, file: FileNode, relPath: string, symbols: ParsedSymbol[]): Promise<void> {
  const previous = await store.listEntities<SymbolNode>(SymbolNode.dcr, {filePath: relPath});
  const key = (symbol: ParsedSymbol) => symbolKey(symbol.name, symbol.kind, symbol.containerName, symbol.metadata?.static);
  const oldByKey = new Map<string, SymbolNode[]>();
  for (const symbol of previous) {
    const identity = symbolKey(symbol.title!, symbol.kind!, symbol.containerName, symbol.metadata?.static);
    oldByKey.set(identity, [...oldByKey.get(identity) ?? [], symbol]);
  }
  const counts = new Map<string, number>();
  for (const symbol of symbols) counts.set(key(symbol), (counts.get(key(symbol)) ?? 0) + 1);
  const current = new Set<string>(), byName = new Map<string, SymbolNode[]>();
  const entries: Array<{symbol: ParsedSymbol; entity: SymbolNode}> = [];
  const ownership: Array<{source: FileNode | SymbolNode; target: SymbolNode}> = [];
  for (const symbol of symbols) {
    const old = oldByKey.get(key(symbol)) ?? [];
    const unique = counts.get(key(symbol)) === 1;
    const fullName = [symbol.containerName, symbol.name].filter(Boolean).join('.');
    const id = old.length === 1 && unique ? old[0]!.id
      : `${relPath}#${fullName}:${symbol.kind}${symbol.metadata?.static ? ':static' : ''}${unique ? '' : `:${symbol.line}:${symbol.column}`}`;
    const entity = await upsertSource<SymbolNode>(store, SymbolNode.dcr, {
      id, title: symbol.name, kind: symbol.kind, containerName: symbol.containerName, filePath: relPath,
      line: symbol.line, column: symbol.column, exported: symbol.exported,
      signature: symbol.metadata?.signature, status: 'implemented',
      metadata: {...symbol.metadata, provenance: /\.[cm]?[jt]sx?$/.test(relPath) ? 'oxc-ast' : 'parser-heuristic', missing: false, ambiguousIdentity: !unique}
    });
    current.add(entity.id);
    entries.push({symbol, entity});
    byName.set(fullName, [...byName.get(fullName) ?? [], entity]);
    ownership.push({source: file, target: entity});
  }
  for (const {symbol, entity} of entries) {
    const parents = symbol.containerName ? byName.get(symbol.containerName) : undefined;
    if (parents?.length === 1) ownership.push({source: parents[0]!, target: entity});
  }
  const desired = new Set(ownership.map(({source, target}) => JSON.stringify([source.id, target.id])));
  for (const owner of [file, ...previous]) for (const edge of await store.getOutgoing(owner.id, 'contains'))
    if (edge.targetType === 'SymbolNode' && !desired.has(JSON.stringify([owner.id, edge.targetId])))
      await store.unrelate(owner.id, 'contains', edge.targetId);
  for (const {source, target} of ownership) await store.relate(source, 'contains', target);
  for (const symbol of previous) if (!current.has(symbol.id)) await retireSymbol(store, symbol);
}

/** Imports are structural dependencies, never name-resolved symbol calls. */
async function indexFileImports(store: WorkflowStore, file: FileNode, fullPath: string, rootDir: string, parsed: ParsedFile): Promise<void> {
  const targets = new Set<string>();
  for (const fact of parsed.facts) {
    if (fact.predicate !== 'imports' || typeof fact.objectText !== 'string') continue;
    const specifier = fact.objectText;
    if (!specifier.startsWith('.')) {
      const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      const external = await store.getEntity<ModuleNode>(`mod:@external/${packageName}`, ModuleNode.dcr);
      if (external) {
        targets.add(external.id);
        await store.relate(file, 'imports', external, {state: 'derived', note: 'Parser import specifier'});
        await store.relate(file, 'depends_on', external, {state: 'derived', note: 'Parser import specifier'});
      }
      continue;
    }
    const base = path.resolve(path.dirname(fullPath), specifier);
    const resolved = resolveSourceImport(path.dirname(fullPath), specifier) ?? base;
    const relative = path.relative(rootDir, resolved);
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) continue;
    const target = await store.getEntity<FileNode>(relative, FileNode.dcr)
      ?? await store.upsertEntity<FileNode>(FileNode.dcr, {id: relative, title: path.basename(relative), path: relative,
        status: 'proposed', metadata: {isStub: true}});
    targets.add(target.id);
    await store.relate(file, 'imports', target, {state: 'derived', note: 'Parser import; filesystem candidate, not TS module resolution'});
    await store.relate(file, 'depends_on', target, {state: 'derived', note: 'Parser import; filesystem candidate, not TS module resolution'});
  }
  for (const predicate of ['imports', 'depends_on']) for (const edge of await store.getOutgoing(file.id, predicate))
    if (!targets.has(edge.targetId)) await store.unrelate(file.id, predicate, edge.targetId);
}

async function reconcileFileNotes(store: WorkflowStore, file: FileNode, relPath: string, parsed: ParsedFile): Promise<void> {
  for (const note of await store.listEntities<Lesson>(Lesson.dcr, {filePath: relPath}))
    if (store.localId(note.id).startsWith(`note:${relPath}:`) && !(await hasAuthoredAnchor(store, note.id)))
      await store.deleteEntity(note.id);
  for (const note of parsed.notes) {
    const lesson = await store.upsertEntity<Lesson>(Lesson.dcr, {
      id: `note:${relPath}:${note.line}:${note.column}`, title: `${note.noteType} at ${relPath}:${note.line}`,
      filePath: relPath, noteType: note.noteType || 'TODO', body: note.body, status: 'proposed'
    });
    await store.relate(file, 'contains', lesson);
  }
}

/** Remove derived facts but retain authored targets and unresolved import destinations. */
export async function removeFileFromIndex(store: WorkflowStore, relPath: string): Promise<boolean> {
  return store.withIndexCriticalSection(() => removeFileFromIndexUnlocked(store, relPath));
}

async function removeFileFromIndexUnlocked(store: WorkflowStore, relPath: string): Promise<boolean> {
  const file = await store.getEntity<FileNode>(relPath, FileNode.dcr);
  if (!file || file.metadata?.missing === true) return false;
  const symbols = await store.listEntities<SymbolNode>(SymbolNode.dcr, {filePath: relPath});
  let retain = await hasAuthoredAnchor(store, file.id);
  for (const symbol of symbols) {
    retain ||= await hasAuthoredAnchor(store, symbol.id);
    for (const edge of await store.getOutgoing(symbol.id, 'contains'))
      await store.unrelate(symbol.id, 'contains', edge.targetId);
    await retireSymbol(store, symbol);
  }
  for (const predicate of ['imports', 'depends_on', 'calls', 'contains'])
    for (const edge of await store.getOutgoing(file.id, predicate))
      await store.unrelate(file.id, predicate, edge.targetId);
  retain ||= (await store.getIncoming(file.id)).some(edge => ['imports', 'depends_on'].includes(edge.predicateName));
  if (retain) await store.upsertEntity(FileNode.dcr, {id: file.id, mtime: 0, status: 'deprecated',
    metadata: {...file.metadata, isStub: true, missing: true, callCandidates: []}});
  else await store.deleteEntity(file.id);
  return true;
}

/**
 * Incremental staleness check and auto-refresh using file modification timestamps (mtime).
 * Checks whether any files on disk were created, modified, or deleted since last indexed,
 * and surgically updates only the affected files in milliseconds.
 */
const freshnessScope = new AsyncLocalStorage<Map<WorkflowStore, Map<string, Promise<FreshnessResult>>>>();

/** Reuse one reconciliation inside a bounded, read-only operation. Start a new scope after edits. */
export function withAstSnapshot<T>(operation: () => Promise<T>): Promise<T> {
  return freshnessScope.run(new Map(), operation);
}

export function ensureAstFresh(
  store: WorkflowStore,
  rootDir: string = store.root,
  options?: { force?: boolean; onProgress?: (current: number, total: number, label: string) => void }
): Promise<FreshnessResult> {
  const scope = freshnessScope.getStore();
  const refresh = () => store.isReadOnlyExecution()
    ? reconcileAst(store, rootDir, options) // An actual mutation still fails at the write guard.
    : store.withIndexCriticalSection(() => reconcileAst(store, rootDir, options));
  if (!scope || options?.force) return refresh();
  let roots = scope.get(store);
  if (!roots) { roots = new Map(); scope.set(store, roots); }
  const root = path.resolve(rootDir);
  let pending = roots.get(root);
  if (!pending) { pending = refresh(); roots.set(root, pending); }
  return pending;
}

async function reconcileAst(
  store: WorkflowStore,
  rootDir: string = store.root,
  options?: { force?: boolean; onProgress?: (current: number, total: number, label: string) => void }
): Promise<FreshnessResult> {
  const discovered = await discoverWorkspaceFiles(rootDir);
  const candidateFiles: Array<{fullPath: string; relPath: string; stat: Stats}> = [];
  for (const relPath of discovered.files) {
    if (relPath.split(path.sep).some(part => INDEX_EXCLUSIONS.has(part)) || !SUPPORTED_EXTENSIONS.has(path.extname(relPath).toLowerCase())) continue;
    const fullPath = path.resolve(rootDir, relPath);
    candidateFiles.push({fullPath, relPath, stat: await stat(fullPath)});
  }

  const existingFiles = await store.listEntities<FileNode>(FileNode.dcr);
  const existingMap = new Map<string, { mtime?: number; size?: number; id: string; isExternal?: boolean; isStub?: boolean; ctimeMs?: number; structureVersion?: number }>();
  for (const f of existingFiles) {
    const localId = (f as FileNode & {path?: string}).path ?? store.localId(f.id);
    existingMap.set(localId, {
      mtime: (f as any).mtime,
      size: (f as any).size,
      id: f.id,
      isExternal: Boolean((f as any).metadata?.isExternal),
      isStub: Boolean((f as any).metadata?.isStub),
      ctimeMs: f.metadata?.ctimeMs as number | undefined, structureVersion: f.metadata?.structureVersion as number | undefined
    });
  }

  // Discover and index external workspace dependencies from package.json first
  await indexExternalDependencies(store, rootDir);

  const updatedFiles: string[] = [];
  const visitedRelPaths = new Set<string>();
  const affectedTests = new Map<string, TestNode>();

  const rememberVerifyingTests = async (filePath: string) => {
    const file = await store.getEntity<FileNode>(filePath, FileNode.dcr);
    if (!file) return
    for (const test of await findTestsVerifying(store, file.id)) {
      affectedTests.set(test.id, test)
    }
  };

  for (let i = 0; i < candidateFiles.length; i++) {
    const { fullPath, relPath, stat: s } = candidateFiles[i];
    visitedRelPaths.add(relPath);
    options?.onProgress?.(i + 1, candidateFiles.length, relPath);

    const existing = existingMap.get(relPath);
    const isNew = !existing;
    const isModified = existing && (
      options?.force ||
      !existing.mtime ||
      s.mtimeMs !== existing.mtime ||
      s.size !== existing.size || s.ctimeMs !== existing.ctimeMs || existing.structureVersion !== 2
    );

    if (isNew || isModified) {
      try {
        if (!options?.force) await rememberVerifyingTests(relPath);
        await indexSingleFile(store, fullPath, relPath, rootDir);
        updatedFiles.push(relPath);
      } catch (cause) { throw new Error(`Failed to index ${relPath}`, {cause}); }
    }
  }

  const deletedFiles: string[] = [];
  for (const [relPath, info] of existingMap.entries()) {
    if (info.isExternal || info.isStub) continue;
    if (!visitedRelPaths.has(relPath)) {
      try {
        if (!options?.force) await rememberVerifyingTests(relPath);
        await removeFileFromIndex(store, relPath);
        deletedFiles.push(relPath);
      } catch (cause) { throw new Error(`Failed to remove indexed file ${relPath}`, {cause}); }
    }
  }

  // Dependent test sources did not change. Refresh only their derived verification links.
  if (options?.force) await reconcileTestVerificationEdges(store);
  else if (affectedTests.size) await reconcileTestVerificationEdges(store, [...affectedTests.values()]);

  return {
    updatedFiles,
    deletedFiles,
    totalFiles: candidateFiles.length,
    isStale: updatedFiles.length > 0 || deletedFiles.length > 0
  };
}

/**
 * Discovers and indexes local workspace/file: dependencies from package.json.
 */
/** Index an external public surface through the same declaration reconciliation owner. */
async function indexExternalFile(store: WorkflowStore, fullPath: string, relPath: string, module: ModuleNode) {
  const info = await stat(fullPath);
  const previous = await store.getEntity<FileNode & {mtime?: number; size?: number}>(relPath, FileNode.dcr);
  if (previous?.mtime === info.mtimeMs && previous.size === info.size &&
      previous.metadata?.ctimeMs === info.ctimeMs && previous.metadata?.structureVersion === 2)
    return {changed: false, imports: (previous.metadata.importSpecifiers ?? []) as string[]};
  const parsed = parseIndexedFile({filePath: relPath, content: await readFile(fullPath, 'utf8')});
  const imports = parsed.facts.filter(fact => fact.predicate === 'imports').map(fact => fact.objectText)
    .filter((text): text is string => typeof text === 'string');
  const file = await upsertSource<FileNode>(store, FileNode.dcr, {id: relPath, title: path.basename(fullPath), path: relPath,
    language: parsed.language, fileKind: parsed.fileKind, size: info.size, mtime: info.mtimeMs, status: 'implemented',
    metadata: {...previous?.metadata, isExternal: true, externalPath: fullPath, ctimeMs: info.ctimeMs,
      structureVersion: 2, missing: false, isStub: false, importSpecifiers: imports,
      coverage: 'Exported declarations and members in the package entry and its direct local imports; not the whole dependency.'}});
  await store.relate(module, 'contains', file);
  const publicContainers = parsed.symbols.filter(symbol => symbol.exported && ['class','interface','type','enum','namespace'].includes(symbol.kind))
    .map(symbol => [symbol.containerName, symbol.name].filter(Boolean).join('.'));
  await reconcileFileSymbols(store, file, relPath, parsed.symbols.filter(symbol => symbol.exported ||
    publicContainers.some(container => symbol.containerName === container)));
  return {changed: true, imports};
}

function resolveSourceImport(directory: string, specifier: string): string | undefined {
  const base = path.resolve(directory, specifier);
  return [base, ...['.ts','.tsx','.mts','.cts','.js','.mjs','.cjs'].map(extension => base + extension),
    ...['index.ts','index.tsx','index.js'].map(name => path.join(base, name))]
    .find(file => existsSync(file) && statSync(file).isFile());
}

type DependencyManifest = {
  dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
  exports?: string | Record<string, string | Record<string, string>>; module?: string; main?: string;
};

/** Entry and direct-import coverage is explicit; parsing, identity and retirement have one owner. */
export async function indexExternalDependencies(store: WorkflowStore, rootDir: string): Promise<number> {
  return store.isReadOnlyExecution()
    ? indexExternalDependenciesUnlocked(store, rootDir)
    : store.withIndexCriticalSection(() => indexExternalDependenciesUnlocked(store, rootDir));
}

async function indexExternalDependenciesUnlocked(store: WorkflowStore, rootDir: string): Promise<number> {
  const manifest = path.join(rootDir, 'package.json');
  if (!existsSync(manifest)) return 0;
  const pkg: DependencyManifest = JSON.parse(await readFile(manifest, 'utf8'));
  const retained = new Set<string>();
  let indexed = 0;
  for (const [name, version] of Object.entries({...pkg.dependencies, ...pkg.devDependencies})) {
    if (!version.startsWith('file:') && !version.startsWith('link:')) continue;
    const dependency = path.resolve(rootDir, version.slice(5));
    const dependencyManifest = path.join(dependency, 'package.json');
    if (!existsSync(dependencyManifest)) continue; // Uninstalled optional local dependency is not source evidence.
    try {
      const fields: DependencyManifest = JSON.parse(await readFile(dependencyManifest, 'utf8'));
      const rootExport = typeof fields.exports === 'string' ? fields.exports : fields.exports?.['.'] ?? fields.exports;
      const conditions = typeof rootExport === 'object' ? rootExport : {};
      const entries = [rootExport, conditions.bun, conditions.import, conditions.default, fields.module, fields.main,
        'src/index.ts','src/index.js','index.ts','index.js'].filter((value): value is string => typeof value === 'string');
      const entry = entries.map(file => path.resolve(dependency, file)).find(file => existsSync(file) && statSync(file).isFile());
      if (!entry) continue;
      const module = await store.getEntity<ModuleNode>(`mod:@external/${name}`, ModuleNode.dcr)
        ?? await store.upsertEntity<ModuleNode>(ModuleNode.dcr, {id: `mod:@external/${name}`, title: `@external/${name}`,
          path: `@external/${name}`, status: 'implemented'});
      const entryId = `${name}/${path.relative(dependency, entry)}`;
      const result = await indexExternalFile(store, entry, entryId, module);
      retained.add(entryId);
      if (result.changed) indexed++;
      for (const specifier of new Set(result.imports.filter(specifier => specifier.startsWith('.')))) {
        const full = resolveSourceImport(path.dirname(entry), specifier);
        if (!full || full === entry) continue;
        const relative = path.relative(dependency, full);
        if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) continue;
        const id = `${name}/${relative}`;
        const imported = await indexExternalFile(store, full, id, module);
        retained.add(id);
        if (imported.changed) indexed++;
      }
    } catch (cause) {throw new Error(`Failed to index local dependency ${name}`, {cause});}
  }
  for (const file of await store.listEntities<FileNode>(FileNode.dcr))
    if (file.metadata?.isExternal && !retained.has(String((file as FileNode & {path?: string}).path ?? store.localId(file.id))))
      await removeFileFromIndex(store, String((file as FileNode & {path?: string}).path ?? store.localId(file.id)));
  return indexed;
}

/**
 * Full codebase indexer (scans all files and external dependencies).
 */
export async function indexCodebase(
  store: WorkflowStore,
  rootDir: string = store.root,
  options?: IndexOptions
): Promise<IndexResult> {
  return store.withIndexCriticalSection(() => indexCodebaseUnlocked(store, rootDir, options));
}

async function indexCodebaseUnlocked(
  store: WorkflowStore, rootDir: string, options?: IndexOptions
): Promise<IndexResult> {
  const freshness = await ensureAstFresh(store, rootDir, { force: true, onProgress: options?.onProgress });

  const allFiles = await store.listEntities<FileNode>(FileNode.dcr);
  for (const symbol of await store.listEntities<SymbolNode>(SymbolNode.dcr))
    if (!symbol.filePath && (symbol.kind === 'call-candidate' || store.localId(symbol.id) === symbol.title)
        && !(await store.getIncoming(symbol.id)).length && !(await store.getOutgoing(symbol.id)).length)
      await store.deleteEntity(symbol.id);

  const allSymbols = await store.listEntities<SymbolNode>(SymbolNode.dcr);
  const allNotes = await store.listEntities<Lesson>(Lesson.dcr);
  const allModules = await store.listEntities<ModuleNode>(ModuleNode.dcr);
  const allTests = await store.listEntities<TestNode>(TestNode.dcr);

  return {
    filesCount: allFiles.length,
    symbolsCount: allSymbols.length,
    notesCount: allNotes.length,
    modulesCount: allModules.length,
    testsCount: allTests.length
  };
}
