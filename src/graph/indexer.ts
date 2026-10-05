/**
 * Responsibility: Codebase walker, incremental freshness monitor, and AST+ Graph indexer using @dharmax/codebase-parser.
 * Scope: Populating and synchronizing the Semantika AST+ Graph with modules, files, symbols, calls, imports, and notes.
 */

import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { parseIndexedFile } from '@dharmax/codebase-parser';
import { WorkflowStore } from './store.ts';
import {
  ModuleNode,
  FileNode,
  SymbolNode,
  TestNode,
  Lesson
} from './ontology.ts';
import {isTestFilePath, testArtifactId, upsertTestArtifact} from './test-artifacts.ts';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.ai-workflow', 'dist', '.idea', '.gemini',
  '.lean-ctx', '.obsidian', 'tmp', 'coverage', '.cache', 'output', 'fixtures', '__fixtures__', 'legacy-reference'
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go',
  '.sh', '.bash', '.css', '.scss', '.html', '.riot', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.md', '.markdown'
]);

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
export async function indexSingleFile(
  store: WorkflowStore,
  fullPath: string,
  relPath: string,
  rootDir: string = store.root
): Promise<{ symbolsCount: number; notesCount: number }> {
  const fileStat = await stat(fullPath);
  const content = await readFile(fullPath, 'utf8');
  const parsed = parseIndexedFile({ filePath: relPath, content });

  const modName = resolveModulePath(relPath);
  const modEntity = await store.upsertEntity<ModuleNode>(ModuleNode.dcr, {
    id: `mod:${modName}`,
    title: modName,
    path: modName,
    status: 'implemented'
  });

  // Clean up previous file notes for this relPath using filtered query (symbols are stably reconciled below)
  const existingNotes = await store.listEntities<Lesson>(Lesson.dcr, { filePath: relPath });
  for (const n of existingNotes) {
    if (!store.localId(n.id).startsWith(`note:${relPath}:`)) continue;
    try { await store.deleteEntity(n.id); } catch {}
  }

  const existingFile = await store.getEntity<FileNode>(relPath, FileNode.dcr);
  if (existingFile) {
    const outImports = await store.getOutgoing(existingFile.id, 'imports');
    for (const p of outImports) {
      try { await store.unrelate(existingFile.id, 'imports', p.targetId); } catch {}
    }

    const outDeps = await store.getOutgoing(existingFile.id, 'depends_on');
    for (const p of outDeps) {
      try { await store.unrelate(existingFile.id, 'depends_on', p.targetId); } catch {}
    }

    const outCalls = await store.getOutgoing(existingFile.id, 'calls');
    for (const p of outCalls) {
      try { await store.unrelate(existingFile.id, 'calls', p.targetId); } catch {}
    }
  }

  const fileEntity = await store.upsertEntity<FileNode>(FileNode.dcr, {
    id: relPath,
    title: path.basename(relPath),
    path: relPath,
    language: parsed.language,
    fileKind: parsed.fileKind,
    size: fileStat.size,
    mtime: fileStat.mtimeMs,
    status: 'implemented',
    metadata: parsed.metadata
  });

  await store.relate(modEntity, 'contains', fileEntity);

  const testArtifact = isTestFilePath(relPath)
    ? await upsertTestArtifact(store, fileEntity, relPath, content)
    : null;

  if (!testArtifact) {
    const staleTest = await store.getEntity<TestNode>(testArtifactId(relPath), TestNode.dcr);
    if (staleTest) {
      try { await store.deleteEntity(staleTest.id); } catch {}
    }
  }

  // 1. Reconcile symbols stably: do NOT blindly delete existing symbols.
  // Group old and new symbols by stable key: containerName + kind + name
  const existingSymbols = await store.listEntities<SymbolNode>(SymbolNode.dcr, { filePath: relPath });
  const oldByKey = new Map<string, SymbolNode[]>();
  for (const s of existingSymbols) {
    const key = `${s.containerName || ''}::${s.kind}::${s.title}`;
    const list = oldByKey.get(key) || [];
    list.push(s);
    oldByKey.set(key, list);
  }

  const newByKey = new Map<string, typeof parsed.symbols>();
  for (const sym of parsed.symbols) {
    const key = `${sym.containerName || ''}::${sym.kind}::${sym.name}`;
    const list = newByKey.get(key) || [];
    list.push(sym);
    newByKey.set(key, list);
  }

  // Set of old entity IDs that were matched and preserved
  const preservedOldIds = new Set<string>();
  const containerEntities = new Map<string, SymbolNode>();
  let symbolsCount = 0;

  // Process new symbols: either update uniquely matched old entity, or create new
  for (const sym of parsed.symbols) {
    symbolsCount++;
    const key = `${sym.containerName || ''}::${sym.kind}::${sym.name}`;
    const oldMatches = oldByKey.get(key) || [];
    const newMatches = newByKey.get(key) || [];

    let symbolEntity: SymbolNode;
    // Exactly one old and one new symbol share this key: update old entity in place
    if (oldMatches.length === 1 && newMatches.length === 1) {
      const oldEntity = oldMatches[0];
      preservedOldIds.add(oldEntity.id);
      await oldEntity.update({
        line: sym.line,
        column: sym.column,
        exported: sym.exported,
        signature: sym.metadata?.signature,
        status: 'implemented',
        updatedAt: new Date().toISOString()
      }, true, false);
      symbolEntity = oldEntity;
    } else {
      // Unmatched or ambiguous duplicate key: create new symbol entity
      const containerPrefix = sym.containerName ? `${sym.containerName}.` : '';
      const symbolId = `${relPath}#${containerPrefix}${sym.name}:${sym.line}:${sym.column}`;
      symbolEntity = await store.upsertEntity<SymbolNode>(SymbolNode.dcr, {
        id: symbolId,
        title: sym.name,
        containerName: sym.containerName,
        filePath: relPath,
        kind: sym.kind,
        exported: sym.exported,
        line: sym.line,
        column: sym.column,
        signature: sym.metadata?.signature,
        status: 'implemented'
      });
    }

    try {
      await store.relate(fileEntity, 'contains', symbolEntity);
    } catch {}

    if (!sym.containerName && ['class', 'interface', 'enum', 'struct', 'trait'].includes(sym.kind)) {
      containerEntities.set(sym.name, symbolEntity);
    }
  }

  // Delete unmatched old symbols that were not preserved
  for (const oldSym of existingSymbols) {
    if (!preservedOldIds.has(oldSym.id)) {
      try {
        const referenced = (await store.getIncoming(oldSym.id)).some(edge => ['modifies', 'targets', 'governs'].includes(edge.predicateName));
        if (referenced) await store.upsertEntity(SymbolNode.dcr, { id: oldSym.id, status: 'deprecated', metadata: { missing: true } });
        else await store.deleteEntity(oldSym.id);
      } catch {}
    }
  }

  // 2. Relate container entity to its members (e.g. Class contains Method)
  for (const sym of parsed.symbols) {
    if (sym.containerName && containerEntities.has(sym.containerName)) {
      const parentEntity = containerEntities.get(sym.containerName)!;
      const key = `${sym.containerName}::${sym.kind}::${sym.name}`;
      const oldMatches = oldByKey.get(key) || [];
      const newMatches = newByKey.get(key) || [];

      let memberEntity: SymbolNode | null = null;
      if (oldMatches.length === 1 && newMatches.length === 1 && preservedOldIds.has(oldMatches[0].id)) {
        memberEntity = oldMatches[0];
      } else {
        const containerPrefix = `${sym.containerName}.`;
        const symbolId = `${relPath}#${containerPrefix}${sym.name}:${sym.line}:${sym.column}`;
        memberEntity = await store.getEntity<SymbolNode>(symbolId, SymbolNode.dcr);
      }

      if (memberEntity) {
        try {
          await store.relate(parentEntity, 'contains', memberEntity);
        } catch {}
      }
    }
  }

  // 3. Index static imports, dependencies, and calls
  for (const fact of parsed.facts) {
    if (fact.predicate === 'imports' && typeof fact.objectText === 'string') {
      const importSpec = fact.objectText;
      if (importSpec.startsWith('.')) {
        const absDir = path.dirname(fullPath);
        let resolved = path.resolve(absDir, importSpec);
        if (!existsSync(resolved)) {
          if (existsSync(`${resolved}.ts`)) resolved = `${resolved}.ts`;
          else if (existsSync(`${resolved}.tsx`)) resolved = `${resolved}.tsx`;
          else if (existsSync(`${resolved}.js`)) resolved = `${resolved}.js`;
          else if (existsSync(path.join(resolved, 'index.ts'))) resolved = path.join(resolved, 'index.ts');
          else if (existsSync(path.join(resolved, 'index.js'))) resolved = path.join(resolved, 'index.js');
        }
        const targetRel = path.relative(rootDir, resolved);

        try {
          let targetFileEntity = await store.getEntity<FileNode>(targetRel, FileNode.dcr);
          if (!targetFileEntity) {
            targetFileEntity = await store.upsertEntity<FileNode>(FileNode.dcr, {
              id: targetRel,
              title: path.basename(targetRel),
              path: targetRel,
              status: 'implemented',
              metadata: { isStub: true }
            });
          }
          await store.relate(fileEntity, 'imports', targetFileEntity);
          await store.relate(fileEntity, 'depends_on', targetFileEntity);
          if (testArtifact && targetRel !== relPath) {
            await store.relate(testArtifact, 'verifies', targetFileEntity, {
              state: 'derived',
              note: 'Static test import'
            });
          }
        } catch {}
      } else {
        // External package or built-in import (e.g. @test/mylib, lodash)
        try {
          let targetEntity = await store.getEntity<ModuleNode>(`mod:@external/${importSpec}`, ModuleNode.dcr);
          if (!targetEntity) {
            const allFiles = await store.listEntities<FileNode>(FileNode.dcr);
            targetEntity = allFiles.find(f => (f as any).id.includes(importSpec)) || null as any;
          }
          if (targetEntity) {
            await store.relate(fileEntity, 'imports', targetEntity);
            await store.relate(fileEntity, 'depends_on', targetEntity);
          }
        } catch {}
      }
    } else if (fact.predicate === 'calls' && typeof fact.objectText === 'string') {
      const callee = fact.objectText;
      try {
        let targetSym = await store.getEntity<SymbolNode>(callee, SymbolNode.dcr);
        if (!targetSym) {
          const matchingSyms = await store.listEntities<SymbolNode>(SymbolNode.dcr, { title: callee });
          targetSym = matchingSyms[0] || null;
        }
        if (!targetSym) {
          targetSym = await store.upsertEntity<SymbolNode>(SymbolNode.dcr, {
            id: callee,
            title: callee,
            kind: 'function',
            status: 'implemented'
          });
        }
        await store.relate(fileEntity, 'calls', targetSym);
      } catch {}
    }
  }

  // 4. Index in-code notes (BUG, FIXME, TODO)
  let notesCount = 0;
  for (const note of parsed.notes) {
    notesCount++;
    const noteId = `note:${relPath}:${note.line}:${note.column}`;
    const lesson = await store.upsertEntity<Lesson>(Lesson.dcr, {
      id: noteId,
      title: `${note.noteType} at ${relPath}:${note.line}`,
      filePath: relPath,
      noteType: (note.noteType as any) || 'TODO',
      body: note.body,
      status: 'proposed'
    });

    await store.relate(fileEntity, 'contains', lesson);
  }

  return { symbolsCount, notesCount };
}

