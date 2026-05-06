import type { ServiceHub } from "../services/service-hub.ts";\n\nexport async function run(args: any, hub: ServiceHub) {\n  
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function walk(dir: string): string[] {
  let results: string[] = [];
  try {
    const list = readdirSync(dir);
    list.forEach(file => {
      file = join(dir, file);
      const stat = statSync(file);
      if (stat && stat.isDirectory()) { 
        results = results.concat(walk(file));
      } else { 
        results.push(file);
      }
    });
  } catch (e) {}
  return results;
}

async function run() {
  const root = process.cwd();
  const coreFiles = walk(join(root, "core/services")).filter(f => f.endsWith(".ts"));

  console.log("Searching for trapped non-headless logic in Core...");
  
  for (const file of coreFiles) {
    const content = readFileSync(file, "utf8");
    const relativePath = relative(root, file);
    const violations = content.match(/process\\.stdout\\.write|console\\.log|readline\\.createInterface/g);
    if (violations) {
      console.log("- " + relativePath + ": Found " + violations.length + " terminal artifacts.");
    }
  }
}

run().catch(console.error);
\n}