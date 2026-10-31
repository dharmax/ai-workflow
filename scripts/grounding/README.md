# Standalone Qwen grounding probe

Optional Ollama diagnostic. **Not** in AIWF's normal test suite or release gate; imports no AIWF code, calls no MCP tools, and uses synthetic records only.

Tests two independently observed errors: confusing an archived claimant with the current one; and inventing an expansion for opaque predicate mode `H`. Reports exact answers, supporting record IDs, invented positive assertions, format errors and transport errors.

```bash
bun scripts/grounding/qwen2.5-grounding.ts --selftest
OLLAMA_URL=http://lotus:11434 bun scripts/grounding/qwen2.5-grounding.ts

# Optional higher-precision comparison / repeated runs:
MODELS=qwen2.5:14b-instruct-q3_K_M,qwen2.5:14b-instruct-q4_K_M REPEATS=3 \
  OUT=/tmp/qwen-grounding-comparison.json bun scripts/grounding/qwen2.5-grounding.ts
```

Ten isolated cases per model and per prompt mode (`baseline`, `explicit`). Each case uses a new one-request chat, with temperature 0 and 60-second request timeout unless overridden with `TIMEOUT_MS`. JSON raw results default to `/tmp/qwen-grounding-results.json`.

Interpretation: Prompt sensitivity is not proof that Q3 quantization caused the original hallucinations. Compare models with identical inputs and keep environment failures separate from factual grounding. No project data leaves the local test harness.
