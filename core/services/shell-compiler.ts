/**
 * Responsibility: Handle natural-language compilation to JavaScript and self-extension (codelet promotion).
 * Scope: Multi-step orchestration using the @dharmax/text-compiler boundary.
 */

import { executeTextCompilerWorkflow } from "./text-compiler-host.ts";
import { withWorkflowStore } from "./sync.ts";
import { stableId } from "../lib/hash.ts";
import { generateCompletion } from "./providers.ts";
import { routeTask } from "./router.ts";
import { upsertProjectCodelet, refreshCodeletRegistry, getProjectCodelet } from "./codelets.ts";
import path from "node:path";
import fs from "node:fs/promises";
import { Script } from "node:vm";

export async function executeCompilerShellPlan(inputText: string, options: any) {
  const root = options.root ?? process.cwd();
  const runId = options.runId ?? stableId("compiler-run", root, inputText, Date.now());
  const isDryRun = options.shellMode === "plan";

  try {
    const result = await withWorkflowStore(root, async (workflowStore) => {
      return executeTextCompilerWorkflow({
        workflowStore,
        prompt: inputText,
        instructions: inputText, 
        runId,
        services: options.services ?? {},
        root,
        planner: options.planner ?? null,
        traceWorkflow: options.traceWorkflow,
        workflowLogger: options.workflowLogger,
      });
    });

    if (!result.ok && result.error) {
      result.error = `Compilation/Execution failed:\n${result.errorReport ?? result.error}`;
    }

    // Self-extension evaluation (Phase 3)
    if (result.ok && result.compiledSource && !isDryRun) {
      const promotion = await evaluateForCodeletPromotion(inputText, result.compiledSource, root);
      if (promotion.recommended) {
        result.promotionAdvice = promotion.advice;
        result.recommendedCodeletName = promotion.name;
      }
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      error: `Compiler fatal error: ${error.message}`,
      status: "error",
      trace: []
    };
  }
}

async function evaluateForCodeletPromotion(prompt: string, code: string, root: string) {
  const route = await routeTask({ root, taskClass: "review" });
  const model = route.recommended;
  
  if (!model) return { recommended: false };

  const system = `You are an Abstraction Auditor. 
Analyze the following JavaScript workflow and determine if it represents a generic, reusable tool or a hyper-specific one-off task.

STRICT REJECTION CRITERIA:
- If the code contains hardcoded ticket IDs (e.g., TKT-123), specific file paths (e.g., "src/auth/login.ts"), or unique string replacements.
- If the task is a simple bug fix or a specific feature implementation.

ACCEPTANCE CRITERIA:
- The flow solves a recurring pattern (e.g., "clean up imports across a module", "summarize all files in a folder").
- The logic can be easily parameterized.
- The flow adds a distinct "capability" to the toolkit.

Return a JSON object:
{
  "recommended": boolean,
  "name": "suggested-kebab-case-name",
  "advice": "1-sentence reasoning for promotion"
}`;

  const userPrompt = `Prompt: ${prompt}\n\nGenerated Code:\n\`\`\`javascript\n${code}\n\`\`\``;

  try {
    const completion = await generateCompletion({
      providerId: model.providerId,
      modelId: model.modelId,
      system,
      prompt: userPrompt,
      config: { host: model.host, apiKey: model.apiKey, format: "json" }
    });

    const parsed = JSON.parse(completion.response);
    return {
      recommended: Boolean(parsed.recommended),
      name: String(parsed.name ?? "unnamed-tool"),
      advice: String(parsed.advice ?? "")
    };
  } catch {
    return { recommended: false };
  }
}

export async function promoteWorkflowToCodelet(root: string, name: string, code: string) {
  const existing = await getProjectCodelet(root, name);
  if (existing) {
    throw new Error(`A codelet named '${name}' already exists in this project.`);
  }

  try {
    new Script(code);
  } catch (e) {
    throw new Error(`Invalid JavaScript syntax in compiled flow: ${e.message}`);
  }

  const stagedDir = path.resolve(root, ".ai-workflow", "staged-codelets");
  const entryPath = path.resolve(stagedDir, `${name}.js`);
  
  await fs.mkdir(stagedDir, { recursive: true });
  await fs.writeFile(entryPath, code, "utf8");
  
  const manifest = await upsertProjectCodelet(root, name, entryPath, "add");

  await withWorkflowStore(root, async (store) => {
    await refreshCodeletRegistry(store, { projectRoot: root });
  });

  return manifest;
}
