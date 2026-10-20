# Invariant registry schema (version 1)

This document defines the version 1 invariant registry. The registry file is
`openspec/invariants.yaml` in a consumer repository. Read
[PROJECT_PLAN.md §3 and §6](PROJECT_PLAN.md#3-terminology-and-governance-rules)
for the governing rules.

## Validation decision

Use JSON Schema draft 2020-12 for editors and `yaml-language-server`. The file
`schemas/invariants.schema.json` holds the schema.

Use a hand-written, zero-dependency validator at runtime. The function
`validateRegistry(input: unknown)` in `src/core/registry.ts` is authoritative.
Do not use Zod. Zod is a runtime dependency. The core module is pure. It does
no I/O. Its input is already-parsed data.

The validator collects all diagnostics. It does not stop at the first
diagnostic. It sorts diagnostics by `path`, then `code`, then `message`. Two
runs on the same input give equal output.

A call returns one of these results:

- `{ ok: true, registry }`: the registry is valid. The model is readonly.
- `{ ok: false, diagnostics }`: the registry is invalid.

A diagnostic has three fields:

- `code`: a stable token from the table below.
- `path`: an RFC 6901 JSON Pointer. The top level is `""`.
- `message`: a short human-readable text.

## Unknown fields

Reject unknown fields at every object level: top level, invariant, owner, test
entry, and retired entry. The schema sets `additionalProperties: false` at each
object level. The validator reports `REG_UNKNOWN_FIELD` for each unknown field.

## Top level

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `version` | number | yes | Must be the number `1`. A missing or different value reports `REG_SCHEMA_VERSION` at `/version`. The validator still checks the rest. |
| `invariants` | array | yes | Holds active invariants. May be empty. |
| `retired` | array | no | Holds retired entries. The default is `[]`. |

## Active invariant

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `id` | string | yes | Pattern `^[A-Z][A-Z0-9]*-[0-9]{3,}$`. Example: `EXE-001`. |
| `title` | string | yes | Must not be empty after trim. |
| `summary` | string | yes | Must not be empty after trim. It is index text, not normative text. |
| `owner` | object | yes | Has `capability` and `requirement`. See below. |
| `consumers` | array of strings | no | Each item is a capability name. Items are unique. Do not include the owner capability. |
| `implementation` | array of strings | no | Each item is a unique repository-relative path. See the path rules. |
| `tests` | array | yes | Must have at least one test entry. A missing or empty array reports `REG_ACTIVE_WITHOUT_TESTS` at `/invariants/<n>/tests`. |

### Owner

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `capability` | string | yes | Kebab-case. Pattern `^[a-z0-9]+(-[a-z0-9]+)*$`. |
| `requirement` | string | yes | Must not be empty after trim. It is the exact OpenSpec requirement name. Issue #4 resolves it. |

### Implementation path rules

A valid path is repository-relative and normalized. Reject a path with any of
these properties:

- empty string;
- absolute POSIX path, such as `/x`;
- Windows drive prefix, such as `C:\x` or `C:/x`;
- UNC prefix, such as `\\x`;
- any backslash;
- a `..` segment;
- a `.` segment;
- an empty segment, such as `a//b`;
- a trailing `/`.

Example: `src/a.ts` is valid.

### Test entry

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `id` | string | yes | Pattern `^[A-Z][A-Z0-9]*-[0-9]{3,}-T[0-9]+$`. Example: `EXE-001-T1`. |
| `format` | string | yes | One of `junit` or `trx`. |
| `case` | string | yes | Must not be empty after trim. It is the exact test case name. |

Test IDs are unique across the whole registry. Report a duplicate at the second
occurrence.

## Retired entry

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `id` | string | yes | Same pattern as an active invariant ID. |
| `reason` | string | yes | Must not be empty after trim. |
| `supersededBy` | string | no | Must equal the ID of an active invariant or another retired entry. It must not equal its own ID. |

## ID rules

Registry IDs are permanent. Do not change an ID. Do not reuse a retired ID.

- Report `REG_DUPLICATE_ID` at the second or later occurrence of a duplicate active ID.
- Report `REG_DUPLICATE_ID` at the second or later occurrence of a duplicate retired ID.
- Report `REG_RETIRED_ID_REUSED` at the active invariant `id` path when an active ID equals a retired ID.
- Report `REG_SUPERSEDED_BY_UNKNOWN` when `supersededBy` does not resolve or points to its own entry.

## Diagnostic codes

| Code | Meaning |
| --- | --- |
| `REG_NOT_OBJECT` | The input or a list entry is not an object. |
| `REG_SCHEMA_VERSION` | `version` is missing or is not the number `1`. |
| `REG_MISSING_FIELD` | A required field is absent. |
| `REG_WRONG_TYPE` | A field has the wrong JSON type. |
| `REG_UNKNOWN_FIELD` | An object has a field that the schema does not allow. |
| `REG_EMPTY_STRING` | A string is empty after trim. |
| `REG_ID_FORMAT` | An invariant ID or test ID has the wrong pattern. |
| `REG_CAPABILITY_FORMAT` | A capability name is not kebab-case. |
| `REG_TEST_FORMAT` | A test `format` is not `junit` or `trx`. |
| `REG_PATH_INVALID` | An implementation path is not repository-relative and normalized. |
| `REG_DUPLICATE_ID` | An active or retired ID repeats. |
| `REG_DUPLICATE_TEST_ID` | A test ID repeats across the registry. |
| `REG_DUPLICATE_ENTRY` | A consumer or implementation path repeats in one array. |
| `REG_RETIRED_ID_REUSED` | An active invariant uses a retired ID. |
| `REG_ACTIVE_WITHOUT_TESTS` | An active invariant has no test entries. |
| `REG_OWNER_AS_CONSUMER` | A consumer equals the owner capability. |
| `REG_SUPERSEDED_BY_UNKNOWN` | `supersededBy` is unknown or points to its own entry. |

## YAML loading

This issue does not load YAML files. The validator takes parsed data. The
`check` command in issue #4 loads `openspec/invariants.yaml` and then calls the
validator. JSON fixtures are valid YAML 1.2 data.
