# ai-openspec-invariants

Invariant governance layer on top of OpenSpec. For the purpose and scope, read [plan §1](docs/PROJECT_PLAN.md#1-executive-summary) and [§4](docs/PROJECT_PLAN.md#4-scope-and-explicit-non-goals).

**Status:** Skeleton only: no invariant is checked or enforced yet. None of the planned commands
(`init`, `doctor`, `audit export`, `check`, `verify`, `report`) is implemented. This package is
**not published to npm**.

## Prerequisites

- Node.js >= 22.18
- npm (Node 22/24 are the supported lines)

## Development commands

```bash
npm ci                 # install exact locked dependencies
npm run build          # emit dist/ from src/
npm run typecheck      # strict type-check (noEmit)
npm run lint           # ESLint flat config, type-checked
npm run format:check   # Prettier check
npm test               # build, then node:test over tests/**/*.test.ts
npm run pack:smoke     # pack, install the tarball, run the installed bin
npm run verify         # typecheck, lint, format:check, test, pack:smoke
```

## Usage

```bash
node dist/cli/index.js --help
node dist/cli/index.js --version
```

## Exit codes

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| 0    | Success                                                                 |
| 1    | A gate failed (reserved for future `check`, `verify`, `report --check`) |
| 2    | Usage or internal error                                                 |

## License

MIT. See [LICENSE](LICENSE).

## Documentation

- [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) — authoritative plan
- [docs/architecture.md](docs/architecture.md) — module boundaries
- [docs/registry-schema.md](docs/registry-schema.md) — registry schema, fields and diagnostics
- [Issues](https://github.com/starigazdam/ai-openspec-invariants/issues) and [milestones](https://github.com/starigazdam/ai-openspec-invariants/milestones) — backlog
