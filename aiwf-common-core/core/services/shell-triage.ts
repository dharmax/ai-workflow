/**
 * Responsibility: Triage shell requests into one of three tiers: Deterministic, Assistant, or Orchestrator.
 * Scope: Fast heuristics and cheap-LLM intent classification.
 */

import { ShellTier } from "./shell-triage.types.ts";
import type { ShellIntent, TriageResult } from "./shell-triage.types.ts";
import { generateCompletion } from "./providers.ts";

/**
 * Perform surgical triage on user input to determine the appropriate interpretation mode.
 */
export async function triageShellRequest(
  inputText: string, 
  options: {
    root?: string;
    noAi?: boolean;
    mode?: string;
    plannerContext?: any;
    providerState?: any;
    history?: { role: string, content: string }[];
  } = {}
): Promise<TriageResult> {
  try {
    const text = String(inputText ?? "").trim();
    const lower = text.toLowerCase();

    // --- Tier 1: Deterministic Heuristics (Instant, Zero-Cost) ---
    if (isTier1Primitive(lower)) {
      return {
        intent: {
          tier: ShellTier.Tier1,
          confidence: 1.0,
          reason: "Matched explicit Tier 1 primitive.",
          extracted: { primitive: lower, isMutation: false }
        }
      };
    }

    // History Awareness (BUG-TRIAGE-001)
    const referentialWords = ["it", "that", "those", "them", "then", "continue", "do it", "go ahead"];
    const isElliptical = text.split(/\s+/).length <= 3 && referentialWords.some(w => lower.includes(w));
    if (isElliptical && (options.history?.length ?? 0) > 0) {
      return {
        intent: {
          tier: ShellTier.Tier2, // Default elliptical follow-ups to Assistant tier
          confidence: 0.8,
          reason: "Elliptical follow-up detected with active history.",
          extracted: { isMutation: true } // Assume mutation for "do it" safety
        }
      };
    }

    // If No-AI mode is forced, everything non-primitive is rejected or forced to Tier 1
    if (options.noAi) {
      return {
        intent: {
          tier: ShellTier.Tier1,
          confidence: 1.0,
          reason: "No-AI mode enabled; forcing Tier 1 interpretation.",
          extracted: { isMutation: false }
        }
      };
    }

    // --- Tier 2 vs Tier 3 Logic (Cheap-LLM Gate) ---
    const complexityMetrics = analyzeComplexityHeuristically(text);
    
    if (complexityMetrics.looksLikeComplexFlow) {
      return {
        intent: {
          tier: ShellTier.Tier3,
          confidence: 0.85,
          reason: "High complexity detected (branching words, multiple verbs, or explicit orchestration intent).",
          extracted: { isMutation: complexityMetrics.hasMutationHint }
        }
      };
    }

    return {
      intent: {
        tier: ShellTier.Tier2,
        confidence: 0.9,
        reason: "Standard conversational or tool-use intent.",
        extracted: { isMutation: complexityMetrics.hasMutationHint }
      }
    };
  } catch (error) {
    // Fall-safe to Tier 2 on triage failure (BUG-SHELL-ERROR-001)
    return {
      intent: {
        tier: ShellTier.Tier2,
        confidence: 0.5,
        reason: `Triage failed: ${error.message}. Falling back to standard assistant.`
      }
    };
  }
}

function isTier1Primitive(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ");
  const primitives = [
    "help", "/help", "doctor", "version", "sync", 
    "list tickets", "show tickets", "status", "summary",
    "provider status", "providers", "metrics", "reprofile", "plan", "mutate"
  ];
  
  if (primitives.includes(normalized)) return true;
  
  return /^ticket\s+[A-Z0-9-]+$/i.test(normalized)
    || /^search\s+.+$/i.test(normalized)
    || /^run\s+[a-z0-9_-]+(\s+.*)?$/i.test(normalized)
    || /^config\s+(get|set|unset|clear)\b.*$/i.test(normalized)
    || /^route\s+[a-z0-9_-]+$/i.test(normalized);
}


function analyzeComplexityHeuristically(text: string) {
  const lower = text.toLowerCase();
  
  // Indicators for Orchestrator/Compiler (Tier 3)
  const branchingWords = ["if", "then", "else", "loop", "until", "for each", "while", "branch"];
  const sequenceWords = ["first", "second", "then", "finally", "step-by-step"];
  const complexVerbs = ["reconcile", "orchestrate", "migrate", "scaffold", "refactor all", "verify every"];
  
  const wordCount = text.split(/\s+/).length;
  const hasBranching = branchingWords.some(w => lower.includes(w));
  const hasSequence = sequenceWords.some(w => lower.includes(w));
  const hasComplexVerbs = complexVerbs.some(v => lower.includes(v));
  
  return {
    looksLikeComplexFlow: (wordCount > 15 && (hasBranching || hasSequence)) || hasComplexVerbs,
    hasMutationHint: /\b(fix|change|update|delete|create|move|refactor|mutate)\b/i.test(text)
  };
}
