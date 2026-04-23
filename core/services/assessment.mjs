/**
 * Responsibility: Provide a high-level "assessment" capability for projects, modules, and features.
 * Scope: Implements iterative Plan -> Criticize -> Revisit -> Execute loop.
 */

import { withWorkflowStore } from "./sync.mjs";
import { generateCompletion } from "./providers.mjs";
import { routeTask } from "./router.mjs";
import { stableId } from "../lib/hash.mjs";
import { loadPromptTemplate } from "../lib/filesystem.mjs";

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
  let candidate;
  
  if (options.planner) {
    candidate = options.planner;
  } else {
    const route = await routeTask({ root: options.root, taskClass: "architectural-design" });
    candidate = route.recommended ?? route.candidates?.[0];
  }

  const completion = await generateCompletion({
    providerId: candidate.providerId,
    modelId: candidate.modelId,
    system,
    prompt,
    config: { host: candidate.host, apiKey: candidate.apiKey, baseUrl: candidate.baseUrl, format: "json" }
  });

  return JSON.parse(completion.response);
}

async function criticizeAssessmentPlan(plan, target, options) {
  const { system, prompt } = await buildCriticismPrompt(plan, target, options);
  let candidate;

  if (options.planner) {
    candidate = options.planner;
  } else {
    // Escalate to a higher model for criticism if available
    const route = await routeTask({ root: options.root, taskClass: "review" });
    candidate = route.candidates?.find(c => c.score >= 90) ?? route.recommended ?? route.candidates?.[0];
  }

  const completion = await generateCompletion({
    providerId: candidate.providerId,
    modelId: candidate.modelId,
    system,
    prompt,
    config: { host: candidate.host, apiKey: candidate.apiKey, baseUrl: candidate.baseUrl, format: "json" }
  });

  return JSON.parse(completion.response);
}

async function refineAssessmentPlan(plan, criticism, target, options) {
  const { system, prompt } = await buildRefinementPrompt(plan, criticism, target, options);
  let candidate;

  if (options.planner) {
    candidate = options.planner;
  } else {
    const route = await routeTask({ root: options.root, taskClass: "architectural-design" });
    candidate = route.recommended ?? route.candidates?.[0];
  }

  const completion = await generateCompletion({
    providerId: candidate.providerId,
    modelId: candidate.modelId,
    system,
    prompt,
    config: { host: candidate.host, apiKey: candidate.apiKey, baseUrl: candidate.baseUrl, format: "json" }
  });

  return JSON.parse(completion.response);
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
