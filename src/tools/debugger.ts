/**
 * Responsibility: Interactive Debugger, Stack Trace Slicer, and AST Diagnosis Facility.
 * Scope: Slicing error locations, resolving enclosing AST symbols, mapping stack traces, and blast diagnostics.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import type { WorkflowStore } from '../graph/store.ts';
import { SymbolNode } from '../model/ontology.ts';
import { ensureAstFresh, withAstSnapshot } from '../graph/indexer.ts';
import { analyzeBlastRadius } from './graph-queries.ts';

export interface DebugLocation {
  filePath: string;
  line: number;
  column?: number;
  snippet: string;
  enclosingSymbol?: {
    name: string;
    kind: string;
    startLine: number;
  };
}

export interface DebugReport {
  target: string;
  resolvedKind: 'location' | 'symbol' | 'stack_trace';
  locations: DebugLocation[];
  symbolDetails?: {
    name: string;
    kind: string;
    filePath: string;
    codeSlice: string;
  };
  blastRadius?: {
    affectedFiles: string[];
    recommendedTests: string[];
  };
}

/**
 * Extract 1-indexed snippet around a target line with pointer markers.
 */
export function extractLineSnippet(
  filePath: string,
  targetLine: number,
  projectRoot: string,
  windowSize = 4
): string {
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
  if (!fs.existsSync(absPath)) return `[File not found: ${filePath}]`;

  try {
    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split('\n');
    const start = Math.max(1, targetLine - windowSize);
    const end = Math.min(lines.length, targetLine + windowSize);

    const out: string[] = [];
    for (let i = start; i <= end; i++) {
      const lineText = lines[i - 1] ?? '';
      const isTarget = i === targetLine;
      const marker = isTarget ? '\x1b[1;31m➜\x1b[0m' : ' ';
      const lineNum = String(i).padStart(4, ' ');
      out.push(`${marker} \x1b[90m${lineNum} |\x1b[0m ${isTarget ? `\x1b[1;37m${lineText}\x1b[0m` : lineText}`);
    }
    return out.join('\n');
  } catch (err: any) {
    return `[Failed to read ${filePath}: ${err.message}]`;
  }
}

/**
 * Parses stack trace or location strings into concrete file locations.
 */
export function parseLocations(input: string, projectRoot: string): Array<{ filePath: string; line: number; col?: number }> {
  const results: Array<{ filePath: string; line: number; col?: number }> = [];

  // Match pattern: filePath:line[:col]
  const directMatch = input.trim().match(/^([^:\s]+):(\d+)(?::(\d+))?$/);
  if (directMatch) {
    return [{
      filePath: directMatch[1],
      line: parseInt(directMatch[2], 10),
      col: directMatch[3] ? parseInt(directMatch[3], 10) : undefined
    }];
  }

  // Match stack frames: at ... (filePath:line:col) or at filePath:line:col
  const stackRegex = /(?:at\s+(?:async\s+)?(?:.+?\s+\()?)?([a-zA-Z0-9_\-\./\\]+\.(?:ts|js|tsx|jsx)):(\d+)(?::(\d+))?\)?/g;
  let match: RegExpExecArray | null;

  while ((match = stackRegex.exec(input)) !== null) {
    const rawPath = match[1];
    const line = parseInt(match[2], 10);
    const col = match[3] ? parseInt(match[3], 10) : undefined;

    const rel = rawPath.startsWith('/') ? path.relative(projectRoot, rawPath) : rawPath;
    if (!rel.includes('node_modules') && !results.some(r => r.filePath === rel && r.line === line)) {
      results.push({ filePath: rel, line, col });
    }
  }

  return results;
}

/**
 * Diagnostic analysis across AST graph, source slicing, and blast radius.
 */
export async function diagnoseTarget(
  store: WorkflowStore,
  target: string,
  projectRoot: string
): Promise<DebugReport> {
  return withAstSnapshot(async () => {
    await ensureAstFresh(store, projectRoot);
    const locations = parseLocations(target, projectRoot);

    if (locations.length > 0) {
      const debugLocations: DebugLocation[] = [];

      for (const loc of locations.slice(0, 5)) {
        const snippet = extractLineSnippet(loc.filePath, loc.line, projectRoot);

        // Query AST symbol enclosing this line
        let enclosingSymbol: DebugLocation['enclosingSymbol'];
        const fileSymbols = await store.listEntities<SymbolNode>(SymbolNode.dcr, {
          filePath: loc.filePath
        });

        // Find closest symbol starting before or at targetLine
        let closest: SymbolNode | undefined;
        for (const s of fileSymbols) {
          const sLine = s.line || 1;
          if (sLine <= loc.line && (!closest || sLine > (closest.line || 1))) {
            closest = s;
          }
        }

        if (closest) {
          enclosingSymbol = {
            name: closest.title!,
            kind: closest.kind || 'symbol',
            startLine: closest.line || 1
          };
        }

        debugLocations.push({
          filePath: loc.filePath,
          line: loc.line,
          column: loc.col,
          snippet,
          enclosingSymbol
        });
      }

      const blast = await analyzeBlastRadius(store, locations[0].filePath, projectRoot);

      return {
        target,
        resolvedKind: locations.length > 1 ? 'stack_trace' : 'location',
        locations: debugLocations,
        blastRadius: {
          affectedFiles: blast.affectedFiles,
          recommendedTests: blast.recommendedTests
        }
      };
    }

    // Symbol lookup mode
    const symbols = await store.listEntities<SymbolNode>(SymbolNode.dcr, { title: target });
    const sym = symbols.find(symbol => symbol.status !== 'deprecated' && symbol.filePath);
    if (sym) {
      const filePath = sym.filePath!;
      const snippet = extractLineSnippet(filePath, sym.line || 1, projectRoot, 6);
      const blast = await analyzeBlastRadius(store, target, projectRoot);

      return {
        target,
        resolvedKind: 'symbol',
        locations: [{
          filePath,
          line: sym.line || 1,
          snippet,
          enclosingSymbol: { name: sym.title!, kind: sym.kind || 'symbol', startLine: sym.line || 1 }
        }],
        symbolDetails: {
          name: sym.title!,
          kind: sym.kind || 'symbol',
          filePath,
          codeSlice: snippet
        },
        blastRadius: {
          affectedFiles: blast.affectedFiles,
          recommendedTests: blast.recommendedTests
        }
      };
    }

    return {
      target,
      resolvedKind: 'location',
      locations: [{
        filePath: target,
        line: 1,
        snippet: extractLineSnippet(target, 1, projectRoot)
      }]
    };
  });
}

export function registerDebuggerTools() {
  registry.register({
    name: 'debug_target',
    description: 'Diagnose a symbol, source file:line location, or stack trace with code slicing and blast analysis.',
    category: 'test',
    parameters: z.object({
      target: z.string().describe('Symbol name, file:line target, or error stack trace snippet')
    }),
    execute: async ({ target }, ctx: ToolContext) => {
      ctx.signal?.throwIfAborted();
      const report = await diagnoseTarget(ctx.store, target, ctx.projectRoot);
      ctx.signal?.throwIfAborted();
      return report;
    }
  });
}
