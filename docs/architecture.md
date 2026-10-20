# Architecture

[PROJECT_PLAN.md](PROJECT_PLAN.md) is the authoritative specification. This
file adds only the module boundaries for `src/`. For responsibilities read
[plan §5](PROJECT_PLAN.md#5-architecture), for the CLI contract
[§7](PROJECT_PLAN.md#7-cli-contract), for verification rules
[§8](PROJECT_PLAN.md#8-deterministic-integrity-and-verification), for
engineering choices [§12](PROJECT_PLAN.md#engineering-choices), and for open
decisions [§16](PROJECT_PLAN.md#decisions-for-maintainer-confirmation).

## Modules

| Directory | Contents | Allowed I/O |
| --- | --- | --- |
| `src/cli/` | Argument parsing, one file per command, exit codes, output format | stdout/stderr, calls the other modules |
| `src/core/` | Registry model, diagnostics, reference graph, integrity rules | None. Pure functions on parsed data |
| `src/adapters/` | OpenSpec CLI subprocess, JUnit XML, TRX | Subprocess (no shell), read files |
| `src/integration/` | `init` project setup, safe `config.yaml` patch | Read/write in the consumer repo, opt-in only |
| `src/render/` | Deterministic `INVARIANTS.md` | None. Returns a string |

Dependency direction: `cli` → (`integration`, `adapters`, `render`) → `core`.
`core` imports no other module. Adapters convert external data into core types
at the boundary. Add a module or file only when an issue needs it.
`schemas/invariants.schema.json` is the editor-facing schema; the
zero-dependency validator in `src/core/registry.ts` is authoritative.
