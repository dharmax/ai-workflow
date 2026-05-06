
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
  const allFiles = walk(root);
  const cliFiles = allFiles.filter(f => f.includes("cli/lib") && f.endsWith(".ts"));
  const coreFiles = allFiles.filter(f => f.includes("core/services") && f.endsWith(".ts"));

  console.log("Analyzing CLI-to-Core logic bleeding...");
  
  for (const file of cliFiles) {
    const content = readFileSync(file, "utf8");
    const relativePath = relative(root, file);
    if (content.includes("process.stdout.write") || content.includes("console.log")) {
      const lines = content.split("\n");
      if (lines.length > 500) {
        console.log("- [RISK] " + relativePath + " is logic-heavy (" + lines.length + " lines). Consider moving more to Core.");
      }
    }
  }

  for (const file of coreFiles) {
    const content = readFileSync(file, "utf8");
    const relativePath = relative(root, file);
    if (content.includes("process.stdout.write") || content.includes("console.log")) {
       console.log("- [VIOLATION] " + relativePath + " contains terminal output. Should be headless.");
    }
  }
}

run().catch(console.error);
