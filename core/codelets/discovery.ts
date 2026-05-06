/**
 * Responsibility: Discover exported symbols matching a pattern.
 */
import { withWorkflowStore } from "../services/sync.ts";


export async function run(options: { pattern?: string | null }, hub: any) {
  const pattern = options.pattern || null;
  return withWorkflowStore(hub.context.projectRoot, async (store) => {
    const symbols = store.listSymbols();
    const filtered = symbols.filter((s: any) => 
      s.exported && (!pattern || s.name.includes(pattern) || s.filePath.includes(pattern))
    );
    return filtered.map((s: any) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      filePath: s.filePath,
      line: s.line
    }));
  });
}
