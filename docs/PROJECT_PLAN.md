# OpenSpec Invariants — Project Plan

**Status:** Proposal / implementation handoff  
**Prepared:** 2026-10-19  
**Proposed repository:** `openspec-invariants`  
**Distribution:** versioned npm CLI package (package scope chosen by maintainer)  
**Primary audience:** engineers and AI coding agents using OpenSpec in existing repositories

## 1. Executive summary

Build a **thin, independently installable invariant governance layer on top of OpenSpec**. OpenSpec continues to own requirements, change proposals, scenarios, and their lifecycle. The new package owns a **small, curated inventory of durable cross-capability guarantees**, links each to **one canonical OpenSpec requirement**, identifies its **consumers and reusable implementation**, and mandates **automated passing test evidence for every active invariant**.

**Product promise:** "Discover shared contracts before building, maintain one authoritative owner, and fail CI if an active contract loses its executable evidence."

The package must **not** become a second SDD framework or replace OpenSpec's documents.

## 2. The problem

AI coding agents produce many detailed specs and changes. Over time, a repository develops:

- **Semantic duplication:** differently worded requirements specify the same behavior in different capabilities.
- **Contradiction:** two specifications establish incompatible rules for the same scenario.
- **Unnecessary parallel implementations:** a new agent recreates an existing mechanism because it did not discover a canonical owner.
- **Lost traceability:** after renaming, moving, or changing requirements/tests, nobody can reliably tell which guarantees are still verified.
- **Human navigation costs:** engineers cannot maintain a concise mental model by rereading all OpenSpec history.

Existing OpenSpec structural validation is valuable but cannot prove semantic uniqueness or actual test coverage. AI review can suggest potential conflicts, but must not be trusted as a deterministic CI gate.

### Success criteria

1. A human can browse a finite, categorized index of active system guarantees in minutes.
2. An agent designing a change has instructions and commands to discover existing affected contracts before implementation.
3. Each active invariant resolves to exactly one canonical, current OpenSpec requirement.
4. Each active invariant has at least one uniquely discoverable, executed, **passing** automated test case.
5. Deterministic CI fails for missing references, missing tests, skipped tests, failing tests, ambiguous test identities, or stale generated index.
6. An initial read-only audit can propose duplicate/conflict consolidation with evidence; humans approve semantic changes.
7. Tooling is installed/upgraded independently in multiple existing OpenSpec repositories and is idempotent.

## 3. Terminology and governance rules

**Invariant** = an enduring, consequential behavioral guarantee that must remain true across changes (e.g., "one business operation never produces two captures"). It is **not** a feature request, one-time acceptance criterion, or chosen technology.

**Canonical requirement** = the single OpenSpec capability requirement that normatively defines this invariant (including scenarios). OpenSpec remains the source of truth for behavioral wording; the registry holds a short *summary/index*, not a copy of detailed requirements.

**Consumer** = another capability or subsystem subject to the invariant. Consumer-specific scenarios may exist, but they should reference the shared contract rather than independently redefine it.

**Test evidence** = a specific test case identified by a runner adapter and proven to have executed successfully in the current CI test-result set. A path existing on disk or an annotation matching text is insufficient.

**Candidate** = an audit suggestion not yet approved. Candidates live **outside** the enforced registry, in the audit report / issue backlog. No "active, untested" loophole.

**Retired ID** = an identifier that must never be silently reused; retain a tombstone/supersession record, but retired guarantees are not current invariants and do not require ongoing test execution.

### Hard policies

- Exactly **one canonical OpenSpec owner** per active invariant.
- **At least one linked automated test**, and **all linked required tests must pass**, for each active invariant.
- A missing, skipped, ambiguous, not-run, or failing required test makes CI red; no "assume passed" states.
- No active invariant is introduced solely by AI assertion, by reading implementation code, or by automatically accepting audit results.
- Human approval is required for semantic add/modify/retire/owner-transfer decisions.
- Registry IDs are permanent; retirement/supersession preserves history and prevents ID reuse.
- Nothing in the registry implies that code reuse is always mandatory: one guarantee may have multiple legitimate implementations. However, agents must *consider* existing implementations and justify new parallel ones.
- Semantic similarity findings are advisory; syntactic and test-result checks are blocking.

### Invariant admission test

Admit an invariant only if it is (a) materially consequential if broken, (b) enduring across multiple changes, (c) not fully covered by an existing invariant, and (d) mechanically testable. Ordinary feature acceptance criteria remain in OpenSpec specs and scenarios. Optimize for a **small index**, not maximal coverage of every requirement.

