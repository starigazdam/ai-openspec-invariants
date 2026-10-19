# openspec-invariants

A thin, independently installable invariant governance layer on top of OpenSpec. It owns a small,
curated inventory of durable cross-capability guarantees, links each to one canonical OpenSpec
requirement, records its consumers and reusable implementation, and requires automated passing test
evidence for every active invariant. OpenSpec keeps owning requirements, change proposals, scenarios,
and their lifecycle; this package does not replace it.

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

UNLICENSED until the maintainer chooses a license.

## Documentation

- [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) — authoritative plan
- [docs/architecture.md](docs/architecture.md) — module boundaries
- [planning/issue-manifest.yaml](planning/issue-manifest.yaml) — issue backlog
