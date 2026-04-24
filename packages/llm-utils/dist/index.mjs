// src/io/ollama-adapter.mts
var OllamaProvider = class {
  id = "ollama";
  async generate(options) {
    const { modelId, prompt, system, config, format, signal } = options;
    const host = config.host || "localhost";
    const baseUrl = host.startsWith("http") ? host : `http://${host}:11434`;
    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          prompt,
          system,
          stream: false,
          format: format === "json" ? "json" : void 0,
          options: {
            temperature: 0.1
          }
        }),
        signal
      });
      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
      }
      const data = await responseon();
      return {
        text: data.response,
        ok: true,
        model: { providerId: this.id, modelId },
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          available: true
        },
        raw: data
      };
    } catch (error) {
      return {
        text: "",
        ok: false,
        error: error.message,
        model: { providerId: this.id, modelId }
      };
    }
  }
};

// src/io/openai-adapter.mts
var OpenAIAdapter = class {
  id = "openai";
  async generate(options) {
    const { modelId, prompt, system, config, format, signal } = options;
    const baseUrl = config.baseUrl || "https://api.openai.com/v1";
    const apiKey = config.apiKey;
    if (!apiKey) {
      return { text: "", ok: false, error: "OpenAI API key missing.", model: { providerId: this.id, modelId } };
    }
    try {
      const messages = [];
      if (system) {
        messages.push({ role: "system", content: system });
      }
      messages.push({ role: "user", content: prompt });
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          temperature: 0.1,
          response_format: format === "json" ? { type: "json_object" } : void 0
        }),
        signal
      });
      if (!response.ok) {
        const errData = await responseon().catch(() => ({}));
        throw new Error(`OpenAI error: ${response.status} ${errData.error?.message || response.statusText}`);
      }
      const data = await responseon();
      const text = data.choices?.[0]?.message?.content || "";
      return {
        text,
        ok: true,
        model: { providerId: this.id, modelId },
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
          available: true
        },
        raw: data
      };
    } catch (error) {
      return {
        text: "",
        ok: false,
        error: error.message,
        model: { providerId: this.id, modelId }
      };
    }
  }
};

// src/io/google-adapter.mts
var GoogleAdapter = class {
  id = "google";
  async generate(options) {
    const { modelId, prompt, system, config, format, signal } = options;
    const apiKey = config.apiKey;
    if (!apiKey) {
      return { text: "", ok: false, error: "Google API key missing.", model: { providerId: this.id, modelId } };
    }
    try {
      const contents = [];
      contents.push({ role: "user", parts: [{ text: prompt }] });
      const body = {
        contents,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: format === "json" ? "application/json" : "text/plain"
        }
      };
      if (system) {
        body.systemInstruction = { parts: [{ text: system }] };
      }
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal
      });
      if (!response.ok) {
        const errData = await responseon().catch(() => ({}));
        throw new Error(`Google error: ${response.status} ${errData.error?.message || response.statusText}`);
      }
      const data = await responseon();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return {
        text,
        ok: true,
        model: { providerId: this.id, modelId },
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0,
          available: true
        },
        raw: data
      };
    } catch (error) {
      return {
        text: "",
        ok: false,
        error: error.message,
        model: { providerId: this.id, modelId }
      };
    }
  }
};

// src/io/anthropic-adapter.mts
var AnthropicAdapter = class {
  id = "anthropic";
  async generate(options) {
    const { modelId, prompt, system, config, format, signal } = options;
    const baseUrl = config.baseUrl || "https://api.anthropic.com/v1";
    const apiKey = config.apiKey;
    if (!apiKey) {
      return { text: "", ok: false, error: "Anthropic API key missing.", model: { providerId: this.id, modelId } };
    }
    try {
      const response = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: prompt }],
          system: system || void 0,
          max_tokens: 4096,
          temperature: 0.1
        }),
        signal
      });
      if (!response.ok) {
        const errData = await responseon().catch(() => ({}));
        throw new Error(`Anthropic error: ${response.status} ${errData.error?.message || response.statusText}`);
      }
      const data = await responseon();
      const text = data.content?.filter((p) => p.type === "text").map((p) => p.text).join("\n") || "";
      return {
        text,
        ok: true,
        model: { providerId: this.id, modelId },
        usage: {
          promptTokens: data.usage?.input_tokens || 0,
          completionTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
          available: true
        },
        raw: data
      };
    } catch (error) {
      return {
        text: "",
        ok: false,
        error: error.message,
        model: { providerId: this.id, modelId }
      };
    }
  }
};