## 4. Scope and explicit non-goals

### MVP (v0.1)

- Node.js/TypeScript standalone CLI installed as an npm devDependency.
- Safe, idempotent `init` for an already initialized OpenSpec repo.
- `openspec/invariants.yaml` as the only author-edited active invariant registry.
- JSON Schema/Zod validation, OpenSpec requirement/consumer resolution, stable ID and tombstone validation.
- `check` for deterministic static integrity.
- `verify` against **JUnit XML** test reports; add **.NET TRX** in MVP's second slice (required before declaring cross-stack support).
- `report` creates a deterministic, human-readable `openspec/INVARIANTS.md`, with `--check` for CI.
- `audit export` creates a deterministic spec/requirement inventory; distributable AI audit skill consumes it and proposes findings with evidence.
- OpenSpec instructions installed via project config and/or a dedicated skill; no fork of OpenSpec workflow.
- GitHub Actions CI examples, sample consumer project, end-to-end fixture tests, baseline docs.

### Not in v0.1

- AI model API calls inside the CLI; autonomous semantic decisions; vector database/search server.
- New requirement DSL, requirement database, dashboard frontend, or mandatory custom OpenSpec schema.
- Auto-merging or auto-deleting duplicate specs, auto-refactoring production code.
- Cryptographic proof of correctness or automatic proof that a test assertion semantically proves its linked invariant.
- Blanket requirement that **every OpenSpec scenario** be tested (different policy; possible future option).
- Full source-code duplicate detection / AST-based code reuse enforcement.
- Automated rewriting of existing tests to inject IDs, or automatic changes to consumers' test runners.

## 5. Architecture

```text
                  Standalone npm package
             @<scope>/openspec-invariants
        ┌────────────────────────────────────┐
        │ CLI: init / audit export / check    │
        │      verify / report / doctor       │
        │                                    │
        │ core: schema, graph, integrity      │
        │ adapters: OpenSpec CLI, JUnit, TRX  │
        │ integration: config guidance/skill │
        │ render: deterministic Markdown     │
        └──────────────────┬─────────────────┘
                           │ installed as devDependency
          ┌────────────────┴────────────────┐
          │ existing application repository │
          │ openspec/specs/**/spec.md       │ ← normative details
          │ openspec/changes/**            │ ← current change lifecycle
          │ openspec/config.yaml           │ ← additive agent guidance
          │ openspec/invariants.yaml       │ ← curated identity / references
          │ openspec/INVARIANTS.md          │ ← generated human view
          │ tests/** + CI test reports      │ ← actual verification evidence
          └─────────────────────────────────┘
```

Use **OpenSpec published CLI JSON output** through a version-aware adapter (`openspec list --specs --json`, `openspec show <capability> --type spec --json`). Do not read unexported OpenSpec internals. Parse OpenSpec CLI output defensively and report incompatible versions. Prefer test-runner-generated reports to scanning test source files.

### Responsibility split

| Owner | Responsibility |
| --- | --- |
| OpenSpec | Current specifications, scenarios, change deltas, standard validation, archive lifecycle |
| Extension core | Registry schema, ID uniqueness, canonical ownership, consumer links, test mapping, generated index |
| Test adapters | Normalize exact case identity and execution status from runner reports |
| CI | Run tests; supply reports from this build; block merges on integrity/verification failures |
| AI audit skill | Discover possible semantic overlap, contradictions, missing canonical contracts and duplicate implementations |
| Human | Approve durable guarantees, owner transfer, merging/supersession and exceptions to proposed designs |

## 6. Consumer repository structure

```text
my-project/
├── openspec/
│   ├── config.yaml                    # existing; instructions appended safely
│   ├── specs/
│   │   ├── execution-identity/spec.md
│   │   ├── manual-execution/spec.md
│   │   └── scheduled-execution/spec.md
│   ├── changes/...
│   ├── invariants.yaml                # human maintained
│   └── INVARIANTS.md                  # generated; do not edit
├── .agents/skills/
│   └── openspec-invariant-audit/SKILL.md  # opt-in installed skill
├── tests/...
├── package.json
└── .github/workflows/...
```

Project-wide configuration may live at `openspec-invariants.config.yaml` in the root if additional reporter settings become necessary. **Do not introduce it until there is a concrete need**; CLI flags and the registry should suffice initially.

### `openspec/invariants.yaml` — v1 illustrative contract

