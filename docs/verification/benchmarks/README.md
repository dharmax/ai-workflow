# Benchmark Evidence

Controlled AIWF dogfood studies place sanitized evidence bundles here.

Each study should include:

- one exported JSON evidence bundle from `aiwf metrics export`;
- one concise Markdown note describing the frozen task, variants, acceptance/evaluation method and caveats.

Recommended metric tags:

```text
study=<stable-study-id>
scenario=<stable-scenario-id>
variant=<variant-name>
trial=<integer>
```

Do not delete failed or contaminated trials merely because they weaken the result. Retain them or explicitly document why they were excluded from a comparison.

A benchmark note should separate:

1. **measured facts** — tokens, calls, duration, tool activity, termination, verification;
2. **evaluated facts** — acceptance results, seeded-fault detection, human review;
3. **unavailable facts** — e.g. external-agent tokens not exposed by the client;
4. **interpretation** — conclusions supported by the above.

Never infer zero cost from unavailable pricing and never treat AIWF's self-review as independent quality evidence.