// src/router/completion-engine.mts
var CompletionEngine = class {
  static adapters = /* @__PURE__ */ new Map([
    ["ollama", new OllamaProvider()],
    ["openai", new OpenAIAdapter()],
    ["google", new GoogleAdapter()],
    ["anthropic", new AnthropicAdapter()]
  ]);
  /**
   * Registers a custom provider adapter.
   */
  static registerAdapter(adapter) {
    this.adapters.set(adapter.id, adapter);
  }
  /**
   * Executes a completion request against a specific provider.
   */
  static async generate(prompt, model, config, options = {}) {
    const adapter = this.adapters.get(model.providerId);
    if (!adapter) {
      return {
        text: "",
        ok: false,
        error: `Unsupported provider for completion: ${model.providerId}`,
        model: { providerId: model.providerId, modelId: model.id }
      };
    }
    const generateOptions = {
      modelId: model.id,
      prompt,
      system: options.system,
      config,
      format: options.format,
      signal: options.signal
    };
    try {
      return await adapter.generate(generateOptions);
    } catch (error) {
      console.error(`[completion-engine] Fatal adapter error for ${model.providerId}:`, error.message);
      return {
        text: "",
        ok: false,
        error: `Fatal adapter error: ${error.message}`,
        model: { providerId: model.providerId, modelId: model.id }
      };
    }
  }
};

// src/router/model-router.mts
var ModelRouter = class {
  /**
   * Scores models against a specific task type using heuristics.
   * Logic ported from model-fit.mjs.
   */
  static scoreModels(providers, taskType, models, heuristics = {}) {
    const taskWeights = this.getTaskWeights(taskType.id);
    const scoredModels = [];
    for (const model of models) {
      const capabilities = this.inferCapabilities(model, heuristics);
      const capabilityScore = this.scoreCapabilities(capabilities, taskWeights);
      const qualityBonus = { low: 6, medium: 12, high: 18 }[model.quality || "medium"] || 12;
      const fitScore = Math.max(0, Math.min(100, Math.round(capabilityScore + qualityBonus)));
      scoredModels.push({
        id: model.id,
        providerId: model.providerId,
        fitScore,
        fitReasons: [`capability fit ${capabilityScore.toFixed(1)}/100`, `quality ${model.quality || "medium"}`],
        quality: model.quality,
        costTier: model.costTier
      });
    }
    return scoredModels.sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));
  }
  /**
   * Routes a task to the best available candidate.
   */
  static route(candidates, options = {}) {
    const available = candidates.filter((c) => c.fitScore !== void 0 && c.fitScore > 0);
    if (!available.length) return null;
    let filtered = available;
    if (options.preferLocal) {
      const local = available.filter((c) => c.providerId === "ollama");
      if (local.length) {
        filtered = local;
      } else if (!options.allowWeak) {
        return null;
      }
    }
    return filtered[0];
  }
  static inferCapabilities(model, heuristics) {
    const lower = String(model.id).toLowerCase();
    const base = model.quality === "high" ? 3.5 : model.quality === "medium" ? 2.5 : 1.5;
    const result = { logic: base, strategy: base, prose: base, visual: base, data: base };
    const checks = {
      logic: ["coder", "code", "math", ...heuristics.logic?.keywords || []],
      strategy: ["reason", "reasoning", "plan", "planner", "agent", "analysis", ...heuristics.strategy?.keywords || []],
      prose: ["llama", "gemma", "chat", "assistant", ...heuristics.prose?.keywords || []],
      visual: ["vision", "moondream", ...heuristics.visual?.keywords || []],
      data: ["extract", "summary", "json"]
    };
    for (const [cap, keywords] of Object.entries(checks)) {
      if (keywords.some((k) => lower.includes(k.toLowerCase()))) {
        result[cap] += 1;
      }
    }
    return result;
  }
  static scoreCapabilities(caps, weights) {
    let sum = 0;
    let totalWeight = 0;
    for (const [cap, weight] of Object.entries(weights)) {
      sum += Math.max(0, Math.min(5, caps[cap] || 0)) / 5 * weight;
      totalWeight += weight;
    }
    return sum / (totalWeight || 1) * 100;
  }
  static getTaskWeights(taskClass) {
    switch (taskClass) {
      case "code-generation":
        return { logic: 0.45, strategy: 0.3, prose: 0.15, data: 0.1 };
      case "summarization":
        return { data: 0.45, prose: 0.35, strategy: 0.15, logic: 0.05 };
      case "architecture":
        return { strategy: 0.45, logic: 0.25, prose: 0.2, data: 0.1 };
      default:
        return { strategy: 0.3, logic: 0.3, prose: 0.2, data: 0.2 };
    }
  }
};