```yaml
version: 1
invariants:
  - id: EXE-001
    title: Single active execution
    summary: A task identity must not have overlapping active executions.
    owner:
      capability: execution-identity
      requirement: Single active execution
    consumers:
      - manual-execution
      - scheduled-execution
    implementation:       # optional navigational hints, not executable proof
      - src/execution/identity.ts
    tests:
      - id: EXE-001-T1        # immutable logical mapping ID
        format: junit
        case: 'ExecutionIdentityTests::concurrent_start_is_rejected'
      - id: EXE-001-T2
        format: trx
        case: 'Company.Tests.ExecutionIdentityTests.RestartKeepsLock'

retired:
  - id: EXE-000
    supersededBy: EXE-001
    reason: Replaced by canonical execution-identity guarantee
```

**Schema principles:**

- `summary` is descriptive index text; the authoritative normative text stays in `openspec/specs/.../spec.md`.
- `owner.capability` must resolve exactly; `owner.requirement` matches one exact OpenSpec requirement name (rename must be an intentional registry update).
- Every listed `consumer` must resolve to an existing capability; consumer-specific test coverage is encouraged, not yet mandated separately.
- `tests` must be nonempty for all active entries; test mapping IDs must be unique; no wildcard or substring matching of case names.
- `case` is an **exact normalized identifier from a test adapter**. The JUnit normalization above (`classname::name`) is an illustrative candidate; document/freeze normalization with fixtures before release. For TRX prefer unique fully qualified test case names and reject ambiguous names.
- Paths must be repository-relative, normalized, and constrained to the project root (no `../` path escape).
- Registry is strictly canonical and ordered deterministically (e.g., IDs sorted for report); do not create a second editable Markdown truth.
- Reserved IDs in `retired` cannot be reused. A retirement is a reviewed change, not a workaround for failing tests.

**Test portability:** Project test frameworks may produce unstable display names. Prefer explicit stable test names/traits when the runner exports them; the adapter must verify the exact identity present in report data, and fail loudly when a requested identity cannot be proved. In particular, do **not** assume .NET xUnit traits are serialized in TRX unless tested with fixtures. For .NET use the TRX test case identifier actually emitted by its adapter.

## 7. CLI contract

Proposed executable: `openspec-invariants`.

| Command | Behavior | Writes? | CI gate? |
| --- | --- | --- | --- |
| `init [--dry-run] [--skill]` | Detect OpenSpec, scaffold registry, preview/apply safe config guidance and optional skill | Yes, opt-in | No |
| `doctor` | Check OpenSpec CLI/version, registry, supported adapters and runner configuration | No | Diagnostic |
| `audit export [--output path]` | Export spec and requirement inventory for agent audit | Output only | No |
| `check [--json]` | Structural registry/ownership/links integrity; active invariants must have test mappings | No | **Yes** |
| `verify --results <path>... [--json]` | Read reports from this CI run and ensure each linked test executed successfully | No | **Yes** |
| `report --write` | Regenerate navigable `INVARIANTS.md` from registry and resolved refs | Generated file | No |
| `report --check` | Fail if generated index differs from expected | No | **Yes** |

Do not conflate `check` and `verify`: `check` works without running tests; `verify` consumes test-run results. CLI defaults to clear human messages and exit code 0 on success, nonzero on failure; `--json` exposes machine-readable stable diagnostic codes, affected invariant ID, source location, and remediation hint.

### Install and use (desired DX; commands are proposed, not yet published)

```bash
npm install --save-dev @YOUR_SCOPE/openspec-invariants
npx openspec-invariants init --dry-run
npx openspec-invariants init --skill
npx openspec-invariants audit export --output invariant-audit-input.json
# AI audit reads inventory; human approves candidate merges/new invariants
npx openspec-invariants check
npx openspec-invariants report --write
# after existing test commands generated JUnit and/or TRX reports:
npx openspec-invariants verify --results 'test-results/**/*.xml' --results 'test-results/**/*.trx'
npx openspec-invariants report --check
```

`init` never runs arbitrary package scripts or rewrites tests. It must be safe to run repeatedly. It must not replace existing OpenSpec schemas/skills. If comment-preserving config modification cannot be performed safely, **stop, show a minimal patch, and leave the file unchanged** rather than rewriting a project's YAML wholesale. `init` should not silently insert GitHub workflows; provide a template/snippet and an optional explicit future installer.

## 8. Deterministic integrity and verification

### `check` hard failures

- malformed schema, unsupported schema version, duplicate/reserved invariant ID;
- duplicate canonical requirement ownership **among active invariants** unless the design explicitly permits a single requirement to realize multiple separately justified guarantees (initial policy: reject); 
- absent/ambiguous OpenSpec capability or requirement; broken consumer references;
- missing linked tests for active invariant; duplicate logical test mapping ID; invalid test adapter or malformed case selector;
- stale/unresolved generated index (`report --check` runs separately);
- unknown/unsupported OpenSpec adapter result or CLI failure, without falling back to silent success.

