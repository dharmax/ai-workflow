/**
 * Responsibility: AST+ Graph Queries, Slicing, and Impact Analysis Facility.
 * Scope: High-density symbol lookup, surgical code slicing, file outlines, and blast radius calculation.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { WorkflowStore } from '../graph/store.ts';
import { SymbolNode, FileNode, Ticket } from '../graph/ontology.ts';

export function registerGraphTools() {
  registry.register({
    name: 'find_symbol',
    description: 'Look up an AST symbol across the codebase by name or partial identifier.',
    category: 'graph',
    parameters: z.object({
      name: z.string().describe('Symbol name to search for (e.g. WorkflowStore, compileCodelet)'),
      filePath: z.string().optional().describe('Optional file path filter')
    }),
    execute: async ({ name, filePath }, ctx: ToolContext) => {
      const symbols = await ctx.store.listEntities<SymbolNode>(SymbolNode.dcr);
      const query = name.toLowerCase();

      const matched = symbols.filter(s => {
        const titleMatch = ((s as any).title || '').toLowerCase().includes(query);
        if (filePath) {
          const fileMatch = ((s as any).filePath || '').includes(filePath);
          return titleMatch && fileMatch;
        }
        return titleMatch;
      });

      return matched.map(s => ({
        name: (s as any).title,
        filePath: (s as any).filePath,
        kind: (s as any).kind,
        exported: (s as any).exported,
        line: (s as any).line,
        column: (s as any).column
      }));
    }
  });

  registry.register({
    name: 'get_symbol_source',
    description: 'Extract a surgical slice of a function or class source code without dumping the entire file.',
    category: 'graph',
    parameters: z.object({
      filePath: z.string().describe('Relative path to the source file'),
      symbolName: z.string().describe('Name of the symbol to slice')
    }),
    execute: async ({ filePath, symbolName }, ctx: ToolContext) => {
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
      const sym = symbols.find(s =>
        ((s as any).filePath || '').endsWith(filePath) &&
        ((s as any).title || '').toLowerCase() === symbolName.toLowerCase()
      );

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
      const normPath = filePath.startsWith('/') ? path.relative(ctx.projectRoot, filePath) : filePath;
      const symbols = await ctx.store.listEntities<SymbolNode>(SymbolNode.dcr);
      const matched = symbols.filter(s => ((s as any).filePath || '').endsWith(normPath));

      const mapped = matched.map(s => ({
        name: (s as any).title,
        kind: (s as any).kind || 'symbol',
        exported: (s as any).exported,
        line: (s as any).line || 1
      }));

      return {
        file: normPath,
        symbolCount: matched.length,
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