/**
 * Removes a file and all its contained symbols and notes from the AST+ Graph.
 */
export async function removeFileFromIndex(store: WorkflowStore, relPath: string): Promise<boolean> {
  const fileEntity = await store.getEntity<FileNode>(relPath, FileNode.dcr);
  if (!fileEntity) return false;

  const contained = await store.getOutgoing(fileEntity.id, 'contains');
  // A deleted source is still a durable work target. Keep its anchors so investigation
  // can report the missing file rather than silently erase Ticket/Decision intent.
  for (const id of [fileEntity.id, ...contained.map(edge => edge.targetId)]) {
    if ((await store.getIncoming(id)).some(edge => ['modifies', 'targets', 'governs'].includes(edge.predicateName))) {
      await store.upsertEntity(FileNode.dcr, { id: fileEntity.id, mtime: 0, status: 'deprecated', metadata: { isStub: true, missing: true } });
      return true;
    }
  }
  for (const pred of contained) {
    try {
      await store.deleteEntity(pred.targetId);
    } catch {}
  }

  await store.deleteEntity(fileEntity.id);
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
  if (!scope || options?.force) return reconcileAst(store, rootDir, options);
  let roots = scope.get(store);
  if (!roots) { roots = new Map(); scope.set(store, roots); }
  const root = path.resolve(rootDir);
  let pending = roots.get(root);
  if (!pending) { pending = reconcileAst(store, rootDir, options); roots.set(root, pending); }
  return pending;
}