### `verify` hard failures

- no result files, malformed XML, unknown format, zero matched tests, or test identities matching more than one case;
- any required linked test missing, skipped, inconclusive, failed, or not executed;
- any conflicting records for the same exact test identity (do not choose a convenient passing result);
- a test suite/test runner failure in the supplied results;
- results missing for a required adapter (e.g., TRX coverage when only JUnit report supplied).

**Test pass ≠ formal proof:** Verified means the registered checks executed and passed. It does not prove that assertions are adequate; initial audits and code review must assess assertion quality.

**Report provenance:** Verification is meaningful only when CI supplies reports generated by tests for the **same checkout**. Document CI job ordering and ensure test generation and `verify` run in the same trusted workflow/job or with an explicit trusted artifact association. Advanced provenance signing is out of scope for v0.1. Avoid stale checked-in reports.

### Human-readable index example

```markdown
# Active invariants

| ID | Guarantee | Canonical spec | Consumers | Test status |
|----|-----------|----------------|-----------|-------------|
| EXE-001 | Single active execution | execution-identity / Single active execution | manual, scheduled | 2 linked |
```

This is a **registry index**, not an enduring live-status dashboard. The committed file should avoid claiming "PASS" unless a linked, dated CI result can be identified; for MVP label the static column `Linked tests` and let CI/PR reports provide actual pass/fail status. Link invariant IDs to anchored detail sections with spec and test pointers.

## 9. OpenSpec workflow integration

Use native `openspec/config.yaml` `context`, artifact `rules`, and `operations` where available. The initial extension is **additive**; it must not require a custom workflow schema. OpenSpec configuration instructions influence agent behavior, but cannot mechanically enforce contract consistency: CI does that.

Proposed *short* additions (merge into existing keys rather than overwriting):

```yaml
context: |
  Before introducing behavior, inspect openspec/INVARIANTS.md
  and its canonical OpenSpec requirement and tests.
  Shared behavior has one canonical owner. Reuse before reimplementing.
rules:
  proposal:
    - Include affected invariant IDs, overlapping capabilities, and new candidates.
  specs:
    - Reference shared canonical requirements; do not redefine them independently.
  design:
    - Identify reusable existing implementations and justify parallel ones.
  tasks:
    - Include regression coverage for every affected invariant.
operations:
  apply:
    guidance:
      - Preserve impacted invariants and keep registered tests passing.
  archive:
    guidance:
      - Reconcile approved registry changes and regenerate the invariant index.
```

At the **proposal/design** stage an agent must output a **Contract Impact** section:

```markdown
## Contract impact
- Reused: EXE-001 (unchanged)
- Extended: none
- Proposed new: none
- Overlapping specs examined: task-execution, scheduled-execution
- Canonical implementation examined: src/execution/identity.ts
- Conflicts / unresolved questions: none identified
```

At **apply/verify**, update any affected tests, run the usual project test commands, then `check`, `verify`, and `report --check`. At **archive**, preserve stable IDs and do not silently merge competing specs.

Distribute an optional **model-agnostic skill** under `.agents/skills/openspec-invariant-audit/SKILL.md`, respecting existing agent configuration; do not rewrite OpenSpec's generated skills. Provide an agent-neutral standalone audit prompt as fallback.

## 10. Initial repository audit

The first audit must be **read-only and reproducible as an inventory**. `audit export` collects current capabilities/requirements/scenarios from OpenSpec JSON into a versioned JSON bundle with source file/heading references; optionally include a limited file tree and test names without transmitting repository secrets. The CLI **does not call an LLM**.

AI audit skill uses that inventory plus inspected code/tests (when authorized) to propose:

| Finding | Meaning |
| --- | --- |
| Duplicate contract | Same normative guarantee defined more than once |
| Conflict | Two requirements cannot both hold in some concrete scenario |
| Parallel implementation | Multiple mechanisms provide effectively the same behavior |
| Owner ambiguity | Shared guarantee lacks a clear canonical requirement |
| Coverage gap | Candidate guarantee or requirement lacks evidence |
| Opportunity | Existing requirement could be elevated to durable invariant |

Each finding must carry **exact spec paths and requirement names, conflicting passages/scenarios, impact, confidence, proposed canonical owner, recommended resolution, and test evidence**. No auto-edits and no auto-promotions. New invariants join `invariants.yaml` only after human approval and satisfying linked-test requirements.

