import { readFile } from "node:fs/promises";
import path from "node:path";
/**
 * Responsibility: Provide project high-level summary.
 */
import { getProjectSummary } from "../services/sync.ts";


export async function run(_args: any, hub: any) {
  const root = hub.context.projectRoot;
  const summary = await getProjectSummary({ projectRoot: root });
  
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    summary.projectName = pkg.name;
    summary.projectVersion = pkg.version;
  } catch (e) {}
  
  return summary;
}
