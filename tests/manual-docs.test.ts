import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildShellContext, buildShellPlannerPrompt } from "aiwf-shell/cli/lib/shell";
import { renderManualHtml } from "../aiwf-common-core/core/lib/manual-html.ts";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runNode(args: string[], options: any = {}) {
  try {
    const { stdout, stderr } = await execFileAsync("bun", args, {
      ...options,
      maxBuffer: 8 * 1024 * 1024
    });
    return {
      code: 0,
      stdout,
      stderr
    };
  } catch (error: any) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message
    };
  }
}

test("renderManualHtml emits semantic HTML with toc and source hash", () => {
  const markdown = [
    "# ai-workflow Manual",
    "",
    "## Shell Mode",
    "",
    "- Use `ai-workflow shell` for planning.",
    "",
    "## Configuration Reference",
    "",
    "```bash",
    "ai-workflow config set providers.ollama.host http://127.0.0.1:11434",
    "```"
  ].join("\n");

  const html = renderManualHtml(markdown, { sourcePath: "docs/MANUAL.md" });
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<nav aria-labelledby="manual-toc-heading">/);
  assert.match(html, /<section aria-labelledby="shell-mode"/);
  assert.match(html, /manual-source-sha1/);
  assert.match(html, /<pre data-block-kind="code"><code class="language-bash">/);
});

test("public docs expose install, usage, capability limits, and the managed-project freshness rule", async () => {
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
  const manual = await readFile(path.join(repoRoot, "docs", "MANUAL.md"), "utf8");

  assert.match(readme, /\[docs\/MANUAL\.md\]\(docs\/MANUAL\.md\)/);
  assert.match(readme, /bun add -g github:dharmax\/ai-workflow/);
  assert.match(readme, /How Smart Is The Shell/);
  assert.match(readme, /How Strong Is Plugin Enforcement/);
  assert.match(manual, /## Capability Status/);
  assert.match(manual, /### Semi-Works/);
  assert.match(manual, /### Does Not Work Yet, But Is Planned/);
  assert.match(manual, /## Shell Intelligence And Enforcement/);
  assert.match(manual, /## Plugin And Managed-Project Enforcement/);
  assert.doesNotMatch(`${readme}\n${manual}`, /npm install|npm run|node cli\/ai-workflow|node \.\/node_modules\/tsx|tsx scripts\//);
  assert.match(manual, /run_codelet/);
  assert.match(manual, /apply: true/);
});

test("initialized projects receive the public-documentation freshness rule and audit baseline", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-doc-freshness-"));
  const rule = "Keep the project README and full documentation current whenever public behavior, installation, commands, configuration, limitations, or planned capability changes.";

  try {
    const initResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"),
      "--target",
      targetRoot,
      "--no-sync"
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    for (const relativePath of ["AGENTS.md", "execution-protocol.md", "project-guidelines.md"]) {
      assert.equal((await readFile(path.join(targetRoot, relativePath), "utf8")).includes(rule), true);
    }
    assert.match(await readFile(path.join(targetRoot, "enforcement.md"), "utf8"), /keep-public-docs-current/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("buildShellContext loads the canonical manual and planner prompt surfaces manual guidance", async () => {
  const root = path.resolve("/tmp/ai-workflow-manual-shell-" + Math.random().toString(36).slice(2));
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(path.join(root, "docs", "MANUAL.md"), [
    "# ai-workflow Manual",
    "",
    "## Configuration Reference",
    "",
    "- `providers.ollama.host` sets the primary Ollama URL.",
    "- `providers.ollama.plannerModel` is a manual override."
  ].join("\n"), "utf8");

  try {
    await writeFile(path.join(root, "project-guidelines.md"), [
      "# Project Guidelines",
      "",
      "- Operator-surface changes are not done until `ai-workflow dogfood` and `workflow-audit` both pass."
    ].join("\n"), "utf8");
    const context = await buildShellContext(root);
    assert.match(context.manual ?? "", /providers\.ollama\.host/);
    assert.equal(Array.isArray(context.activeGuardrails), true);
    assert.equal((context.activeGuardrails as any[]).some((item) => /workflow-audit/.test(item.summary)), true);

    const prompt = await buildShellPlannerPrompt("how do i configure ollama host?", {
      root,
      plannerContext: {
        ...context,
        toolkitCodelets: [],
        projectCodelets: [],
        summary: { activeTickets: [] },
        providerState: { providers: {} }
      },
      history: []
    });

    assert.match(prompt.prompt, /## Guidance Highlights/);
    assert.match(prompt.prompt, /Active guardrail \[required\|Project Guidelines\]/);
    assert.match(prompt.prompt, /Manual: `providers\.ollama\.host` sets the primary Ollama URL\./);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("guidance-summary includes manual guidance from the toolkit fallback", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-manual-guidance-"));

  try {
    const result = await runNode([
      path.join(repoRoot, "aiwf-shell", "scripts", "ai-workflow", "guidance-summary.ts"),
      "--files",
      "aiwf-shell/cli/lib/shell.ts",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(Array.isArray(payload.guidance?.manual), true);
    assert.equal(payload.guidance.manual.length > 0, true);
    assert.equal(Array.isArray(payload.activeGuardrails), true);
    assert.equal(payload.activeGuardrails.length > 0, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("workflow-audit fails when docs/manual.html is stale for an existing manual", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-manual-audit-"));

  try {
    const initResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"),
      "--target",
      targetRoot
    ], { cwd: repoRoot });
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);

    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await writeFile(path.join(targetRoot, "docs", "MANUAL.md"), "# ai-workflow Manual\n\n## What It Is\n\nmanual body\n", "utf8");
    await writeFile(path.join(targetRoot, "docs", "manual.html"), "<!doctype html><html><body>stale</body></html>\n", "utf8");

    const auditResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "scripts", "ai-workflow", "workflow-audit.ts"),
      "--json"
    ], { cwd: targetRoot });
    assert.equal(auditResult.code, 1);
    const payload = JSON.parse(auditResult.stdout);
    assert.equal(
      payload.findings.some((finding) => String(finding.message).includes("generated semantic HTML manual is stale")),
      true
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