During brownfield adoption, do not force all existing requirements to be in the registry. Start with the most consequential shared guarantees. Existing audit findings become backlog, not automatic CI failures. New active invariants are strict from day one.

## 11. Similar repositories and reuse investigation

Research references verified October 19, 2026 (not drop-in dependencies):

| Project | URL | Useful ideas | Gaps / adoption guidance |
| --- | --- | --- | --- |
| Saldo OpenSpec coverage script | https://github.com/oskkos/saldo/blob/develop/scripts/spec-coverage.mjs | Parses requirements/scenarios, test annotations, strict coverage gating and Markdown report | In-app script, scenario-focused; study structure and tests, do not depend on app |
| Anvil OpenSpec schema | https://github.com/jikkujoyce/openspec-schemas | Workflow with test-plan, named scenario tests and agent review gates | Instructions are advisory; no standalone deterministic invariant registry |
| SpecSeal | https://github.com/xantus-ai/spec-seal | Standalone Node CLI, stable requirement IDs, spec-to-code annotations, drift checks | Different spec format; code annotation freshness != passing tests |
| spec-kit-trace | https://github.com/Quratulain-bilal/spec-kit-trace | Requirement↔test traceability, orphan/gap reporting, read-only commands | Spec Kit not OpenSpec; scanning literal tokens doesn't prove execution |
| dspec | https://github.com/mizchi/dspec | Typed invariant model, cross-reference validation, evidence-oriented verification | Formal-first Pkl model is out of scope for a thin OpenSpec layer |
| Doorstop | https://github.com/doorstop-dev/doorstop | Git-native YAML requirement records and integrity checks | A second requirement repository/model if adopted directly |
| StrictDoc | https://github.com/strictdoc-project/strictdoc | Navigable requirements/traceability UI | Larger requirements-management platform than this MVP needs |

**Reuse policy:** study publicly documented approaches first; check each candidate's license before copying source, and preserve required attribution. Do not bind MVP to low-maintenance third-party code when a small internal adapter suffices.

**Upstream references:**
- OpenSpec CLI: https://github.com/Fission-AI/OpenSpec/blob/main/docs-lab/reference/cli.md
- OpenSpec config: https://github.com/Fission-AI/OpenSpec/blob/main/docs-lab/customize/project-config.md
- Anvil note on mechanical enforcement: https://github.com/jikkujoyce/openspec-schemas/blob/main/schemas/anvil/README.md

## 12. Tool repository structure

```text
openspec-invariants/
├── .github/
│   ├── workflows/ci.yml
│   └── ISSUE_TEMPLATE/                  # optional, after backlog setup
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   ├── init.ts
│   │   ├── doctor.ts
│   │   ├── audit-export.ts
│   │   ├── check.ts
│   │   ├── verify.ts
│   │   └── report.ts
│   ├── core/
│   │   ├── registry.ts
│   │   ├── diagnostics.ts
│   │   ├── graph.ts
│   │   └── integrity.ts
│   ├── adapters/
│   │   ├── openspec.ts
│   │   ├── junit.ts
│   │   └── trx.ts
│   ├── integration/
│   │   ├── init-project.ts
│   │   └── config-patch.ts
│   └── render/
│       └── markdown.ts
├── schemas/
│   └── invariants.schema.json
├── skills/
│   └── openspec-invariant-audit/SKILL.md
├── examples/
│   ├── consumer-ts/
│   └── consumer-dotnet/
├── tests/
│   ├── fixtures/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── architecture.md
│   ├── registry-schema.md
│   ├── cli.md
│   ├── migration.md
│   └── security.md
├── README.md
├── LICENSE
├── package.json
├── tsconfig.json
└── package-lock.json
```

### Engineering choices

- Strict TypeScript, minimal dependencies, portable Node.js CLI; verify compatibility on supported Node LTS versions (target Node 22/24 initially).
- `npm` package with a proper `bin` entry and lockfile; no global install requirement.
- Existing OpenSpec CLI is an **external prerequisite** (documented compatible range), not a reimplementation.
- Test command and XML parsing must avoid shell injection, external entity expansion, path traversal, wildcard/substring false-positive matching, and network calls.
- `--json` diagnostics with stable machine-readable codes; human-readable output on default; consistent nonzero exit on failures.
- Unit tests for core; fixture-driven adapter tests; integration tests on actual small OpenSpec fixture projects; self-dogfood an invariant in the extension repository.
- MIT (or another license chosen explicitly by maintainer) and third-party attribution review prior to release.
- No secrets in audit exports; redact/omit environment variables, tokens, `.env`, and unrelated contents. Audit must not exfiltrate private repo material.

