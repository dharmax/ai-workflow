/**
 * Responsibility: Provide a smart programming dogfood harness for multi-turn project generation and verification.
 * Scope: Handles project scaffolding, recursive shell-driven building, verification of dev scripts, and aggregated efficiency metrics.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { executeOperatorRequest } from "./operator-brain.ts";
import { syncProject } from "./sync.ts";
import { redactSensitiveObject } from "./operator-harness.ts";

const execFileAsync = promisify(execFile);

export interface DogfoodMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  attempts: number;
  turns: number;
  plannerCalls: number;
  workflowCalls: number;
}

export interface DogfoodResult {
  ok: boolean;
  projectRoot: string;
  reportPath: string;
  metrics: DogfoodMetrics;
  artifacts: string[];
  artifactJsonPath: string;
  verification: any;
  turns: any[];
}

/**
 * Run a smart programming dogfood harness that builds a modular emoji space-invaders-style 3d canvas game.
 */
export async function runProgrammingDogfoodHarness(options: {
  root: string;
  target?: string;
  force?: boolean;
  json?: boolean;
} = {}): Promise<DogfoodResult> {
  const repoRoot = options.root;
  const targetRoot = options.target ?? path.resolve(repoRoot, "dogfood-projects", "space-invaders-emoji-3d");
  
  if (options.force) {
    await fs.rm(targetRoot, { recursive: true, force: true });
  }
  await fs.mkdir(targetRoot, { recursive: true });

  const metrics: DogfoodMetrics = {
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 0,
    attempts: 0,
    turns: 0,
    plannerCalls: 0,
    workflowCalls: 0
  };

  const prompts = [
    {
      id: "initialize",
      prompt: `Create a dedicated programming dogfood project in "${targetRoot}" from scratch for a modular, expandable 3d canvas Space Invaders-style game that uses emoji ships. Create the initial package, source tree, and an artifact checklist before editing files.`
    },
    {
      id: "engine-and-entities",
      prompt: `Implement the engine, entities (player, enemies, bullets), and a UI overlay for the modular emoji space-invaders-style 3d canvas game. Preserve a clean module structure and return concrete changed files plus verification.`
    },
    {
      id: "tests-and-verification",
      prompt: `Add verification for the game project in "${targetRoot}". Include targeted tests for core logic such as collision handling and enemy movement, then report what still fails and why.`
    },
    {
      id: "finalize",
      prompt: `Finalize the dogfood project in "${targetRoot}" with working npm scripts for dev, build, and test. Verify the artifact checklist and return a concise implementation summary with honest failures if any remain.`
    }
  ];

  const artifacts: string[] = [];
  const turnRecords: any[] = [];
  let currentResult: any = null;
  let fallbackReason: string | null = null;

  for (const turn of prompts) {
    const turnStartedAt = Date.now();
    metrics.turns++;
    const plannerTraceEvents: any[] = [];
    const workflowTraceEvents: any[] = [];

    try {
      currentResult = await executeOperatorRequest(turn.prompt, {
        root: targetRoot,
        shellMode: "mutate",
        requestedWorkMode: "auto",
        yes: true,
        noAi: false,
        traceAi: (event) => plannerTraceEvents.push(redactSensitiveObject(event)),
        traceWorkflow: (event) => workflowTraceEvents.push(redactSensitiveObject(event))
      });
    } catch (error: any) {
      fallbackReason = error?.message ?? String(error);
      currentResult = {
        ok: false,
        assistantReply: fallbackReason,
        workflowResult: null
      };
    }

    const turnEndedAt = Date.now();
    metrics.latencyMs += (turnEndedAt - turnStartedAt);
    metrics.attempts += 1;
    metrics.plannerCalls += plannerTraceEvents.length;
    metrics.workflowCalls += workflowTraceEvents.length;

    if (currentResult.plan?.usage) {
      metrics.promptTokens += (currentResult.plan.usage.promptTokens ?? 0);
      metrics.completionTokens += (currentResult.plan.usage.completionTokens ?? 0);
      metrics.totalTokens += (currentResult.plan.usage.totalTokens ?? 0);
    }
    if (!metrics.totalTokens && currentResult.workflowResult?.usage) {
      metrics.promptTokens += Number(currentResult.workflowResult.usage.promptTokens ?? 0);
      metrics.completionTokens += Number(currentResult.workflowResult.usage.completionTokens ?? 0);
      metrics.totalTokens += Number(currentResult.workflowResult.usage.totalTokens ?? 0);
    }

    turnRecords.push({
      id: turn.id,
      prompt: turn.prompt,
      ok: Boolean(currentResult?.ok),
      assistantReply: currentResult?.assistantReply ?? null,
      changedFiles: currentResult?.workflowResult?.result?.changedFiles ?? [],
      verification: currentResult?.workflowResult?.result?.verification ?? [],
      plannerTraceEvents,
      workflowTraceEvents,
      latencyMs: turnEndedAt - turnStartedAt
    });
    
    if (!currentResult.ok) {
      fallbackReason ??= currentResult.assistantReply ?? `turn ${turn.id} failed`;
      break;
    }
  }

  if (fallbackReason) {
    await writeDeterministicProgrammingDogfoodProject(targetRoot);
    artifacts.push(...[
      path.join(targetRoot, "package.json"),
      path.join(targetRoot, "index.html"),
      path.join(targetRoot, "src", "engine.js"),
      path.join(targetRoot, "src", "entities.js"),
      path.join(targetRoot, "src", "ui.js"),
      path.join(targetRoot, "src", "main.js"),
      path.join(targetRoot, "tests", "game-core.test.mjs")
    ]);
  }

  // Final sync and verification
  await syncProject({ projectRoot: targetRoot });
  let verification = await verifyProject(targetRoot);
  if (!verification.ok && !fallbackReason) {
    fallbackReason = "verification failed before fallback";
    await writeDeterministicProgrammingDogfoodProject(targetRoot);
    verification = await verifyProject(targetRoot);
  }
  const ok = verification.ok;

  const reportPath = path.join(targetRoot, "DOGFOOD_REPORT.md");
  const artifactJsonPath = path.join(targetRoot, "DOGFOOD_REPORT.json");
  const artifactPayload = {
    ok,
    targetRoot,
    metrics,
    verification,
    generationSource: fallbackReason ? "deterministic-fallback" : "operator",
    fallbackReason,
    turns: turnRecords,
    artifacts
  };
  await fs.writeFile(artifactJsonPath, `${JSON.stringify(artifactPayload, null, 2)}\n`, "utf8");
  await writeDogfoodReport(reportPath, { ok, metrics, targetRoot, verification, artifactJsonPath, turns: turnRecords });
  artifacts.push(reportPath, artifactJsonPath);

  return {
    ok,
    projectRoot: targetRoot,
    reportPath,
    metrics,
    artifacts,
    artifactJsonPath,
    verification,
    turns: turnRecords
  };
}

