import fs from 'node:fs';
import path from 'node:path';
import { getTsLspClient, type LspDocumentSymbol, type TsLspClient } from './ts-lsp.ts';
import type { LspRange } from './types.ts';

/** Exact declaration ranges belong to TypeScript, not the heuristic graph. */
export async function getExactSymbolSource(
  projectRoot: string, filePath: string, symbolName: string,
  client: TsLspClient = getTsLspClient(projectRoot)
): Promise<{ code: string; range: LspRange; kind: number }> {
  if (!/\.[cm]?[jt]sx?$/.test(filePath)) throw new Error('Exact symbol source requires TypeScript/JavaScript.');
  const matches: LspDocumentSymbol[] = [];
  function visit(symbols: LspDocumentSymbol[], container = ''): void {
    for (const symbol of symbols) {
      const fullName = container ? `${container}.${symbol.name}` : symbol.name;
      if (symbol.name === symbolName || fullName === symbolName) matches.push(symbol);
      visit(symbol.children || [], fullName);
    }
  }
  visit(await client.getDocumentSymbols(filePath));
  if (matches.length !== 1) throw new Error(`Expected one exact declaration for '${symbolName}', found ${matches.length}.`);
  const symbol = matches[0];
  const lines = fs.readFileSync(path.resolve(projectRoot, filePath), 'utf8').split('\n');
  const { start, end } = symbol.range;
  const selected = lines.slice(start.line, end.line + 1);
  if (selected.length === 1) selected[0] = selected[0].slice(start.character, end.character);
  else { selected[0] = selected[0].slice(start.character); selected[selected.length - 1] = selected[selected.length - 1].slice(0, end.character); }
  return { code: selected.join('\n'), range: symbol.range, kind: symbol.kind };
}