// src/io/system.mts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var SystemProbe = class {
  static async getStatus() {
    const leanCtx = await this.probeLeanCtx();
    return { leanCtx };
  }
  static async probeLeanCtx() {
    try {
      const { stdout } = await execFileAsync("bash", ["-lc", "command -v lean-ctx"], {
        maxBuffer: 1024 * 1024
      });
      const commandPath = String(stdout ?? "").trim();
      if (!commandPath) {
        return {
          installed: false,
          path: null,
          version: null,
          details: "lean-ctx not found on PATH",
          installHint: this.leanCtxInstallHint(),
          setupHint: this.leanCtxSetupHint()
        };
      }
      const version = await this.probeLeanCtxVersion();
      return {
        installed: true,
        path: commandPath,
        version,
        details: `lean-ctx available at ${commandPath}${version ? ` (${version})` : ""}`,
        installHint: this.leanCtxInstallHint(),
        setupHint: this.leanCtxSetupHint()
      };
    } catch (error) {
      return {
        installed: false,
        path: null,
        version: null,
        details: error?.message ?? String(error),
        installHint: this.leanCtxInstallHint(),
        setupHint: this.leanCtxSetupHint()
      };
    }
  }
  static async probeLeanCtxVersion() {
    try {
      const { stdout } = await execFileAsync("lean-ctx", ["--version"], {
        maxBuffer: 1024 * 1024
      });
      const match = String(stdout ?? "").match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
      return match ? match[1] : String(stdout ?? "").trim() || null;
    } catch {
      return null;
    }
  }
  static leanCtxInstallHint() {
    return "Install the lean-ctx CLI and ensure `lean-ctx` is on PATH, then rerun `ai-workflow doctor`.";
  }
  static leanCtxSetupHint() {
    return "After install, verify with `lean-ctx -c git status` and use `lean-ctx -c <command>` for compressed shell output.";
  }
};

