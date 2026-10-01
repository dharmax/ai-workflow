/**
 * Responsibility: Exact code target resolution for Causal Change Engine.
 * Scope: Maps ChangeTarget (entity, symbol, position, file) to exact ResolvedCodeTarget
 *        using Semantika AST+ Graph, freshness verification, and TS7 LSP definitions.
 * Rules:
 *   - ensureAstFresh() is always called first.
 *   - No guessing between ambiguous symbols: if multiple candidates exist without sufficient context, reject with error.
 *   - No fuzzy semantic retrieval.
 */

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { WorkflowStore } from '../graph/store.ts';
import { SymbolNode, FileNode } from '../graph/ontology.ts';
import { ensureAstFresh } from '../graph/indexer.ts';
import { TsLspClient } from './ts-lsp.ts';
import type { ChangeTarget, ResolvedCodeTarget, LspPosition } from './types.ts';

export async function resolveCodeTarget(
  target: ChangeTarget,
  store: WorkflowStore,
  lspClient: TsLspClient,
  projectRoot: string
): Promise<ResolvedCodeTarget> {
  // 1. Ensure AST graph is fresh before resolving any anchors
  await ensureAstFresh(store, projectRoot);

  let candidateFilePath: string | undefined;
  let candidateSymbolName: string | undefined;
  let candidateContainer: string | undefined;
  let candidatePosition: LspPosition | undefined;
  let graphEntityId: string | undefined;

  switch (target.type) {
    case 'entity': {
      const entity = await store.getEntity<SymbolNode>(target.entityId, SymbolNode.dcr);
      if (!entity) {
        throw new Error(`Target entity '${target.entityId}' not found in AST graph.`);
      }
      graphEntityId = entity.id;
      candidateFilePath = entity.filePath;
      candidateSymbolName = entity.title;
      candidateContainer = entity.containerName;
      if (entity.line !== undefined && entity.column !== undefined) {
        candidatePosition = {
          line: Math.max(0, entity.line - 1),
          character: Math.max(0, entity.column - 1)
        };
      }
      break;
    }

    case 'symbol': {
      candidateFilePath = target.filePath;
      candidateSymbolName = target.symbolName;
      candidateContainer = target.containerName;

      // Find matching symbol in graph
      const query: Record<string, any> = { title: target.symbolName };
      if (target.filePath) {
        const rel = path.isAbsolute(target.filePath) ? path.relative(projectRoot, target.filePath) : target.filePath;
        query.filePath = rel;
      }
      if (target.containerName) {
        query.containerName = target.containerName;
      }

      const matches = await store.listEntities<SymbolNode>(SymbolNode.dcr, query);
      if (matches.length === 0) {
        throw new Error(`Symbol '${target.symbolName}' not found${target.filePath ? ` in ${target.filePath}` : ''}.`);
      }
      if (matches.length > 1) {
        const locations = matches.map(m => `${m.filePath}#${m.title} (line ${m.line})`).join(', ');
        throw new Error(`Ambiguous symbol '${target.symbolName}' found in multiple locations: ${locations}. Specify exact filePath or entity ID.`);
      }

      const match = matches[0];
      graphEntityId = match.id;
      candidateFilePath = match.filePath;
      candidateContainer = match.containerName;
      candidatePosition = {
        line: Math.max(0, (match.line || 1) - 1),
        character: Math.max(0, (match.column || 1) - 1)
      };
      break;
    }

    case 'position': {
      candidateFilePath = target.filePath;
      candidatePosition = {
        line: target.line,
        character: target.character
      };
      break;
    }

    case 'range': {
      const rel = path.isAbsolute(target.filePath) ? path.relative(projectRoot, target.filePath) : target.filePath;
      return {
        filePath: rel,
        symbolName: '',
        position: { line: target.startLine, character: target.startCharacter },
        range: {
          start: { line: target.startLine, character: target.startCharacter },
          end: { line: target.endLine, character: target.endCharacter }
        },
        uri: lspClient.toUri(rel)
      };
    }

    case 'file': {
      const rel = path.isAbsolute(target.filePath) ? path.relative(projectRoot, target.filePath) : target.filePath;
      const fileEntity = await store.getEntity<FileNode>(rel, FileNode.dcr);
      if (!fileEntity) {
        throw new Error(`File '${target.filePath}' not found in AST graph.`);
      }
      return {
        filePath: rel,
        symbolName: path.basename(rel),
        position: { line: 0, character: 0 },
        uri: lspClient.toUri(rel),
        graphEntityId: fileEntity.id
      };
    }
  }

  if (!candidateFilePath || !candidatePosition) {
    throw new Error('Could not resolve file path or position for target.');
  }

  const relFilePath = path.isAbsolute(candidateFilePath)
    ? path.relative(projectRoot, candidateFilePath)
    : candidateFilePath;

  // Scan line to locate exact identifier token position for accurate LSP definition/rename probe
  const absPath = path.resolve(projectRoot, relFilePath);
  if (fs.existsSync(absPath) && candidateSymbolName) {
    try {
      const fileText = fs.readFileSync(absPath, 'utf8');
      const fileLines = fileText.split('\n');
      const targetLine = fileLines[candidatePosition.line];
      if (targetLine) {
        // Search for symbol identifier on this line
        const regex = new RegExp(`\\b${candidateSymbolName}\\b`);
        const match = targetLine.match(regex);
        if (match && match.index !== undefined) {
          candidatePosition = {
            line: candidatePosition.line,
            character: match.index
          };
        }
      }
    } catch {}
  }

  // Ask TS7 LSP for exact definition
  await lspClient.ensureStarted();
  const definitions = await lspClient.getDefinition(relFilePath, candidatePosition);

  let exactPosition = candidatePosition;
  let exactFilePath = relFilePath;

  if (definitions.length > 0) {
    const def = definitions[0];
    exactFilePath = path.relative(projectRoot, lspClient.fromUri(def.uri));
    exactPosition = def.range.start;
  }

  return {
    filePath: exactFilePath,
    symbolName: candidateSymbolName || '',
    containerName: candidateContainer,
    position: exactPosition,
    uri: lspClient.toUri(exactFilePath),
    graphEntityId
  };
}
