/**
 * Responsibility: Codebase walker and AST+ Graph indexer using @dharmax/codebase-parser.
 * Scope: Populating the Semantika AST+ Graph with modules, files, symbols, calls, imports, and notes.
 */

import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { parseIndexedFile } from '@dharmax/codebase-parser';
import { WorkflowStore } from './store.ts';
import {
  ModuleNode,
  FileNode,
  SymbolNode,
  Lesson
} from './ontology.ts';

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
}

export interface IndexOptions {
  onProgress?: (current: number, total: number, label: string) => void;
}

export async function indexCodebase(
  store: WorkflowStore,
  rootDir: string = store.root,
  options?: IndexOptions
): Promise<IndexResult> {
  let filesCount = 0;
  let symbolsCount = 0;
  let notesCount = 0;
  const walkedFiles = new Set<string>();
  const discoveredModules = new Set<string>();
  const candidateFiles: Array<{ fullPath: string; relPath: string }> = [];

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

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
        candidateFiles.push({ fullPath, relPath });
      }
    }
  }

  await walk(rootDir);

  for (let i = 0; i < candidateFiles.length; i++) {
    const { fullPath, relPath } = candidateFiles[i];
    options?.onProgress?.(i + 1, candidateFiles.length, relPath);

    try {
      const content = await readFile(fullPath, 'utf8');
      const parsed = parseIndexedFile({ filePath: relPath, content });
      filesCount++;
      walkedFiles.add(relPath);

      const modName = resolveModulePath(relPath);
      discoveredModules.add(modName);

      const modEntity = await store.upsertEntity<ModuleNode>(ModuleNode.dcr, {
        id: `mod:${modName}`,
        title: modName,
        path: modName,
        status: 'implemented'
          });

          const fileEntity = await store.upsertEntity<FileNode>(FileNode.dcr, {
            id: relPath,
            title: path.basename(relPath),
            path: relPath,
            language: parsed.language,
            fileKind: parsed.fileKind,
            size: content.length,
            status: 'implemented',
            metadata: parsed.metadata
          });

          await store.relate(modEntity, 'contains', fileEntity);

          // Index AST symbols
          for (const sym of parsed.symbols) {
            symbolsCount++;
            const symbolId = `${relPath}#${sym.name}`;
            const symbolEntity = await store.upsertEntity<SymbolNode>(SymbolNode.dcr, {
              id: symbolId,
              title: sym.name,
              filePath: relPath,
              kind: sym.kind,
              exported: sym.exported,
              line: sym.line,
              column: sym.column,
              status: 'implemented'
            });

            await store.relate(fileEntity, 'contains', symbolEntity);
          }

          // Index static imports and dependencies
          for (const fact of parsed.facts) {
            if (fact.predicate === 'imports' && typeof fact.objectText === 'string') {
              try {
                await store.relate(fileEntity, 'imports', fact.objectText);
                await store.relate(fileEntity, 'depends_on', fact.objectText);
              } catch {}
            }
          }

          // Index in-code notes (BUG, FIXME, TODO)
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
        } catch {
          // Skip unreadable files
        }
      }

  // 2. Discover and index local workspace/file: dependencies from package.json
  const pkgJsonPath = path.join(rootDir, 'package.json');
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

          // Find candidate entrypoint file
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
          const { existsSync } = await import('node:fs');
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

            // Resolve barrel re-exports (e.g. `export * from './actor.ts'`)
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
            discoveredModules.add(modName);

            const modEntity = await store.upsertEntity<ModuleNode>(ModuleNode.dcr, {
              id: `mod:${modName}`,
              title: modName,
              path: modName,
              status: 'implemented'
            });

            for (const fileItem of filesToIndex) {
              const parsed = parseIndexedFile({ filePath: fileItem.relPath, content: fileItem.content });
              const fileEntity = await store.upsertEntity<FileNode>(FileNode.dcr, {
                id: fileItem.relPath,
                title: path.basename(fileItem.fullPath),
                path: fileItem.relPath,
                language: parsed.language,
                fileKind: parsed.fileKind,
                size: fileItem.content.length,
                status: 'implemented',
                metadata: { isExternal: true, externalPath: fileItem.fullPath }
              });

              walkedFiles.add(fileItem.relPath);
              filesCount++;
              await store.relate(modEntity, 'contains', fileEntity);

              for (const sym of parsed.symbols) {
                if (!sym.exported) continue;
                symbolsCount++;
                const symbolId = `${fileItem.relPath}#${sym.name}`;
                const symbolEntity = await store.upsertEntity<SymbolNode>(SymbolNode.dcr, {
                  id: symbolId,
                  title: sym.name,
                  filePath: fileItem.relPath,
                  kind: sym.kind,
                  exported: true,
                  line: sym.line,
                  column: sym.column,
                  status: 'implemented'
                });

                await store.relate(fileEntity, 'contains', symbolEntity);
              }
            }
          }
        } catch {
          // Ignore unresolvable local dependency
        }
      }
    }
  } catch {
    // No package.json or invalid JSON
  }

  // Prune deleted files
  const existingFiles = await store.listEntities<FileNode>(FileNode.dcr);
  for (const f of existingFiles) {
    const localId = store.localId(f.id);
    if (!walkedFiles.has(localId)) {
      await store.deleteEntity(f.id);
    }
  }

  return {
    filesCount,
    symbolsCount,
    notesCount,
    modulesCount: discoveredModules.size
  };
}
