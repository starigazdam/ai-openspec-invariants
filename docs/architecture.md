# Architecture

`docs/PROJECT_PLAN.md` is the authoritative specification. This file states the
module boundaries that every implementation issue must keep. It adds no new
functionality.

## Status

Only the I-01 skeleton exists: a CLI entry point with `--help` and `--version`.
No command in the CLI contract (`init`, `doctor`, `audit export`, `check`,
`verify`, `report`) is implemented yet. The CLI must not claim that one works.

## Product boundary

| Owner | Responsibility |
| --- | --- |
| OpenSpec (external prerequisite) | Specs, scenarios, change deltas, standard validation, archive lifecycle |
| This package | Invariant registry, canonical ownership, consumer links, test mapping, generated index |
| Consumer CI | Runs the tests and supplies fresh reports from the same checkout |
| AI audit skill | Advisory findings only; never edits specs or the registry |
| Human | Approves every semantic add, modify, retire, or owner transfer |

The package does not call an LLM, run a server, use a database, or define a
requirement DSL.

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

## Fixed technical decisions

- OpenSpec data comes only from published CLI JSON output, for example
  `openspec list --specs --json`. The adapter checks the version and fails on
  unknown output. It never falls back to success.
- Test evidence comes only from runner reports (JUnit XML, then TRX), with exact
  identity matches. There is no wildcard or substring match.
- `check` is static and runs without tests. `verify` reads test reports. Keep
  them separate.
- Default output is for humans. `--json` gives stable diagnostic codes. Exit
  code 0 means success; any failure gives a nonzero exit code.
- Subprocesses run without a shell. XML parsing rejects external entities.
  Paths stay inside the project root. Commands make no network calls.
- `openspec/invariants.yaml` is the only file that authors edit.
  `openspec/INVARIANTS.md` is generated.

## Open decisions

These do not block the skeleton. The maintainer must confirm them before release.

- npm scope and published package name. The working name is `openspec-invariants`, marked `private`.
- License. The working choice is `UNLICENSED`, a placeholder until a decision.
- JSON Schema or Zod for the registry. I-02 decides.
- JUnit and TRX identity normalization. I-05 and I-08 freeze it with real fixtures.
- Whether the skill install is opt-in. The proposal is opt-in (`init --skill`).