## 13. CI integration example

Run the consumer's normal tests first, produce *fresh* reports in a known temporary location, then run the checker. Example shell flow; adapt concrete test-runner invocation to the consumer project:

```bash
openspec validate --all --strict    # OpenSpec CLI installed according to official docs
npx openspec-invariants check
# Run existing tests here, exporting JUnit XML / TRX to test-results/
npx openspec-invariants verify --results 'test-results/**/*.xml' --results 'test-results/**/*.trx'
npx openspec-invariants report --check
```

The executable name and report glob handling are part of the proposed API; implement and test them. Do not hard-code test suite command(s) into the library. A project with no TRX may omit that flag; the verifier still must require all formats that its registry references.

### Minimum test fixtures for the tool itself

- Valid one-owner/two-consumer registry with a JUnit passing test.
- Missing, renamed and ambiguous owner requirements.
- Duplicate ID and reserved/retired ID reuse.
- JUnit pass/fail/skip/zero-tests/duplicate-identity/malformed report.
- TRX pass/fail/skip/ambiguous identity/malformed report.
- Valid and stale generated index.
- Repeated `init` with a nontrivial existing `config.yaml` and custom schema.
- Unsupported OpenSpec version/JSON schema changes; clear failure.
- Cross-platform fixture test on Windows and Linux (macOS optional).

## 14. Issue roadmap for a lower-cost implementation agent

Create these issues in the **new** repository. Prefix title with its ID until GitHub issue numbers exist. Use labels `priority:P0/P1`, `area:core/cli/integration/tests/docs`, `type:feature/chore`, `milestone:v0.1`. Respect dependencies. Do not implement the full roadmap during bootstrap.

### I-01 — Bootstrap package, TypeScript CLI and quality gates
**Priority:** P0 · **Depends:** none · **Labels:** `area:core`, `type:chore`

**Scope:** Initialize standalone npm package, TypeScript strict mode, CLI binary with `--help` and `--version`, error/exit code conventions, test runner, formatting/linting, CI for Linux and Windows, README, license choice placeholder, basic security/dependency checks.

**Acceptance:** `npm ci`, build, lint, typecheck, test all pass; packed local tarball executable works; CI passes on clean clone; no application-specific logic.

### I-02 — Define invariant data model, schema and fixtures
**Priority:** P0 · **Depends:** I-01 · **Labels:** `area:core`, `type:feature`

**Scope:** Author JSON Schema/Zod (decide one), active/retired records, immutable IDs, canonical spec locator, consumers, optional implementation hints, reporter-specific test identities, schema-version validation, positive/negative fixtures and user docs.

**Acceptance:** All fields documented; active-without-tests rejected; retired ID reuse rejected; duplicate IDs rejected; unknown fields handled consistently; fixtures and unit tests shipped.

### I-03 — OpenSpec adapter and current-spec inventory
**Priority:** P0 · **Depends:** I-01 · **Labels:** `area:integration`, `type:feature`

**Scope:** Invoke the supported OpenSpec CLI as a subprocess; use documented JSON outputs to load current capabilities, requirement headings and source locators; validate version; handle malformed/changed output; no archived change parsing for canonical ownership.

**Acceptance:** Small consumer fixture resolves owner and consumers; missing/ambiguous spec/requirement fails with actionable location; no OpenSpec internals dependency; version/CLI failure fixtures pass.

### I-04 — Deterministic `check` (static integrity)
**Priority:** P0 · **Depends:** I-02, I-03 · **Labels:** `area:core`, `type:feature`

**Scope:** Implement registry-to-OpenSpec cross-reference validation, ID uniqueness, stable diagnostics, optional implementation path sanity checks, `--json`, zero/nonzero exit semantics.

**Acceptance:** Negative fixtures for every failure mode; cannot succeed on unresolved OpenSpec references or testless active invariant; commands are read-only.

### I-05 — JUnit XML test-result verification
**Priority:** P0 · **Depends:** I-02, I-04 · **Labels:** `area:tests`, `type:feature`

**Scope:** Implement exact JUnit test-case normalization and `verify --results`, fail-closed statuses and duplicate/missing identities; reject unsafe XML. Supply Vitest/Jest fixture documentation.

**Acceptance:** Exact mapped passing tests verify; missing/skip/fail/ambiguous/zero test cases fail; malformed XML produces diagnostic not success; tests do not need to execute twice.

### I-06 — Deterministic Markdown index generator
**Priority:** P0 · **Depends:** I-02, I-03, I-04 · **Labels:** `area:cli`, `type:feature`

