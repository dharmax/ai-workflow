import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseIndexedFile } from '@dharmax/codebase-parser';
import { WorkflowStore } from './store.ts';
import type { CodeNote } from './types.ts';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.ai-workflow', 'dist', '.idea', '.gemini', 
  '.lean-ctx', '.obsidian', 'tmp', 'coverage', '.cache', 'output'
]);

const SUPPORTED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', 
  '.sh', '.bash', '.css', '.scss', '.html', '.riot', '.vue', '.svelte', 
  '.json', '.yaml', '.yml', '.toml', '.md', '.markdown'
]);

export async function indexCodebase(store: WorkflowStore, rootDir: string = store.root): Promise<{ filesCount: number; symbolsCount: number; notesCount: number }> {
  let filesCount = 0;
  let symbolsCount = 0;
  let notesCount = 0;

  // Prune deleted file and module entities
  const existingModules = store.listEntities({ type: 'module' });
  for (const mod of existingModules) {
    const modDir = path.join(rootDir, mod.title);
    if (!existsSync(modDir)) {
      store.deleteEntity(mod.id);
    }
  }

  const existingFiles = store.listEntities({ type: 'file' });
  for (const f of existingFiles) {
    const fullPath = path.join(rootDir, f.id);
    if (!existsSync(fullPath)) {
      store.deleteEntity(f.id);
    }
  }

  async function walk(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        const moduleTitle = relPath.split(path.sep)[0];
        store.upsertEntity({
          id: `mod:${moduleTitle}`,
          type: 'module',
          title: moduleTitle,
          status: 'implemented'
        });
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTS.has(ext)) continue;

        try {
          const content = await readFile(fullPath, 'utf8');
          const parsed = parseIndexedFile({ filePath: relPath, content });
          filesCount++;

          store.transaction(() => {
            const fileEntity = store.upsertEntity({
              id: relPath,
              type: 'file',
              title: entry.name,
              status: 'implemented',
              metadata: {
                language: parsed.language,
                fileKind: parsed.fileKind,
                size: content.length,
                ...parsed.metadata
              }
            });

            const parentMod = relPath.includes(path.sep) ? relPath.split(path.sep)[0] : 'root';
            store.addRelation({
              fromId: `mod:${parentMod}`,
              toId: fileEntity.id,
              relation: 'contains'
            });

            // Index AST symbols
            for (const sym of parsed.symbols) {
              symbolsCount++;
              const symbolId = `${relPath}#${sym.name}`;
              store.upsertEntity({
                id: symbolId,
                type: 'symbol',
                title: sym.name,
                status: 'implemented',
                metadata: {
                  kind: sym.kind,
                  exported: sym.exported,
                  line: sym.line,
                  column: sym.column
                }
              });
              store.addRelation({
                fromId: fileEntity.id,
                toId: symbolId,
                relation: 'contains'
              });
            }

            // Index import dependencies
            for (const fact of parsed.facts) {
              if (fact.predicate === 'imports' && typeof fact.objectText === 'string') {
                store.addRelation({
                  fromId: fileEntity.id,
                  toId: fact.objectText,
                  relation: 'depends_on'
                });
              }
            }

            // Index in-code notes (TODO, FIXME, BUG)
            const notes: CodeNote[] = parsed.notes.map((n: any) => ({
              filePath: relPath,
              line: n.line,
              column: n.column ?? 0,
              noteType: n.noteType as any,
              body: n.body
            }));
            notesCount += notes.length;
            store.saveCodeNotes(relPath, notes);
          });

        } catch {
          // Skip unreadable / binary files gracefully
        }
      }
    }
  }

  await walk(rootDir);
  return { filesCount, symbolsCount, notesCount };
}