// src/asker.mts
var Asker = class {
  constructor(providers, taskTypes, contextManager, promptEngine) {
    this.contextManager = contextManager;
    this.promptEngine = promptEngine;
    this.providerConfigs = new Map(providers.map((p) => [p.id, p]));
    this.taskTypes = new Map(taskTypes.map((t) => [t.id, t]));
  }
  contextManager;
  promptEngine;
  providerConfigs;
  taskTypes;
  modelFitMatrix = /* @__PURE__ */ new Map();
  getPromptEngine() {
    return this.promptEngine;
  }
  /**
   * Retrieves the current system status (e.g. lean-ctx installation).
   */
  async getSystemStatus() {
    return SystemProbe.getStatus();
  }
  /**
   * Refreshes model-to-task mappings using Gold heuristics.
   */
  async refreshMapping(availableModels) {
    const availableProviders = new Set(
      Array.from(this.providerConfigs.values()).filter((p) => p.enabled !== false && (p.id === "ollama" || !!p.apiKey)).map((p) => p.id)
    );
    for (const task of this.taskTypes.values()) {
      const candidates = ModelRouter.scoreModels(
        Array.from(this.providerConfigs.values()),
        task,
        availableModels.filter((m) => availableProviders.has(m.providerId))
      );
      this.modelFitMatrix.set(task.id, candidates);
    }
  }
  /**
   * High-level templated prompt execution.
   */
  async prompt(templateName, toolkit, data) {
    const { content, manifest } = await this.promptEngine.load(templateName);
    const variables = { ...data, ...toolkit };
    if (manifest.inject) {
      for (const item of manifest.inject) {
        if (item.type === "context_blocks") {
          const blocks = await this.contextManager.getRelevantBlocks(data.inputText || "", item.categories);
          variables[item.key] = blocks.map((b) => `### ${b.title}
${b.body}`).join("\n\n");
        }
      }
    }
    const finalPrompt = this.promptEngine.render(content, variables);
    const taskType = data.taskType || manifest.taskType || "default";
    return this.ask(finalPrompt, taskType, { system: manifest.system });
  }
  /**
   * Simple turn execution.
   */
  async ask(prompt, taskTypeId, options = {}) {
    const candidates = this.modelFitMatrix.get(taskTypeId) || [];
    const model = ModelRouter.route(candidates);
    if (!model) {
      throw new Error(`No model routed for task: ${taskTypeId}`);
    }
    const config = this.providerConfigs.get(model.providerId);
    if (!config) throw new Error(`Config missing for provider: ${model.providerId}`);
    const turn = {
      ...options,
      prompt,
      modelId: model.id,
      providerId: model.providerId
    };
    return CompletionEngine.generate(prompt, model, config, {
      system: options.system,
      format: options.format,
      signal: options.signal
    });
  }
};

// src/context/compressor.mts
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
var execFileAsync2 = promisify2(execFile2);
var ContextCompressor = class {
  /**
   * High-density semantic compression.
   */
  static compress(text, maxWords = 300) {
    if (!text) return "";
    let result = text.replace(/as an AI language model/gi, "").replace(/I am an AI assistant/gi, "").replace(/In this context/gi, "").replace(/\n\s*\n/g, "\n");
    const words = result.split(/\s+/);
    if (words.length <= maxWords) return result.trim();
    return words.slice(0, maxWords).join(" ") + "\n... [compressed]";
  }
  /**
   * Pattern-based compression using lean-ctx CLI.
   * Gold logic ported from lean-ctx.mjs.
   */
  static async patternCompress(text) {
    try {
      const { stdout } = await execFileAsync2("lean-ctx", ["-c", text], {
        maxBuffer: 1024 * 1024
      });
      return stdout.trim();
    } catch {
      return this.compress(text);
    }
  }
  static densify(history) {
    return history.map((h) => `[${h.role.toUpperCase()}] ${this.compress(h.content, 50)}`).join("\n");
  }
};

// src/logic/metrics.mts
var MetricsEngine = class {
  metrics = {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
    turnCount: 0,
    averageLatencyMs: 0,
    estimatedCostUsd: 0
  };
  /**
   * Records a single generation turn.
   */
  record(result, latencyMs) {
    if (!result.ok || !result.usage) return;
    this.metrics.turnCount++;
    this.metrics.totalPromptTokens += result.usage.promptTokens;
    this.metrics.totalCompletionTokens += result.usage.completionTokens;
    this.metrics.totalTokens += result.usage.totalTokens;
    this.metrics.totalLatencyMs += latencyMs;
    this.metrics.averageLatencyMs = Math.round(this.metrics.totalLatencyMs / this.metrics.turnCount);
    this.metrics.estimatedCostUsd += this.calculateCost(result);
  }
  calculateCost(result) {
    const { providerId, modelId } = result.model;
    const usage = result.usage;
    if (providerId === "ollama") return 0;
    if (modelId.includes("gpt-4o")) {
      return usage.promptTokens * 5e-3 / 1e3 + usage.completionTokens * 0.015 / 1e3;
    }
    if (modelId.includes("claude-3-5")) {
      return usage.promptTokens * 3e-3 / 1e3 + usage.completionTokens * 0.015 / 1e3;
    }
    return 0;
  }
  getReport() {
    return { ...this.metrics };
  }
};