**Scope:** `report --write` and `report --check`; active index grouped by owner, anchored invariant details, links to canonical spec/requirement, consumers, test IDs; no unverifiable "passed" status in committed index.

**Acceptance:** Byte-for-byte deterministic sorted output; stale file fails `--check`; idempotent generation; all links resolve within consumer project where representable.

### I-07 — Safe `init`, OpenSpec guidance and optional skill installer
**Priority:** P0 · **Depends:** I-01, I-02 · **Labels:** `area:integration`, `type:feature`

**Scope:** `init --dry-run`, `init --skill`, safe config guidance insertion (or patch preview if comments cannot be preserved), registry scaffold, optional skill to `.agents/skills`, no OpenSpec workflow fork, preserve user config and generated OpenSpec files.

**Acceptance:** init twice produces zero further diff; unrelated `config.yaml` fields/comments and custom schemas survive; unsupported OpenSpec project fails safely; optional skill install/version docs clear; dry-run never writes.

### I-08 — .NET TRX verification adapter
**Priority:** P1 · **Depends:** I-05 · **Labels:** `area:tests`, `type:feature`

**Scope:** Normalize TRX test identity, associate execution outcomes, fail closed on skipped/duplicate/missing, mixed JUnit+TRX inputs, real xUnit+dotnet test fixtures. Confirm exactly what test metadata TRX actually exports.

**Acceptance:** Real xUnit TRX fixture verifies; skip/fail/notrun/ambiguous identity fail; mixed JS+.NET test reports correctly validate their own declared invariants.

### I-09 — Deterministic `audit export` and read-only AI audit skill
**Priority:** P1 · **Depends:** I-03, I-07 · **Labels:** `area:integration`, `type:feature`

**Scope:** Export inventory with source locators; ship skill/prompt for semantic duplicate/conflict, canonical ownership, parallel implementation, and missing guarantee proposals. Avoid LLM API inside CLI; no repo modifications from audit.

**Acceptance:** Repeatable input bundle; findings template includes evidence/impact/confidence/owner suggestion; candidate additions are never silently promoted; no unrelated sensitive file contents exported.

### I-10 — CI examples and end-to-end consumer repos
**Priority:** P0 · **Depends:** I-04, I-05, I-06, I-07 · **Labels:** `area:integration`, `type:chore`

**Scope:** Minimal TypeScript OpenSpec consumer, reusable GitHub Actions snippet, full check/test/report flow and regression scenarios, cross-platform validation. Add .NET example once I-08 lands.

**Acceptance:** Green sample succeeds from clean checkout; removing an invariant test or breaking spec owner fails CI; no stale local artifacts needed; test reports generated in workflow.

### I-11 — Documentation, security audit and pre-release packaging
**Priority:** P1 · **Depends:** I-05, I-06, I-07, I-09, I-10 · **Labels:** `area:docs`, `type:chore`

**Scope:** README quickstart, architecture/CLI/schema/migration guides, release/version compatibility policy, dependency/license audit, package contents audit, security assessment (subprocess/XML/path/config input). Keep release private/unpublished until maintainer approval.

**Acceptance:** A second repo can follow docs and install from packed package; no accidental secret/network access; tests/lint/typecheck pass; changelog/release checklist exists; maintainers explicitly approve publication.

### I-12 — Brownfield adoption playbook and hard-gate demonstration
**Priority:** P1 · **Depends:** I-08, I-09, I-10 · **Labels:** `area:docs`, `type:feature`

**Scope:** Document and exercise real migration: scan existing specs, classify candidate invariants, approve owners, create tests, activate registry, CI hard gate, archive conflicting duplicates through normal OpenSpec change process.

**Acceptance:** Walkthrough starts from nontrivial sample repo; audit report is read-only; an untested candidate cannot become active; tests break on deliberately introduced duplicate ID, dead reference, missing test, and failed test.

### Deferred (not v0.1 gate)

- Semantic audit comparison against only *changed* specs (incremental AI audit).
- Requirement-content hash drift detection / richer implementation-to-contract references inspired by SpecSeal.
- Additional test report adapters (pytest, Playwright, Go test, etc.).
- Per-consumer required test coverage, not just aggregate invariant coverage.
- CODEOWNERS policy automation and a web UI/search index.
- CLI plugin contracts for third-party framework adapters.

## 15. Milestones and dependency strategy

