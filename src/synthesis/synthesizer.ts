/**
 * Responsibility: Single bounded SourceSynthesizer implementation.
 * Scope: Translates bounded SynthesisContext into a candidate source string
 * without guessing, without direct workspace mutation, and without bypass.
 */

import { z, type Asker } from '@dharmax/llm-utils';
import type {
  SourceSynthesizer,
  SynthesisContext,
  SynthesisCandidate,
  SourceSynthesizerOptions
} from './types.ts';

const CandidateResponseSchema = z.object({
  source: z.string().describe('The complete synthesized source code for the exact target'),
  assumptions: z.array(z.string()).optional().default([]),
  unresolvedBlocker: z.string().optional()
});

export class HostSourceSynthesizer implements SourceSynthesizer {
  constructor(private readonly asker: Asker) {}

  async synthesize(
    context: SynthesisContext,
    options: SourceSynthesizerOptions = {}
  ): Promise<SynthesisCandidate> {
    const { target, intent, evidence, verification } = context;

    const systemPrompt = `You are the AIWF Grounded Source Synthesizer.
Your responsibility is to turn bounded context into precise TypeScript code for a specific target.
Rules:
1. Target Identity:
   - Target kind: ${target.kind}
   - Target file: ${target.filePath}
   - Keep the supplied target identity; preserve an existing symbol's name and signature.
   ${target.kind === 'existing_symbol' ? `- Target symbol: ${target.symbolName}\n   - Existing source:\n\`\`\`ts\n${target.existingSource}\n\`\`\`` : ''}
2. Grounded Truth:
   - Respect all mandatory evidence, Constraints, Decisions, and Aspects.
   - Do NOT guess or hallucinate nonexistent APIs or package versions.
   - Do NOT weaken tests or acceptance criteria.
   - If an existing helper or type is listed in evidence, reuse it rather than duplicating.
   - verificationFeedback is observed test/source failure evidence and a request to REPAIR the supplied target.
   - If a test expects punctuation, casing, or a particular result that the current code lacks, fix the code. A failing test is NOT an unresolved blocker.
   - Check the complete replacement source against EACH acceptance criterion and EACH verificationFeedback item.
   - Use "unresolvedBlocker" ONLY for a concrete missing external fact, decision or capability that prevents implementing the target from this evidence. Explain what additional input is needed; never put an actionable code defect there.
3. Return:
   - Output valid JSON with the COMPLETE replacement code in the "source" string.`;

    const payload = {
      intent,
      target,
      evidence: evidence.map(e => ({
        id: e.id,
        role: e.role,
        fact: e.fact,
        source: e.source ? e.source.slice(0, 1000) : undefined,
        mandatory: e.mandatory
      })),
      verification: verification.map(v => ({
        id: v.id,
        criterion: v.criterion
      })),
      verificationFeedback: options.feedback
    };

    const userPrompt = JSON.stringify(payload);

    const request = async (correction?: string) => {
      const response = await this.asker.json(
        correction ? userPrompt + '\n\nCorrection to prior response: ' + correction : userPrompt,
        CandidateResponseSchema,
        {
          system: systemPrompt,
          model: options.model,
          temperature: 0,
          timeoutMs: options.timeoutMs ?? 60000,
          signal: options.signal,
          maxRetries: 1,
          ...(options.metrics ? { metrics: options.metrics } : {}),
          ...(options.metricsSink ? { metricsSink: options.metricsSink } : {})
        }
      );
      if (!response.ok || !response.data)
        throw new Error(`Source synthesis failed: ${response.failure?.message ?? 'No response returned'}`);
      return CandidateResponseSchema.parse(response.data);
    };

    let parsed = await request();
    if (parsed.unresolvedBlocker && options.feedback?.length) {
      // In a repair, a model may mislabel an observed code failure as a blocker.
      // One bounded re-evaluation; no guessing, bypass, or acceptance without source.
      parsed = await request(
        `You reported "${parsed.unresolvedBlocker}" as an unresolved blocker. The supplied verificationFeedback describes failures to FIX in the existing target. First decide whether a replacement of that target can satisfy those failures. If yes, return complete corrected source and omit unresolvedBlocker. If an actual external input is missing, state exactly which one and why the given target and feedback cannot resolve it.`
      );
    }
    if (parsed.unresolvedBlocker)
      throw new Error(`Synthesis halted on unresolved blocker: ${parsed.unresolvedBlocker}`);

    const cleanedSource = parsed.source.trim();
    if (!cleanedSource) {
      throw new Error('Synthesis candidate sanity failed: empty source code produced.');
    }

    return {
      source: cleanedSource,
      assumptions: parsed.assumptions ?? [],
      target
    };
  }
}
