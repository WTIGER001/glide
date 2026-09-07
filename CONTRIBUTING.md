# Contributing to Glide

Glide is intentionally limited to low-latency inline code completion. Please discuss proposals that add providers, cross-file indexing, chat, agents, or new UI surfaces before implementing them.

## Development checks

Use Node.js 24 LTS or newer, then run:

```bash
npm install
npm run check
npm run package
```

Tests and fixtures must not contain real credentials or proprietary source. Runtime logs and statistics must remain source-free. Any prompt, context, debounce, or output-processing change should include focused tests and benchmark evidence.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
