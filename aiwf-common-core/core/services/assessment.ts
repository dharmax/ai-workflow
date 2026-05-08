/**
 * Responsibility: Provide a high-level "assessment" capability for projects, modules, and features.
 * Scope: Implements iterative Plan -> Criticize -> Revisit -> Execute loop.
 */

import { withWorkflowStore } from "./sync.ts";
import { generateCompletion } from "./providers.ts";
import { routeTask } from "./router.ts";
import { stableId } from "../lib/hash.ts";
import { loadPromptTemplate } from "../lib/filesystem.ts";

/**
 * Runs a multi-stage assessment on a target.
 */
export async function runAssessment(target, options = {}) {
  const root = options.root ?? process.cwd();
  const assessmentId = stableId("assessment", target.type, target.id, Date.now());

  return withWorkflowStore(root, async (store) => {
    // 1. Initialize Assessment
    const assessment = {
      id: assessmentId,
      targetType: target.type,
      targetId: target.id,
      status: "pending",
      scope: options.scope ?? "general",
      plan: null,
      criticism: null,
      result: null,
      createdAt: new Date().toISOString()
    };
    store.upsertAssessment(assessment);

    try {
      // 2. Stage: Plan
      console.log(`[assessment] Planning assessment for ${target.type}:${target.id}...`);
      assessment.status = "planned";
      assessment.plan = await generateAssessmentPlan(target, options);
      store.upsertAssessment(assessment);

      // 3. Stage: Criticize
      console.log(`[assessment] Criticizing plan...`);
      assessment.status = "criticized";
      assessment.criticism = await criticizeAssessmentPlan(assessment.plan, target, options);
      store.upsertAssessment(assessment);

      // 4. Stage: Revisit Plan
      console.log(`[assessment] Refining plan based on criticism...`);
      assessment.plan = await refineAssessmentPlan(assessment.plan, assessment.criticism, target, options);
      store.upsertAssessment(assessment);

      // 5. Stage: Execute
      console.log(`[assessment] Executing assessment...`);
      assessment.status = "executing";
      assessment.result = await executeAssessment(assessment.plan, target, options);
      
      // 6. Finalize
      assessment.status = "resolved";
      store.upsertAssessment(assessment);
      console.log(`[assessment] Assessment ${assessmentId} completed.`);

      return assessment;
    } catch (error) {
      console.error(`[assessment] Failed: ${error.message}`);
      assessment.status = "failed";
      assessment.result = { error: error.message };
      store.upsertAssessment(assessment);
      throw error;
    }
  });
}

async function generateAssessmentPlan(target, options) {
  const { system, prompt } = await buildPlanningPrompt(target, options);
  const fallback = buildFallbackAssessmentPlan(target, options);
  return runAssessmentStage({
    stage: "plan",
    taskClass: "architectural-design",
    root: options.root,
    planner: options.planner,
    system,
    prompt,
    fallback
  });
}

async function criticizeAssessmentPlan(plan, target, options) {
  const { system, prompt } = await buildCriticismPrompt(plan, target, options);
  const fallback = buildFallbackAssessmentCriticism(plan, target, options);
  return runAssessmentStage({
    stage: "criticism",
    taskClass: "review",
    root: options.root,
    planner: options.planner,
    system,
    prompt,
    fallback,
    chooseCandidate: (route) => route.candidates?.find((candidate) => candidate.score >= 90) ?? route.recommended ?? route.candidates?.[0] ?? null
  });
}

async function refineAssessmentPlan(plan, criticism, target, options) {
  const { system, prompt } = await buildRefinementPrompt(plan, criticism, target, options);
  const fallback = buildFallbackRefinedAssessmentPlan(plan, criticism, target, options);
  return runAssessmentStage({
    stage: "refinement",
    taskClass: "architectural-design",
    root: options.root,
    planner: options.planner,
    system,
    prompt,
    fallback
  });
}

async function executeAssessment(plan, target, options) {
  // This would ideally call the JS Orchestrator or run specific shell commands
  // For now, we'll simulate a summary result.
  return {
    summary: `Assessment executed based on ${plan.steps?.length ?? 0} planned steps.`,
    findings: plan.steps?.map(s => `Checked ${s}`) ?? [],
    recommendations: ["Ensure all new features have assessments."]
  };
}

async function buildPlanningPrompt(target, options) {
  const { content: template } = await loadPromptTemplate("assessment-plan.system");
  return {
    system: template || "You are a Senior Architect. Plan a deep assessment of the target.",
    prompt: `Target: ${target.type} ${target.id}\nScope: ${options.scope}\nOutput a JSON plan with a "steps" array.`
  };
}

