# OpenSpec CLI adapter

The adapter reads the current OpenSpec specifications through the published OpenSpec CLI.
It does not read specification files directly.

## Supported versions

The adapter supports OpenSpec `>=1.14.0 <2.0.0`.

OpenSpec 1.14.0 adds the requirement `name` field to `show --json` output. The adapter needs
this field to match a requirement by its exact heading. OpenSpec 1.13.x omits the field, so two
requirements can look the same.

A stable version can have build metadata. For example, `1.14.3+build.1` is valid. The adapter
ignores the build metadata for the range check. The inventory reports the full version string.

Prerelease versions are not supported. This rule also applies to a prerelease with build
metadata. For example, `1.15.0-beta.1+b` is not supported.

## Commands

The adapter runs these commands in this order:

1. `openspec --version`
2. `openspec list --specs --json`
3. `openspec show <id> --type spec --json` for each listed capability, one at a time.

The adapter uses only the JSON output from these commands.

Each capability identifier in the `list` output must be unique. A repeated identifier makes the
output malformed. The adapter reports `OPENSPEC_OUTPUT_MALFORMED` and names both positions. The
adapter does not run any `show` command when the list has a repeated identifier.

## How the adapter finds the CLI

The adapter uses the project-local `@fission-ai/openspec` package.
It does not use `require.resolve`, because the package `exports` map can hide `package.json`.

1. It starts at `<projectRoot>`.
2. It checks `<dir>/node_modules/@fission-ai/openspec/package.json`.
3. It goes up one directory and repeats. It stops at the filesystem root. The first package
   `package.json` wins.
4. It reads the `bin.openspec` field. A string `bin` field also works.
5. It resolves the bin path from the package directory.
6. It rejects an absolute bin path or a bin path with `..`.
7. It runs `process.execPath` with that file and the arguments. It does not use a shell, `PATH`,
   or `npx`.

If no package is found, the adapter reports `OPENSPEC_NOT_FOUND`.
The message tells the user to install the package as a devDependency.
A package with no usable bin also reports `OPENSPEC_NOT_FOUND`.
The message names the problem.

Install the package as a devDependency in each consumer project.

## Inventory model

An inventory has the OpenSpec version and a list of capabilities.

Each capability has:

- `id`: the capability identifier.
- `source`: the repository-relative path `openspec/specs/<id>/spec.md`.
- `requirements`: the requirement names in document order.

Each requirement has a `name` and a 1-based `index`. The index agrees with
`openspec show -r <index>`.

The adapter sorts capabilities by `id` in code-unit order.

## Exact-match rule

The adapter matches references exactly and is case-sensitive. It does not use substring, prefix,
or fuzzy matching. It does not trim or change the case of a name.

An owner reference has a capability and a requirement. A consumer reference has only a
capability.

## Diagnostics

| Code | Meaning |
| --- | --- |
| `OPENSPEC_NOT_FOUND` | The package is not found, has no usable bin, or the spawn failed with `ENOENT`. |
| `OPENSPEC_CLI_FAILED` | The command exited with a nonzero status, a signal, or a timeout. |
| `OPENSPEC_VERSION_UNSUPPORTED` | The version is outside `>=1.14.0 <2.0.0`. |
| `OPENSPEC_OUTPUT_MALFORMED` | The output is not JSON, does not have the required shape, or has a repeated capability identifier. |
| `OPENSPEC_CAPABILITY_NOT_FOUND` | No capability has the exact identifier. |
| `OPENSPEC_REQUIREMENT_NOT_FOUND` | No requirement in the capability has the exact name. |
| `OPENSPEC_REQUIREMENT_AMBIGUOUS` | More than one requirement has the exact name. The message lists the indexes. |

Each diagnostic names the command or reference that failed. When the source file is known, the
diagnostic includes it as the location.

## Limits

The adapter does not parse `openspec/changes/**`. Pending and archived changes are not canonical.

The adapter does not read `openspec/specs/**` files. It does not read OpenSpec package internals,
except the `bin` field in `package.json`.

The adapter is read-only. It does not run `openspec validate` and it does not change project
files.