| Milestone | Required issues | Outcome |
| --- | --- | --- |
| M0 — Skeleton | I-01, I-02, I-03 | Installable package and stable conceptual contract |
| M1 — Enforced JS slice | I-04, I-05, I-06, I-07, I-10 | Existing OpenSpec + JUnit + hard CI + generated index |
| M2 — Audit & mixed stack | I-08, I-09 | Agent-assisted read-only audit; .NET TRX verification |
| M3 — Release readiness | I-11, I-12 | Docs, security, brownfield migration demonstration |

Build *deterministic enforcement before AI audit automation*. The first valuable release is the one that fails on missing test evidence, not the one that produces the fanciest semantic report.

## 16. Risks and decisions to keep explicit

| Risk | Mitigation |
| --- | --- |
| Duplicate truth between registry and specs | Registry is ID/locator/short index only; OpenSpec requirement stays authoritative |
| False assurance from linked test | Verify actual test execution; review assertion adequacy; disclose evidence limits |
| Repeated spec descriptions with different wording | AI audit proposes evidence-backed findings; human chooses canonical owner |
| Test renames causing brittle mapping | Stable logical ID + exact adapter identity; detect and repair drift, no substring matching |
| Upgrade modifies consumer OpenSpec configuration | Idempotent additive patch or preview; preserve existing YAML/custom schemas |
| Test report mismatch / stale artifact | Require fresh reports generated in same CI workflow and no checked-in reports |
| Complex CLI surface | Keep six commands; ship `doctor` only if useful; avoid always-on runtime agent |
| Upstream OpenSpec CLI changes | Adapter isolated and version-gated, compatibility fixtures and error diagnostics |
| AI audit leaks private code | Local inventory, explicit user-mediated agent access, no implicit external API |
| Excessive invariants | Admission criteria and human review; no requirement-to-invariant promotion by default |

### Proposed decisions for maintainer confirmation (do not block bootstrap)

- npm organization/scope and published package name.
- Public/private repo status and license.
- Exact Node.js support matrix and package manager for development.
- JUnit identity normalization contract and TRX mapping convention based on real fixtures.
- Whether `.agents/skills` installation is default or `--skill` opt-in (proposal: opt-in).

## 17. Definition of done for v0.1

- Standalone package can be installed into an *existing* OpenSpec repo without forking or overwriting it.
- Every active invariant has exactly one resolvable canonical owner, valid consumers and >=1 resolvable automated test case.
- Real CI results prove linked tests executed and passed; missing/skipped/failing tests fail hard.
- `INVARIANTS.md` is generated, deterministic, human navigable and drift-checked.
- An OpenSpec change can report Contract Impact before implementation; skill is model-agnostic and optional.
- Audit reports candidates with evidence but never modifies specs/registry automatically.
- Initial brownfield example demonstrates detecting duplicate/contradictory specs and migration into a canonical invariant.
- Unit, integration, cross-platform, compatibility and security tests pass; examples/docs are accurate.
- There is no dependency on an external LLM service, server, database, or another spec management framework.

## 18. Delegation contract — instructions for repository bootstrap agent

> You are bootstrapping a new standalone repository according to this project plan. **Do not implement the entire product**. Prepare a maintainable baseline and an actionable GitHub backlog for a subsequent implementation agent.
>
> 1. Read this document completely. Verify tools and the selected GitHub repository identity before writes; do not assume it exists.
> 2. Initialize an npm/TypeScript repository with strict type checking, `bin` CLI placeholder, quality scripts, a minimal test, CI, README, docs copy of this plan, and sensible `.gitignore`. Create a first OpenSpec change describing the project itself only if OpenSpec is available and doing so will not obstruct the scaffold.
> 3. Preserve the plan as `docs/PROJECT_PLAN.md`; derive `docs/ARCHITECTURE.md` / `docs/ROADMAP.md` only where useful, without inventing functionality.
> 4. Prepare GitHub Issues corresponding to I-01 through I-12 above. Use scoped deliverables, measurable acceptance criteria, dependencies, priorities, labels, and milestones. If asked to *create* issues and an authenticated GitHub tool is available, do so; otherwise write import-ready issue bodies in `planning/issues/` and a manifest mapping logical IDs to dependencies. Never fabricate issue URLs or numbers.
> 5. Avoid copy-pasting code from referenced projects until licenses are checked. Links are research references, not requirements to install them.
> 6. Do not publish npm packages, make unrelated changes, add secrets, contact external services without authorization, or claim unimplemented commands work.
> 7. Produce a final handoff stating files created, commands/tests run, which issue tickets were actually created, decisions still open, and the first recommended implementation issue.
>
> **Stop condition:** a buildable skeleton, clear architecture documentation, and fully specified backlog. Leave implementation of adapter/registry/verification to the follow-up issues.
