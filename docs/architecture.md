# Architecture

`docs/PROJECT_PLAN.md` is the authoritative specification. This file adds only
the module boundaries for `src/`. For responsibilities see plan §5, for the
CLI contract §7, for verification rules §8, for engineering choices §12, and
for open decisions §16.

## Status

Only the I-01 skeleton exists: a CLI entry point with `--help` and `--version`.
No command in the CLI contract is implemented yet. The CLI must not claim that
one works.

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