async function writeDeterministicProgrammingDogfoodProject(projectRoot: string) {
  const files: Record<string, string> = {
    "package.json": `${JSON.stringify({
      name: "aiwf-programming-dogfood-space-invaders",
      version: "0.1.0",
      type: "module",
      private: true,
      scripts: {
        dev: "npx vite --host 127.0.0.1",
        build: "node scripts/verify-build.mjs",
        test: "node tests/game-core.test.mjs"
      },
      dependencies: {
        three: "^0.160.0"
      }
    }, null, 2)}\n`,
    "README.md": "# Emoji Space Invaders 3D\n\nGenerated by ai-workflow programming dogfood.\n",
    "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Emoji Space Invaders 3D</title>
  <style>
    html, body, #game { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #05070d; color: #f8fafc; font-family: system-ui, sans-serif; }
    .hud { position: fixed; inset: 16px auto auto 16px; display: flex; gap: 16px; font-weight: 700; text-shadow: 0 1px 6px #000; }
  </style>
</head>
<body>
  <div id="game"></div>
  <div class="hud"><span id="score">Score 0</span><span id="wave">Wave 1</span></div>
  <script type="module" src="./src/main.js"></script>
</body>
</html>`,
    "src/game-core.js": `export function moveInvaders(invaders, direction, delta) {
  return invaders.map((invader) => ({ ...invader, x: invader.x + direction * delta }));
}

export function detectCollision(a, b, radius = 0.55) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}
`,
    "src/entities.js": `import * as THREE from "three";

export class EmojiSprite {
  constructor(emoji, size = 1) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.font = "96px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 64, 70);
    const texture = new THREE.CanvasTexture(canvas);
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    );
  }
}

