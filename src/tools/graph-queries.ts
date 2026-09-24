/**
 * Responsibility: AST+ Graph Queries, Symbol Search, Slicing, and Impact Analysis Facility.
 * Scope: High-density symbol lookup, graph search/traversal, surgical code slicing, file outlines, and blast radius calculation.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { WorkflowStore } from '../graph/store.ts';
import { SymbolNode, FileNode, Ticket } from '../graph/ontology.ts';
import { ensureAstFresh } from '../graph/indexer.ts';

export function registerGraphTools() {
  registry.register({
    name: 'find_symbol',
    description: 'Look up AST symbols across the codebase by exact name, fuzzy substring, regex, or kind filter with automatic freshness sync.',
    category: 'graph',
    parameters: z.object({
      name: z.string().describe('Symbol name to search for (e.g. WorkflowStore, compileCodelet, or regex pattern)'),
      filePath: z.string().optional().describe('Optional file path filter'),
      kind: z.string().optional().describe('Optional symbol kind filter (e.g. function, class, method, interface, type, enum, variable, constant)'),
      exact: z.boolean().optional().describe('Require exact symbol name match'),
      regex: z.boolean().optional().describe('Treat search name as a regular expression'),
      exportedOnly: z.boolean().optional().describe('Filter for exported symbols only'),
      limit: z.number().optional().describe('Maximum number of results to return (default: 50)')
    }),
    execute: async ({ name, filePath, kind, exact, regex, exportedOnly, limit = 50 }, ctx: ToolContext) => {
      // Auto-refresh AST graph if any source files changed
      await ensureAstFresh(ctx.store, ctx.projectRoot);

      const symbols = await ctx.store.listEntities<SymbolNode>(SymbolNode.dcr);
      const queryLower = name.toLowerCase();

      let nameTester: (symTitle: string, containerTitle?: string) => { matched: boolean; score: number };

      if (regex) {
        try {
          const reg = new RegExp(name, 'i');
          nameTester = (title: string, container?: string) => {
            const full = container ? `${container}.${title}` : title;
            const matched = reg.test(title) || reg.test(full);
            return { matched, score: matched ? 1 : 0 };
          };
        } catch {
          nameTester = (title: string) => ({ matched: title.toLowerCase() === queryLower, score: 2 });
        }
      } else if (exact) {
        nameTester = (title: string, container?: string) => {
          const full = container ? `${container}.${title}` : title;
          if (title.toLowerCase() === queryLower) return { matched: true, score: 3 };
          if (full.toLowerCase() === queryLower) return { matched: true, score: 2 };
          return { matched: false, score: 0 };
        };
      } else {
        nameTester = (title: string, container?: string) => {
          const tLower = title.toLowerCase();
          const fullLower = container ? `${container.toLowerCase()}.${tLower}` : tLower;

          if (tLower === queryLower) return { matched: true, score: 10 };
          if (fullLower === queryLower) return { matched: true, score: 9 };
          if (tLower.startsWith(queryLower)) return { matched: true, score: 7 };
          if (fullLower.startsWith(queryLower)) return { matched: true, score: 6 };
          if (tLower.includes(queryLower)) return { matched: true, score: 4 };
          if (fullLower.includes(queryLower)) return { matched: true, score: 3 };
          return { matched: false, score: 0 };
        };
      }

      const results: Array<{
        name: string;
        containerName?: string;
        fullName: string;
        filePath: string;
        kind: string;
        exported: boolean;
        line: number;
        column: number;
        signature?: string;
        score: number;
      }> = [];

      for (const s of symbols) {
        const title = (s as any).title || '';
        const container = (s as any).containerName;
        const symFilePath = (s as any).filePath || '';
        const symKind = (s as any).kind || 'symbol';
        const exported = Boolean((s as any).exported);

        if (filePath && !symFilePath.toLowerCase().includes(filePath.toLowerCase())) continue;
        if (kind && symKind.toLowerCase() !== kind.toLowerCase()) continue;
        if (exportedOnly && !exported) continue;

        const testRes = nameTester(title, container);
        if (!testRes.matched) continue;

        results.push({
          name: title,
          containerName: container || undefined,
          fullName: container ? `${container}.${title}` : title,
          filePath: symFilePath,
          kind: symKind,
          exported,
          line: (s as any).line || 1,
          column: (s as any).column || 0,
          signature: (s as any).signature || undefined,
          score: testRes.score
        });
      }

      results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
        return a.line - b.line;
      });

      return results.slice(0, limit);
    }
  });

  registry.register({
    name: 'search_graph',
    description: 'Query and traverse the AST+ Knowledge Graph across entities, predicates, and semantic connections (callers, dependencies, dependents, containment, implementation).',
    category: 'graph',
    parameters: z.object({
      query: z.string().optional().describe('Text query to filter entity title, ID, or body'),
      entityType: z.enum([
        'SymbolNode',
        'FileNode',
        'ModuleNode',
        'Ticket',
        'Epic',
        'Lesson',
        'Decision',
        'TestNode',
        'Artifact'
      ]).optional().describe('Filter by specific entity type in the Semantika ontology'),
      predicate: z.enum([
        'calls',
        'contains',
        'imports',
        'depends_on',
        'implements',
        'modifies',
        'addresses',
        'targets',
        'verifies',
        'fuzzy_relates',
        'potentially_affects',
        'governs',
        'blocks',
        'inspires',
        'generates'
      ]).optional().describe('Filter by semantic predicate relationship'),
      sourceId: z.string().optional().describe('Find connections originating from this entity ID'),
      targetId: z.string().optional().describe('Find connections pointing to this entity ID'),
      direction: z.enum(['incoming', 'outgoing', 'both']).optional().describe('Direction of predicate relations (default: both)'),
      maxDepth: z.number().min(1).max(3).optional().describe('Depth of graph traversal from sourceId or targetId (default: 1)'),
      limit: z.number().optional().describe('Maximum number of items to return (default: 50)')
    }),
    execute: async ({ query, entityType, predicate, sourceId, targetId, direction = 'both', maxDepth = 1, limit = 50 }, ctx: ToolContext) => {
      // Auto-refresh AST graph before query
      await ensureAstFresh(ctx.store, ctx.projectRoot);

      // Traversal mode if sourceId or targetId is supplied with depth > 1
      const startId = sourceId || targetId;
      if (startId && maxDepth > 1) {
        const travRes = await ctx.store.traverse(startId, {
          maxDepth,
          direction: direction as any,
          predicateTypes: predicate ? [predicate] : undefined,
          limit
        });

        return {
          mode: 'traversal',
          startId,
          depth: maxDepth,
          entitiesCount: travRes.entities.length,
          predicatesCount: travRes.predicates.length,
          entities: travRes.entities.map(e => ({
            id: ctx.store.localId(e.id),
            rawId: e.id,
            title: (e as any).title,
            type: e.constructor.name,
            status: (e as any).status,
            path: (e as any).path || (e as any).filePath
          })),
          predicates: travRes.predicates.map(p => ({
            predicate: p.predicateName,
            sourceId: ctx.store.localId(p.sourceId),
            targetId: ctx.store.localId(p.targetId)
          }))
        };
      }

      // Predicate query mode if sourceId, targetId, or predicate is supplied
      if (sourceId || targetId || predicate) {
        const predicates: any[] = [];

        if (sourceId && (direction === 'outgoing' || direction === 'both')) {
          const out = await ctx.store.getOutgoing(sourceId, predicate);
          if (out.length > 0) {
            predicates.push(...out);
          } else {
            let matchingSyms = await ctx.store.listEntities<SymbolNode>(SymbolNode.dcr, { title: sourceId });
            if (matchingSyms.length === 0) {
              const syms = await ctx.store.listEntities<SymbolNode>(SymbolNode.dcr);
              matchingSyms = syms.filter(s =>
                (s as any).title?.toLowerCase() === sourceId.toLowerCase() ||
                ((s as any).containerName && `${(s as any).containerName}.${(s as any).title}`.toLowerCase() === sourceId.toLowerCase())
              );
            }
            for (const ms of matchingSyms) {
              const symOut = await ctx.store.getOutgoing(ms.id, predicate);
              predicates.push(...symOut);
            }
          }
        }
        if (targetId && (direction === 'incoming' || direction === 'both')) {
          const inc = await ctx.store.getIncoming(targetId, predicate);
          if (inc.length > 0) {
            predicates.push(...inc);
          } else {
            let matchingSyms = await ctx.store.listEntities<SymbolNode>(SymbolNode.dcr, { title: targetId });
            if (matchingSyms.length === 0) {
              const syms = await ctx.store.listEntities<SymbolNode>(SymbolNode.dcr);
              matchingSyms = syms.filter(s =>
                (s as any).title?.toLowerCase() === targetId.toLowerCase() ||
                ((s as any).containerName && `${(s as any).containerName}.${(s as any).title}`.toLowerCase() === targetId.toLowerCase())
              );
            }
            for (const ms of matchingSyms) {
              const symInc = await ctx.store.getIncoming(ms.id, predicate);
              predicates.push(...symInc);
            }
          }
        }
        if (!sourceId && !targetId && predicate) {
          const pDcr = (ctx.store.sp.ontology as any).pdcr(predicate);
          if (pDcr) {
            const col = await ctx.store.sp.predicateCollection(pDcr);
            const found = await col.findSome<any>({ predicateName: predicate }, { limit });
            predicates.push(...found);
          }
        }

        const mappedPreds = predicates.slice(0, limit).map(p => ({
          predicate: p.predicateName,
          sourceId: ctx.store.localId(p.sourceId),
          targetId: ctx.store.localId(p.targetId)
        }));

        return {
          mode: 'predicate_search',
          predicateFilter: predicate || 'all',
          count: mappedPreds.length,
          results: mappedPreds
        };
      }

      // Entity query mode
      const typeList = entityType ? [entityType] : [
        'SymbolNode', 'FileNode', 'ModuleNode', 'Ticket', 'Epic', 'Lesson', 'Decision', 'TestNode'
      ];

      const matchedEntities: any[] = [];
      const qLower = (query || '').toLowerCase();

      for (const tName of typeList) {
        try {
          const dcr = ctx.store.getDescriptor(tName);
          const entities = await ctx.store.listEntities(dcr);
          for (const ent of entities) {
            const title = ((ent as any).title || '').toLowerCase();
            const id = ent.id.toLowerCase();
            const body = ((ent as any).body || '').toLowerCase();
            const filePath = ((ent as any).filePath || (ent as any).path || '').toLowerCase();

            if (!qLower || title.includes(qLower) || id.includes(qLower) || body.includes(qLower) || filePath.includes(qLower)) {
              matchedEntities.push({
                id: ctx.store.localId(ent.id),
                type: ent.constructor.name,
                title: (ent as any).title,
                kind: (ent as any).kind,
                filePath: (ent as any).filePath || (ent as any).path,
                line: (ent as any).line,
                status: (ent as any).status
              });
            }
            if (matchedEntities.length >= limit) break;
          }
        } catch {}
        if (matchedEntities.length >= limit) break;
      }

      return {
        mode: 'entity_search',
        query: query || '*',
        count: matchedEntities.length,
        results: matchedEntities
      };
    }
  });

  registry.register({
    name: 'get_symbol_source',
    description: 'Extract a surgical slice of a function or class source code without dumping the entire file.',
    category: 'graph',
    parameters: z.object({
      filePath: z.string().describe('Relative path to the source file'),
      symbolName: z.string().describe('Name of the symbol to slice (e.g. WorkflowStore or WorkflowStore.claimTicket)')
    }),
    execute: async ({ filePath, symbolName }, ctx: ToolContext) => {
      await ensureAstFresh(ctx.store, ctx.projectRoot);

      let fullPath = path.resolve(ctx.projectRoot, filePath);
      if (!fs.existsSync(fullPath)) {
        const fileNode = await ctx.store.getEntity<FileNode>(filePath);
        if (fileNode && (fileNode as any).metadata?.externalPath && fs.existsSync((fileNode as any).metadata.externalPath)) {
          fullPath = (fileNode as any).metadata.externalPath;
        } else {
          throw new Error(`File not found: ${filePath}`);
        }
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      const symbols = await ctx.store.listEntities<SymbolNode>(SymbolNode.dcr);
      const sym = symbols.find(s => {
        const fileMatches = ((s as any).filePath || '').endsWith(filePath);
        const titleMatches = ((s as any).title || '').toLowerCase() === symbolName.toLowerCase();
        const container = (s as any).containerName || '';
        const fullMatches = container ? `${container}.${(s as any).title}`.toLowerCase() === symbolName.toLowerCase() : false;
        return fileMatches && (titleMatches || fullMatches);
      });

      if (!sym) {
        return {
          filePath,
          symbolName,
          startLine: null,
          lineCount: 0,
          code: null
        };
      }

      const startLine = (sym as any).line ? Math.max(1, (sym as any).line) : 1;
      const sliceLines = lines.slice(startLine - 1, startLine + 49); // 50-line window

      return {
        filePath,
        symbolName: (sym as any).title || symbolName,
        startLine,
        endLine: startLine + sliceLines.length - 1,
        lineCount: sliceLines.length,
        code: sliceLines.join('\n')
      };
    }
  });

  registry.register({
    name: 'get_file_outline',
    description: 'Get a concise outline of all exported symbols, classes, functions, and interfaces in a file.',
    category: 'graph',
    parameters: z.object({
      filePath: z.string().describe('Relative path to the source file')
    }),
    execute: async ({ filePath }, ctx: ToolContext) => {
      await ensureAstFresh(ctx.store, ctx.projectRoot);

      const normPath = filePath.startsWith('/') ? path.relative(ctx.projectRoot, filePath) : filePath;
      const symbols = await ctx.store.listEntities<SymbolNode>(SymbolNode.dcr);
      const matched = symbols.filter(s => ((s as any).filePath || '').endsWith(normPath));

      const mapped = matched.map(s => ({
        name: (s as any).title,
        containerName: (s as any).containerName || undefined,
        fullName: (s as any).containerName ? `${(s as any).containerName}.${(s as any).title}` : (s as any).title,
        kind: (s as any).kind || 'symbol',
        exported: (s as any).exported,
        line: (s as any).line || 1,
        signature: (s as any).signature || undefined
      }));

      mapped.sort((a, b) => a.line - b.line);

      return {
        file: normPath,
        symbolCount: mapped.length,
        signatures: mapped,
        symbols: mapped
      };
    }
  });

  registry.register({
    name: 'analyze_blast_radius',
    description: 'Calculate the dependency blast radius before modifying a file: finds impacted files, linked tickets, and recommended tests.',
    category: 'graph',
    parameters: z.object({
      target: z.string().describe('File path or module to analyze')
    }),
    execute: async ({ target }, ctx: ToolContext) => {
      await ensureAstFresh(ctx.store, ctx.projectRoot);
      return analyzeBlastRadius(ctx.store, target, ctx.projectRoot);
    }
  });

  registry.register({
    name: 'estimate_token_budget',
    description: 'Calculate estimated token consumption for targeted files to prevent context window blowouts.',
    category: 'graph',
    parameters: z.object({
      filePaths: z.array(z.string()).describe('List of file paths to estimate')
    }),
    execute: async ({ filePaths }, ctx: ToolContext) => {
      const estimates: Array<{ file: string; characters: number; estimatedTokens: number }> = [];
      let totalChars = 0;

      for (const fp of filePaths) {
        const full = path.resolve(ctx.projectRoot, fp);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          const content = fs.readFileSync(full, 'utf8');
          const chars = content.length;
          const estimatedTokens = Math.round(chars / 3.8);
          totalChars += chars;
          estimates.push({ file: fp, characters: chars, estimatedTokens });
        }
      }

      const totalEstimatedTokens = Math.round(totalChars / 3.8);
      const risk = totalEstimatedTokens > 16000 ? 'High' : totalEstimatedTokens > 6000 ? 'Medium' : 'Low';

      return {
        fileCount: estimates.length,
        totalEstimatedTokens,
        contextRisk: risk,
        files: estimates
      };
    }
  });
}

export async function analyzeBlastRadius(
  store: WorkflowStore,
  target: string,
  _projectRoot: string
) {
  const incomingDeps = await store.getIncoming(target, 'depends_on');
  const incomingImports = await store.getIncoming(target, 'imports');

  const directFiles = await store.listEntities<FileNode>(FileNode.dcr);
  const matchedDirect = directFiles.filter(f => f.id.includes(target) || (f as any).path?.includes(target));

  const affectedFileIds = new Set<string>();
  for (const f of matchedDirect) affectedFileIds.add(store.localId(f.id));
  for (const d of incomingDeps) affectedFileIds.add(store.localId(d.sourceId));
  for (const i of incomingImports) affectedFileIds.add(store.localId(i.sourceId));

  const recommendedTests: string[] = [];
  for (const fileId of affectedFileIds) {
    if (fileId.includes('test') || fileId.endsWith('.test.ts') || fileId.endsWith('.spec.ts')) {
      recommendedTests.push(fileId);
    }
  }

  const tickets = await store.listEntities<Ticket>(Ticket.dcr);
  const activeTickets = tickets
    .filter(t => (t as any).lane !== 'Done' && Array.from(affectedFileIds).some(fid => (t as any).body?.includes(fid)))
    .map(t => ({ id: store.localId(t.id), title: (t as any).title, lane: (t as any).lane }));

  return {
    target,
    affectedFilesCount: affectedFileIds.size,
    affectedFiles: Array.from(affectedFileIds),
    activeTickets,
    dependentTickets: activeTickets,
    recommendedTests: recommendedTests.length > 0 ? recommendedTests : ['bun test']
  };
}