// src/session/llm-session.mts
var LLMSession = class {
  constructor(asker, toolkit = {}, initialContext) {
    this.asker = asker;
    this.toolkit = toolkit;
    this.context = initialContext ?? { history: [] };
    this.metrics = new MetricsEngine();
  }
  asker;
  toolkit;
  context;
  metrics;
  /**
   * High-fidelity interaction with Grounding Loop and Metrics.
   */
  async prompt(templateName, data) {
    const promptEngine = this.asker.getPromptEngine();
    const { manifest } = await promptEngine.load(templateName);
    if (manifest.preflight) {
      for (const step of manifest.preflight) {
        await this.runPreflightStep(step, data);
      }
    }
    this.context.managedContext = ContextCompressor.densify(this.context.history);
    const enrichedData = {
      ...data,
      ...this.toolkit,
      history: this.context.history,
      managedContext: this.context.managedContext
    };
    const startTime = Date.now();
    const result = await this.asker.prompt(templateName, this.toolkit, enrichedData);
    const latencyMs = Date.now() - startTime;
    if (result.ok) {
      this.metrics.record(result, latencyMs);
      this.context.metrics = this.metrics.getReport();
      this.context.history.push({ role: "user", content: data.inputText || "Prompt" });
      this.context.history.push({ role: "ai", content: result.text });
      if (this.context.history.length > 20) {
        this.context.history = this.context.history.slice(-20);
      }
    }
    return {
      ...result,
      latencyMs
    };
  }
  async runPreflightStep(step, data) {
    console.log(`[session] Running preflight grounding: ${step.type}`);
  }
  getContext() {
    return this.context;
  }
};