async function reconcileAst(
  store: WorkflowStore,
  rootDir: string = store.root,
  options?: { force?: boolean; onProgress?: (current: number, total: number, label: string) => void }
): Promise<FreshnessResult> {
  const candidateFiles: Array<{ fullPath: string; relPath: string; stat: any }> = [];

  async function walk(currentDir: string) {
    let entries: any[] = [];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
        try {
          const s = await stat(fullPath);
          candidateFiles.push({ fullPath, relPath, stat: s });
        } catch {}
      }
    }
  }

  await walk(rootDir);

  const existingFiles = await store.listEntities<FileNode>(FileNode.dcr);
  const existingMap = new Map<string, { mtime?: number; size?: number; id: string; isExternal?: boolean; isStub?: boolean }>();
  for (const f of existingFiles) {
    const localId = store.localId(f.id);
    existingMap.set(localId, {
      mtime: (f as any).mtime,
      size: (f as any).size,
      id: f.id,
      isExternal: Boolean((f as any).metadata?.isExternal),
      isStub: Boolean((f as any).metadata?.isStub)
    });
  }

  // Discover and index external workspace dependencies from package.json first
  await indexExternalDependencies(store, rootDir);

  const updatedFiles: string[] = [];
  const visitedRelPaths = new Set<string>();

  for (let i = 0; i < candidateFiles.length; i++) {
    const { fullPath, relPath, stat: s } = candidateFiles[i];
    visitedRelPaths.add(relPath);
    options?.onProgress?.(i + 1, candidateFiles.length, relPath);

    const existing = existingMap.get(relPath);
    const isNew = !existing;
    const isModified = existing && (
      options?.force ||
      !existing.mtime ||
      s.mtimeMs > (existing.mtime || 0) ||
      s.size !== existing.size
    );

    if (isNew || isModified) {
      try {
        await indexSingleFile(store, fullPath, relPath, rootDir);
        updatedFiles.push(relPath);
      } catch {}
    }
  }

  const deletedFiles: string[] = [];
  for (const [relPath, info] of existingMap.entries()) {
    if (info.isExternal || info.isStub) continue;
    if (!visitedRelPaths.has(relPath)) {
      try {
        await removeFileFromIndex(store, relPath);
        deletedFiles.push(relPath);
      } catch {}
    }
  }

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
export async function indexExternalDependencies(store: WorkflowStore, rootDir: string): Promise<number> {
  const pkgJsonPath = path.join(rootDir, 'package.json');
  let indexedCount = 0;

  try {
    const pkgRaw = await readFile(pkgJsonPath, 'utf8');
    const pkg = JSON.parse(pkgRaw);
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    for (const [depName, depVersion] of Object.entries(deps)) {
      if (typeof depVersion === 'string' && depVersion.startsWith('file:')) {
        const depRel = depVersion.slice(5);
        const depRoot = path.resolve(rootDir, depRel);
        const depPkgPath = path.join(depRoot, 'package.json');

        try {
          const depPkgRaw = await readFile(depPkgPath, 'utf8');
          const depPkg = JSON.parse(depPkgRaw);

          const candidates = [
            depPkg.exports?.['.']?.bun,
            depPkg.exports?.['.']?.default,
            depPkg.exports?.['.']?.import,
            depPkg.exports?.['.'],
            depPkg.module,
            depPkg.main,
            'src/index.ts',
            'src/index.js',
            'index.ts',
            'index.js'
          ].filter(Boolean);

          let entryFile: string | null = null;
          let entryRel: string = '';
          for (const c of candidates) {
            const p = path.resolve(depRoot, c);
            if (existsSync(p)) {
              entryFile = p;
              entryRel = path.relative(depRoot, p);
              break;
            }
          }

          if (entryFile) {
            const entryContent = await readFile(entryFile, 'utf8');
            const filesToIndex: Array<{ fullPath: string; relPath: string; content: string }> = [
              { fullPath: entryFile, relPath: `${depName}/${entryRel}`, content: entryContent }
            ];

            const reExportMatches = [...entryContent.matchAll(/export\s+(?:\*|\{[^}]+\})\s+from\s+['"]([^'"]+)['"]/g)];
            for (const m of reExportMatches) {
              const targetRel = m[1];
              if (!targetRel.startsWith('.')) continue;
              let candidatePath = path.resolve(path.dirname(entryFile), targetRel);
              if (!existsSync(candidatePath)) {
                if (existsSync(`${candidatePath}.ts`)) candidatePath = `${candidatePath}.ts`;
                else if (existsSync(`${candidatePath}.js`)) candidatePath = `${candidatePath}.js`;
              }
              if (existsSync(candidatePath)) {
                try {
                  const targetContent = await readFile(candidatePath, 'utf8');
                  const relToDep = path.relative(depRoot, candidatePath);
                  filesToIndex.push({
                    fullPath: candidatePath,
                    relPath: `${depName}/${relToDep}`,
                    content: targetContent
                  });
                } catch {}
              }
            }

            const modName = `@external/${depName}`;
            for (const fileItem of filesToIndex) {
              const fileStat = existsSync(fileItem.fullPath) ? await stat(fileItem.fullPath) : { size: fileItem.content.length, mtimeMs: Date.now() };
              const existing = await store.getEntity<FileNode & { mtime?: number; size?: number; metadata?: { externalPath?: string } }>(fileItem.relPath, FileNode.dcr);
              if (existing?.mtime === fileStat.mtimeMs && existing.size === fileStat.size && existing.metadata?.externalPath === fileItem.fullPath) continue;
              const parsed = parseIndexedFile({ filePath: fileItem.relPath, content: fileItem.content });
              const modEntity = await store.getEntity<ModuleNode>(`mod:${modName}`, ModuleNode.dcr)
                || await store.upsertEntity<ModuleNode>(ModuleNode.dcr, {
                  id: `mod:${modName}`, title: modName, path: modName, status: 'implemented'
                });
              if (existing) {
                const oldSymbols = await store.listEntities<SymbolNode>(SymbolNode.dcr, { filePath: fileItem.relPath });
                for (const symbol of oldSymbols) await store.deleteEntity(symbol.id);
              }

              const fileEntity = await store.upsertEntity<FileNode>(FileNode.dcr, {
                id: fileItem.relPath,
                title: path.basename(fileItem.fullPath),
                path: fileItem.relPath,
                language: parsed.language,
                fileKind: parsed.fileKind,
                size: fileStat.size,
                mtime: fileStat.mtimeMs,
                status: 'implemented',
                metadata: { isExternal: true, externalPath: fileItem.fullPath }
              });

              await store.relate(modEntity, 'contains', fileEntity);
              indexedCount++;

              for (const sym of parsed.symbols) {
                if (!sym.exported) continue;
                const containerPrefix = sym.containerName ? `${sym.containerName}.` : '';
                const symbolId = `${fileItem.relPath}#${containerPrefix}${sym.name}:${sym.line}:${sym.column}`;
                const symbolEntity = await store.upsertEntity<SymbolNode>(SymbolNode.dcr, {
                  id: symbolId,
                  title: sym.name,
                  containerName: sym.containerName,
                  filePath: fileItem.relPath,
                  kind: sym.kind,
                  exported: true,
                  line: sym.line,
                  column: sym.column,
                  signature: sym.metadata?.signature,
                  status: 'implemented'
                });

                await store.relate(fileEntity, 'contains', symbolEntity);
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  return indexedCount;
}

/**
 * Full codebase indexer (scans all files and external dependencies).
 */
export async function indexCodebase(
  store: WorkflowStore,
  rootDir: string = store.root,
  options?: IndexOptions
): Promise<IndexResult> {
  const freshness = await ensureAstFresh(store, rootDir, { force: true, onProgress: options?.onProgress });

  const allFiles = await store.listEntities<FileNode>(FileNode.dcr);
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
