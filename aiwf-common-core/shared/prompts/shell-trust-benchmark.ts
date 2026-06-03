/**
 * Responsibility: Define the fixed live shell trust corpus for operator-grade benchmark runs.
 * Scope: Repo-specific human-language prompts plus deterministic validation expectations.
 */

export const SHELL_TRUST_BENCHMARK_SUITE_ID = "shell-trust";
export const SHELL_TRUST_BENCHMARK_THRESHOLD = 0.84;

export const SHELL_TRUST_BENCHMARK_CASES = [
  {
    id: "operator-brief",
    title: "Grounded operator brief",
    critical: true,
    requireProgress: true,
    expectLocalWhenAvailable: true,
    prompt: "Give me a concise operator brief grounded in the current workflow state, and justify the recommendation.",
    rubric: "The shell output must directly answer the operator brief request, stay grounded in workflow/project state, include status, blocker, health, recommendation, and evidence, avoid internal planner/router chatter, and must not say it needs the AI planner or a clearer phrasing.",
    requiredPatterns: [
      /current workflow state:/i,
      /status:/i,
      /blocker:/i,
      /health:/i,
      /recommendation:/i,
      /evidence:/i,
      /\b(?:BUG|TKT|REF)-[A-Z0-9-]+\b|no clearly active|no active ticket|0 active tickets/i
    ],
    bannedPatterns: [
      /needs the ai planner/i,
      /clearer phrasing/i,
      /generic shell failure/i
    ]
  },
  {
    id: "projections-explainer",
    title: "Grounded projections explainer",
    critical: true,
    requireProgress: true,
    expectLocalWhenAvailable: true,
    prompt: "What is the projections service? Explain what it does, how it relates to sync or status, and cite the most relevant files.",
    rubric: "The shell output must answer what the projections service is, mention projections directly, stay grounded in repo/project evidence, cite the most relevant files, avoid internal planner/router chatter, and must not say it needs the AI planner or a clearer phrasing.",
    requiredPatterns: [
      /projections/i,
      /core\/services\/projections\.ts/i,
      /core\/services\/sync\.ts|core\/services\/status\.ts|cli\/lib\/main\.ts/i,
      /evidence:/i
    ],
    bannedPatterns: [
      /needs the ai planner/i,
      /clearer phrasing/i
    ]
  },
  {
    id: "current-work-blocker-next-step",
    title: "Current work and next-step status following",
    critical: true,
    requireProgress: true,
    expectLocalWhenAvailable: true,
    prompt: "What are we working on right now, what is the main blocker, and what should happen next? Answer from the workflow state, not from generic advice.",
    rubric: "The shell output must identify the active work, describe the main blocker honestly, and recommend a concrete next step from current workflow state instead of generic advice.",
    requiredPatterns: [
      /TKT-REL-[0-9]+|AIWF reliability|no clearly active ticket|no active ticket|0 active tickets/i,
      /blocker/i,
      /next step|recommendation/i,
      /workflow state|evidence/i
    ],
    bannedPatterns: [
      /i do not see an obvious active ticket/i,
      /generic/i
    ]
  },
  {
    id: "local-first-debug-angle",
    title: "Local-first routing debug angle",
    critical: true,
    requireProgress: true,
    expectLocalWhenAvailable: true,
    prompt: "I have a messy project request: debug why local Ollama precedence might fail, tell me the exact files you would inspect first, and keep the answer grounded in this repo.",
    rubric: "The shell output must preserve the local-first routing subject, propose a concrete debugging angle, mention exact relevant files, and stay grounded in this repo.",
    requiredPatterns: [
      /ollama|local-first|local/i,
      /router|provider|shell/i,
      /core\/services\/router\.ts|core\/services\/providers\.ts|cli\/lib\/shell\.ts/i
    ],
    bannedPatterns: [
      /needs the ai planner/i,
      /clearer phrasing/i
    ]
  },
  {
    id: "refactor-operations-assessment",
    title: "Refactor capability assessment",
    critical: false,
    requireProgress: true,
    expectLocalWhenAvailable: true,
    prompt: "Assess whether ai-workflow already has enough support for serious refactoring work. Be honest about gaps, mention DB-backed context, patching, verification, and the most relevant modules.",
    rubric: "The shell output must honestly assess refactor support, mention DB-backed context plus patching and verification, point to the most relevant modules, and avoid bluffing about missing capabilities.",
    requiredPatterns: [
      /refactor/i,
      /db|workflow db|sqlite/i,
      /patch|patching/i,
      /verification|dogfood|audit/i,
      /shared\/codelets|core\/services\/orchestrator\.ts|core\/db\//i
    ],
    bannedPatterns: [
      /needs the ai planner/i,
      /clearer phrasing/i
    ]
  },
  {
    id: "replacement-readiness-honesty",
    title: "Gemini-cli replacement honesty",
    critical: true,
    requireProgress: true,
    expectLocalWhenAvailable: true,
    prompt: "Can this shell honestly replace gemini-cli for messy project work today? Answer with current status, biggest blockers, and the proof still required.",
    rubric: "The shell output must answer the replacement-readiness question honestly, describe blockers and proof still required, and must not overclaim readiness if the evidence is not there.",
    requiredPatterns: [
      /not yet|not fully|still not/i,
      /blocker/i,
      /proof|required|benchmark|dogfood|audit/i
    ],
    bannedPatterns: [
      /fully ready/i,
      /definitely replaces gemini-cli/i
    ]
  }
];

export const SHELL_TRUST_BENCHMARK_MIN_CASES = SHELL_TRUST_BENCHMARK_CASES.length;