async function buildCriticismPrompt(plan, target, options) {
  const { content: template } = await loadPromptTemplate("assessment-criticism.system");
  return {
    system: template || "You are a skeptical Principal Engineer. Find flaws in the assessment plan.",
    prompt: `Target: ${target.type} ${target.id}\nPlan: ${JSON.stringify(plan)}\nOutput a JSON criticism with "flaws" and "missingPoints" arrays.`
  };
}

async function buildRefinementPrompt(plan, criticism, target, options) {
  const { content: template } = await loadPromptTemplate("assessment-refinement.system");
  return {
    system: template || "You are a pragmatic Tech Lead. Update the assessment plan based on criticism.",
    prompt: `Original Plan: ${JSON.stringify(plan)}\nCriticism: ${JSON.stringify(criticism)}\nOutput the final refined JSON plan.`
  };
}

async function runAssessmentStage({
  stage,
  taskClass,
  root,
  planner = null,
  system,
  prompt,
  fallback,
  chooseCandidate = null
}) {
  const candidate = planner ?? await resolveAssessmentCandidate({
    root,
    taskClass,
    chooseCandidate
  });

  if (!candidate) {
    return annotateAssessmentFallback(fallback, `${stage}:no-candidate`);
  }

  try {
    const completion = await generateCompletion({
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      system,
      prompt,
      config: {
        host: candidate.host,
        apiKey: candidate.apiKey,
        baseUrl: candidate.baseUrl,
        format: "json"
      }
    });
    return parseAssessmentJson(completion?.text, { stage, fallback });
  } catch (error) {
    return annotateAssessmentFallback(fallback, `${stage}:fallback:${error?.message ?? error}`);
  }
}

async function resolveAssessmentCandidate({ root, taskClass, chooseCandidate = null }) {
  const route = await routeTask({ root, taskClass });
  if (typeof chooseCandidate === "function") {
    return chooseCandidate(route);
  }
  return route.recommended ?? route.candidates?.[0] ?? null;
}

function parseAssessmentJson(text, { stage, fallback }) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return annotateAssessmentFallback(fallback, `${stage}:empty-response`);
  }

  const candidates = [raw];
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.unshift(fencedMatch[1].trim());
  }

  const jsonSlice = extractJsonSlice(raw);
  if (jsonSlice && !candidates.includes(jsonSlice)) {
    candidates.unshift(jsonSlice);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next normalization candidate.
    }
  }

  return annotateAssessmentFallback(fallback, `${stage}:invalid-json`);
}

function extractJsonSlice(raw) {
  const trimmed = String(raw ?? "").trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }
  return null;
}

function buildFallbackAssessmentPlan(target, options) {
  const scope = String(options.scope ?? "general").trim() || "general";
  return {
    source: "heuristic-fallback",
    scope,
    target: `${target.type}:${target.id}`,
    steps: [
      `Inspect current workflow state for ${target.type}:${target.id}.`,
      `Summarize the highest-risk issues within the ${scope} scope.`,
      "Recommend the smallest safe next action with verification."
    ]
  };
}

function buildFallbackAssessmentCriticism(plan, target, options) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  return {
    source: "heuristic-fallback",
    target: `${target.type}:${target.id}`,
    scope: String(options.scope ?? "general").trim() || "general",
    flaws: steps.length ? [] : ["The assessment plan has no concrete steps."],
    missingPoints: [
      "Confirm whether the current workflow state is actionable.",
      "Name the smallest verification needed for the next action."
    ]
  };
}

function buildFallbackRefinedAssessmentPlan(plan, criticism, target, options) {
  const originalSteps = Array.isArray(plan?.steps) ? plan.steps : [];
  const missingPoints = Array.isArray(criticism?.missingPoints) ? criticism.missingPoints : [];
  const steps = originalSteps.length ? [...originalSteps] : buildFallbackAssessmentPlan(target, options).steps.slice();
  for (const missingPoint of missingPoints) {
    const normalized = String(missingPoint ?? "").trim();
    if (!normalized) {
      continue;
    }
    if (!steps.some((step) => step === normalized)) {
      steps.push(normalized);
    }
  }
  return {
    source: "heuristic-fallback",
    scope: String(options.scope ?? "general").trim() || "general",
    target: `${target.type}:${target.id}`,
    steps
  };
}

function annotateAssessmentFallback(payload, reason) {
  return {
    ...payload,
    fallback: {
      used: true,
      reason: String(reason ?? "fallback").trim()
    }
  };
}