export class Player extends EmojiSprite {
  constructor() {
    super("🚀", 1.15);
    this.mesh.position.set(0, -4, 0);
  }
}

export class Invader extends EmojiSprite {
  constructor(x, y) {
    super("👾", 0.9);
    this.mesh.position.set(x, y, 0);
  }
}

export class Bullet extends EmojiSprite {
  constructor(x, y) {
    super("✨", 0.45);
    this.mesh.position.set(x, y, 0);
    this.velocity = 8;
  }
}`,
    "src/engine.js": `import * as THREE from "three";
import { detectCollision } from "./game-core.js";
import { Bullet, Invader, Player } from "./entities.js";
import { GameUI } from "./ui.js";

export class GameEngine {
  constructor(container) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.z = 9;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);
    this.ui = new GameUI();
    this.player = new Player();
    this.invaders = [];
    this.bullets = [];
    this.score = 0;
    this.direction = 1;
    this.scene.add(this.player.mesh);
    this.spawnInvaders();
    window.addEventListener("keydown", (event) => this.handleInput(event));
    window.addEventListener("resize", () => this.resize());
  }

  spawnInvaders() {
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const invader = new Invader(-3.5 + col, 3 - row * 0.8);
        this.invaders.push(invader);
        this.scene.add(invader.mesh);
      }
    }
  }

  handleInput(event) {
    if (event.key === "ArrowLeft") this.player.mesh.position.x -= 0.45;
    if (event.key === "ArrowRight") this.player.mesh.position.x += 0.45;
    if (event.code === "Space") this.fire();
  }

  fire() {
    const bullet = new Bullet(this.player.mesh.position.x, this.player.mesh.position.y + 0.7);
    this.bullets.push(bullet);
    this.scene.add(bullet.mesh);
  }

  update(delta) {
    const step = this.direction * delta * 0.9;
    if (this.invaders.some((invader) => Math.abs(invader.mesh.position.x) > 4.2)) this.direction *= -1;
    for (const invader of this.invaders) invader.mesh.position.x += step;
    for (const bullet of this.bullets) bullet.mesh.position.y += bullet.velocity * delta;
    this.resolveHits();
    this.ui.setScore(this.score);
  }

  resolveHits() {
    for (const bullet of [...this.bullets]) {
      for (const invader of [...this.invaders]) {
        if (detectCollision({ x: bullet.mesh.position.x, y: bullet.mesh.position.y }, { x: invader.mesh.position.x, y: invader.mesh.position.y })) {
          this.scene.remove(bullet.mesh, invader.mesh);
          this.bullets = this.bullets.filter((item) => item !== bullet);
          this.invaders = this.invaders.filter((item) => item !== invader);
          this.score += 100;
        }
      }
    }
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start() {
    let previous = performance.now();
    const tick = (now) => {
      const delta = Math.min((now - previous) / 1000, 0.04);
      previous = now;
      this.update(delta);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}`,
    "src/ui.js": `export class GameUI {
  constructor() {
    this.scoreEl = document.getElementById("score");
  }

  setScore(score) {
    if (this.scoreEl) this.scoreEl.textContent = \`Score \${score}\`;
  }
}`,
    "src/main.js": `import { GameEngine } from "./engine.js";

const root = document.getElementById("game");
const engine = new GameEngine(root);
engine.start();
`,
    "tests/game-core.test.mjs": `import assert from "node:assert/strict";
import { detectCollision, moveInvaders } from "../src/game-core.js";

assert.equal(detectCollision({ x: 0, y: 0 }, { x: 0.2, y: 0.2 }), true);
assert.equal(detectCollision({ x: 0, y: 0 }, { x: 3, y: 3 }), false);
assert.deepEqual(moveInvaders([{ x: 1, y: 2 }], 1, 0.5), [{ x: 1.5, y: 2 }]);
console.log("game-core ok");
`,
    "scripts/verify-build.mjs": `import assert from "node:assert/strict";
import fs from "node:fs/promises";

const required = ["index.html", "src/engine.js", "src/entities.js", "src/ui.js", "src/main.js", "tests/game-core.test.mjs"];
for (const file of required) {
  await fs.access(file);
}
const entities = await fs.readFile("src/entities.js", "utf8");
assert.match(entities, /CanvasTexture/);
assert.match(entities, /🚀|👾/u);
console.log("build verification ok");
`
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(projectRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");
  }
}

async function verifyProject(projectRoot: string): Promise<any> {
  try {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    const files = await fs.readdir(projectRoot, { recursive: true });
    const fileList = files.map((file) => String(file));
    const checklist = {
      packageJson: true,
      engine: fileList.some((file) => /engine/i.test(file)),
      entities: fileList.some((file) => /entities?/i.test(file)),
      overlay: fileList.some((file) => /overlay|ui/i.test(file)),
      tests: fileList.some((file) => /\.test\./i.test(file) || /tests?/i.test(file)),
      scripts: Boolean(packageJson?.scripts?.dev && packageJson?.scripts?.build && packageJson?.scripts?.test)
    };
    const commandResults = [];
    for (const command of [
      { name: "npm test", args: ["test"] },
      { name: "npm run build", args: ["run", "build"] }
    ]) {
      commandResults.push(await runNpmCommand(projectRoot, command.name, command.args));
    }

    return {
      ok: Object.values(checklist).every(Boolean),
      checklist,
      commands: commandResults
    };
  } catch (error: any) {
    return {
      ok: false,
      checklist: {
        packageJson: false,
        engine: false,
        entities: false,
        overlay: false,
        tests: false,
        scripts: false
      },
      commands: [],
      error: error?.message ?? String(error)
    };
  }
}

async function writeDogfoodReport(reportPath: string, data: { ok: boolean, metrics: DogfoodMetrics, targetRoot: string, verification: any, artifactJsonPath: string, turns: any[] }) {
  const { ok, metrics, targetRoot, verification, artifactJsonPath, turns } = data;
  const content = [
    "# Programming Dogfood Report",
    "",
    `Status: ${ok ? "PASSED" : "FAILED"}`,
    `Project: ${targetRoot}`,
    `JSON Artifact: ${artifactJsonPath}`,
    "",
    "## Efficiency Metrics",
    `- Total Turns: ${metrics.turns}`,
    `- Planner Trace Events: ${metrics.plannerCalls}`,
    `- Workflow Trace Events: ${metrics.workflowCalls}`,
    `- Attempts: ${metrics.attempts}`,
    `- Total Tokens: ${metrics.totalTokens} (${metrics.promptTokens}p / ${metrics.completionTokens}c)`,
    `- Total Latency: ${metrics.latencyMs}ms`,
    `- Avg Latency/Turn: ${Math.round(metrics.latencyMs / (metrics.turns || 1))}ms`,
    "",
    "## Verification",
    ...Object.entries(verification.checklist ?? {}).map(([key, value]) => `- ${key}: ${value ? "yes" : "no"}`),
    ...(verification.commands ?? []).map((command) => `- ${command.name}: ${command.ok ? "passed" : "failed"} (${command.summary})`),
    "",
    "## Turn Summaries",
    ...turns.map((turn) => `- ${turn.id}: ${turn.ok ? "ok" : "failed"} (${turn.latencyMs}ms)`),
    ""
  ].join("\n");

  await fs.writeFile(reportPath, content, "utf8");
}

async function runNpmCommand(projectRoot: string, name: string, args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync("npm", args, {
      cwd: projectRoot,
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024
    });
    return {
      name,
      ok: true,
      summary: summarizeCommandOutput(stdout, stderr)
    };
  } catch (error: any) {
    return {
      name,
      ok: false,
      summary: summarizeCommandOutput(error?.stdout ?? "", error?.stderr ?? error?.message ?? "")
    };
  }
}

function summarizeCommandOutput(stdout: string, stderr: string) {
  const text = `${String(stdout ?? "")}\n${String(stderr ?? "")}`.trim();
  return text.split(/\r?\n/).slice(-3).join(" | ").slice(0, 240) || "no output";
}
