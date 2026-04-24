# @dharmax/llm-utils

A generic, sophisticated, and high-fidelity bridge for code-to-LLM interactions. This package provides a robust orchestration layer that handles routing, prompt management, context grounding, and session continuity for modern AI applications.

## Features

- **Dynamic Routing**: Advanced heuristics and model-fit scoring to automatically select the best model for any task (Logic, Strategy, Prose, Architecture, etc.).
- **LLM Token Economy**: Built-in logic for autonomous cost and performance optimization. Dynamically maps and scores models to ensure you always use the most efficient model for the job.
- **High-Density Context**: Built-in integration for semantic noise removal and pattern-based compression, ensuring your prompts remain compact and token-efficient.
- **Managed Continuity**: `LLMSession` provides recursive context condensation and a multi-call "Grounding Loop" for high-fidelity interactions.
- **Multi-Provider Support**: Unified adapters for OpenAI, Google Gemini, Anthropic, and local LLM instances (like Ollama).
- **Deep Metrics**: Automated tracking of turn count, token usage, latency, and estimated USD cost per session.
- **System Awareness**: Built-in probes for environment readiness and tool availability.

## Installation

```bash
npm install @dharmax/llm-utils
```

## Quick Start

### Basic "Asker" usage

```javascript
import { Asker, ContextManager, PromptEngine } from '@dharmax/llm-utils';

// 1. Setup providers and task definitions
const providers = [{ id: 'ollama', host: 'localhost' }];
const taskTypes = [{ id: 'code', weights: { logic: 0.8, strategy: 0.2 } }];

// 2. Initialize the Asker with your storage and template adapters
const asker = new Asker(providers, taskTypes, myContextManager, myPromptEngine);
await asker.refreshMapping(availableModels);

// 3. Ask away
const result = await asker.ask("Write a quicksort in JS", "code");
console.log(result.text);
```

### Managed "LLMSession" with Grounding

```javascript
import { LLMSession } from '@dharmax/llm-utils';

const session = new LLMSession(asker);
const turn = await session.prompt('code-review', { code: '...' });

console.log(`Tokens used: ${turn.usage.totalTokens}`);
console.log(`Estimated cost: $${session.getContext().metrics.estimatedCostUsd}`);
```

## Architecture

This package is built on **High-Fidelity Abstractions**:
- `InteractionProvider`: Decouples LLM communication.
- `StorageBackend`: Abstract interface for guideline/knowledge storage (SQL, Vector, etc.).
- `TemplateSource`: Decouples prompt loading (Filesystem, Cloud, etc.).

## Supporting the Project

If you find this utility valuable and wish to support its continued development, donations are gratefully accepted.

- **PayPal**: [dharmax@gmail.com](https://www.paypal.com/paypalme/dharmax)

## License

MIT