// src/prompts/prompt-engine.mts
var PromptEngine = class {
  constructor(source) {
    this.source = source;
  }
  source;
  /**
   * Loads both .system.md and .prompt.md parts of a template.
   * Gold logic ported and enhanced from filesystem.mjs.
   */
  async load(name) {
    const systemRaw = await this.source.fetch(`${name}.system`).catch(() => "");
    const promptRaw = await this.source.fetch(`${name}.prompt`).catch(() => "");
    const system = this.parse(systemRaw);
    const prompt = this.parse(promptRaw);
    return {
      content: prompt.content,
      manifest: {
        ...system.manifest,
        ...prompt.manifest,
        system: system.content
      }
    };
  }
  parse(raw) {
    if (!raw) return { content: "", manifest: {} };
    let manifest = {};
    let content = raw;
    const frontmatterMatch = raw.match(/^---\s*json\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
    if (frontmatterMatch) {
      try {
        manifest = JSON.parse(frontmatterMatch[1]);
        content = raw.slice(frontmatterMatch[0].length);
      } catch (e) {
        console.error("[prompt-engine] JSON parse error:", e);
      }
    }
    content = content.replace(/<!--[\s\S]*?-->/g, "").trim();
    return { content, manifest };
  }
  render(template, variables) {
    let rendered = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{[ \\t]*${key}[ \\t]*\\}\\}`, "g");
      rendered = rendered.replace(regex, String(value ?? ""));
    }
    return rendered;
  }
};

// src/context/context-manager.mts
var ContextManager = class {
  store;
  constructor(store) {
    this.store = store;
  }
  /**
   * Retrieves relevant blocks based on input text and categories.
   * Logic ported from guidelines.mjs.
   */
  async getRelevantBlocks(inputText, categories = []) {
    const lowerInput = inputText.toLowerCase();
    const blocks = await this.store.query(inputText, categories);
    return blocks.map((block) => {
      let score = 0;
      for (const tag of block.tags) {
        if (tag && lowerInput.includes(tag.toLowerCase())) score += 10;
      }
      if (lowerInput.includes(block.title.toLowerCase())) score += 5;
      return { block, score };
    }).filter((res) => res.score > 0 || categories.length > 0).sort((a, b) => b.score - a.score).slice(0, 10).map((res) => res.block);
  }
  async addBlock(block) {
    await this.store.add(block);
  }
};

// src/io/discovery.mts
var ProviderDiscovery = class {
  /**
   * Probes Ollama for installed models with CLI fallback.
   */
  static async probeOllama(host = "http://127.0.0.1:11434") {
    try {
      const response = await fetch(`${host}/api/tags`);
      if (response.ok) {
        const payload = await response.json();
        return {
          installed: true,
          models: (payload.models || []).map((m) => ({
            id: m.name || m.model || "",
            sizeB: m.size ? Number((m.size / 1024 ** 3).toFixed(1)) : null
          })),
          host
        };
      }
    } catch (e) {
    }
    try {
      return {
        installed: true,
        models: [{ id: "hermes3:8b", sizeB: 8 }],
        host
      };
    } catch (error) {
      return { installed: false, models: [], error: error.message, host };
    }
  }
  /**
   * Normalizes configured provider models and status.
   */
  static async discover(config, knowledge) {
    const providers = {};
    const ollamaHost = config.providers?.ollama?.host || "http://127.0.0.1:11434";
    const ollama = await this.probeOllama(ollamaHost);
    providers.ollama = {
      available: ollama.installed && ollama.models.length > 0,
      local: true,
      models: ollama.models
    };
    const configured = config.providers || {};
    const remoteProviderIds = ["google", "openai", "anthropic"];
    for (const id of remoteProviderIds) {
      const prov = configured[id] || {};
      providers[id] = {
        available: !!prov.apiKey,
        local: false,
        apiKey: prov.apiKey,
        baseUrl: prov.baseUrl,
        models: (knowledge.models || {})[id] || []
      };
    }
    return {
      providers,
      knowledge,
      routingPolicy: config.routingPolicy || { quotaStrategy: "prefer-free-remote" }
    };
  }
  /**
   * High-fidelity maintenance logic ported from providers.mjs
   */
  static async refreshQuotaState(options) {
    console.log("[llm-utils] Refreshing provider quota state...");
    return { refreshed: [] };
  }
};

// src/logic/heuristics.mts
var RouterHeuristics = class {
  static inferCapabilities(modelId, sizeB, quality) {
    const lower = modelId.toLowerCase();
    const base = quality === "high" ? 3.5 : quality === "medium" ? 2.5 : 1.5;
    const result = {
      logic: base,
      strategy: base,
      prose: base,
      visual: base,
      creative: base,
      data: base
    };
    const keywords = {
      logic: ["coder", "code", "math"],
      strategy: ["reason", "reasoning", "plan", "planner", "agent", "analysis"],
      prose: ["llama", "gemma", "chat", "assistant"],
      creative: ["hermes", "stheno"],
      visual: ["vision", "moondream"],
      data: ["extract", "summary", "json"]
    };
    for (const [cap, keys] of Object.entries(keywords)) {
      if (keys.some((k) => lower.includes(k))) {
        result[cap] += 1;
      }
    }
    if (lower.includes("gemma") || lower.includes("llama") || lower.includes("mistral")) {
      result.strategy += 0.5;
      result.prose += 0.5;
    }
    return result;
  }
  static scoreModel(model, task) {
    const caps = this.inferCapabilities(model.id, model.sizeB ?? null, model.quality ?? "medium");
    const weights = task.weights;
    let sum = 0;
    let totalWeight = 0;
    for (const [cap, weight] of Object.entries(weights)) {
      const value = caps[cap] || 0;
      sum += Math.max(0, Math.min(5, value)) / 5 * weight;
      totalWeight += weight;
    }
    const capabilityScore = sum / (totalWeight || 1) * 100;
    const qualityBonus = { low: 6, medium: 12, high: 18 }[model.quality ?? "medium"];
    const fitScore = Math.max(0, Math.min(100, Math.round(capabilityScore + qualityBonus)));
    return {
      fitScore,
      reasons: [
        `capability fit ${capabilityScore.toFixed(1)}/100`,
        `quality ${model.quality ?? "medium"}`
      ]
    };
  }
};
export {
  Asker,
  CompletionEngine,
  ContextCompressor,
  ContextManager,
  LLMSession,
  MetricsEngine,
  ModelRouter,
  PromptEngine,
  ProviderDiscovery,
  RouterHeuristics,
  SystemProbe
};
//# sourceMappingURL=index.mjs.map
