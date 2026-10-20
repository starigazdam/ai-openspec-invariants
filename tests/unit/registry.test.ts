import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { REGISTRY_SHAPE, validateRegistry } from "../../src/core/registry.ts";
import type { DiagnosticCode } from "../../src/core/registry.ts";

interface ExpectedDiagnostic {
  code: DiagnosticCode;
  path: string;
}

interface Case {
  name: string;
  input: unknown;
  expected: ExpectedDiagnostic[];
}

function readJson(url: URL): unknown {
  const raw: unknown = JSON.parse(readFileSync(url, "utf8"));
  return raw;
}

function fixture(kind: "valid" | "invalid", name: string): unknown {
  return readJson(new URL(`../fixtures/registry/${kind}/${name}.json`, import.meta.url));
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  const result: string[] = [];
  for (const item of value as readonly unknown[]) {
    if (typeof item !== "string") {
      throw new Error(`${label} must contain only strings`);
    }
    result.push(item);
  }
  return result;
}

function testEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "EXE-001-T1", format: "junit", case: "Suite::case", ...overrides };
}

function invariant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "EXE-001",
    title: "Single active execution",
    summary: "A task identity must not have overlapping active executions.",
    owner: { capability: "execution-identity", requirement: "Single active execution" },
    tests: [testEntry()],
    ...overrides,
  };
}

function registry(
  invariants: unknown,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { version: 1, invariants, ...extra };
}

function omit(object: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...object };
  delete copy[key];
  return copy;
}

const invalidPaths = ["../x", "/etc/x", "C:\\x", "a\\b", "a//b", "./a", "a/"];

const cases: readonly Case[] = [
  {
    name: "rejects empty tests",
    input: fixture("invalid", "active-without-tests"),
    expected: [{ code: "REG_ACTIVE_WITHOUT_TESTS", path: "/invariants/0/tests" }],
  },
  {
    name: "rejects missing tests",
    input: registry([omit(invariant(), "tests")]),
    expected: [{ code: "REG_ACTIVE_WITHOUT_TESTS", path: "/invariants/0/tests" }],
  },
  {
    name: "rejects duplicate active ids",
    input: fixture("invalid", "duplicate-id"),
    expected: [{ code: "REG_DUPLICATE_ID", path: "/invariants/1/id" }],
  },
  {
    name: "rejects duplicate retired ids",
    input: registry([], {
      retired: [
        { id: "EXE-000", reason: "First" },
        { id: "EXE-000", reason: "Second" },
      ],
    }),
    expected: [{ code: "REG_DUPLICATE_ID", path: "/retired/1/id" }],
  },
  {
    name: "rejects a retired id reused by an active invariant",
    input: fixture("invalid", "retired-id-reuse"),
    expected: [{ code: "REG_RETIRED_ID_REUSED", path: "/invariants/0/id" }],
  },
  {
    name: "rejects a test id reused across invariants",
    input: registry([
      invariant(),
      invariant({ id: "EXE-002", owner: { capability: "manual-execution", requirement: "Run" } }),
    ]),
    expected: [{ code: "REG_DUPLICATE_TEST_ID", path: "/invariants/1/tests/0/id" }],
  },
  {
    name: "rejects unknown fields at every object level",
    input: fixture("invalid", "unknown-field"),
    expected: [
      { code: "REG_UNKNOWN_FIELD", path: "/foo" },
      { code: "REG_UNKNOWN_FIELD", path: "/invariants/0/foo" },
      { code: "REG_UNKNOWN_FIELD", path: "/invariants/0/owner/foo" },
      { code: "REG_UNKNOWN_FIELD", path: "/invariants/0/tests/0/foo" },
      { code: "REG_UNKNOWN_FIELD", path: "/retired/0/foo" },
    ],
  },
  {
    name: "rejects a numeric version other than 1",
    input: registry([], { version: 2 }),
    expected: [{ code: "REG_SCHEMA_VERSION", path: "/version" }],
  },
  {
    name: "rejects a string version",
    input: registry([], { version: "1" }),
    expected: [{ code: "REG_SCHEMA_VERSION", path: "/version" }],
  },
  {
    name: "rejects a missing version",
    input: { invariants: [] },
    expected: [{ code: "REG_SCHEMA_VERSION", path: "/version" }],
  },
  {
    name: "rejects a null input",
    input: null,
    expected: [{ code: "REG_NOT_OBJECT", path: "" }],
  },
  {
    name: "rejects an array input",
    input: [],
    expected: [{ code: "REG_NOT_OBJECT", path: "" }],
  },
  {
    name: "rejects a string input",
    input: "registry",
    expected: [{ code: "REG_NOT_OBJECT", path: "" }],
  },
  {
    name: "rejects each invalid implementation path",
    input: registry([invariant({ implementation: invalidPaths })]),
    expected: invalidPaths.map((_, index) => ({
      code: "REG_PATH_INVALID" as const,
      path: `/invariants/0/implementation/${String(index)}`,
    })),
  },
  {
    name: "accepts a relative implementation path",
    input: registry([invariant({ implementation: ["src/a.ts"] })]),
    expected: [],
  },
  {
    name: "rejects an unknown test format",
    input: registry([invariant({ tests: [testEntry({ format: "xunit" })] })]),
    expected: [{ code: "REG_TEST_FORMAT", path: "/invariants/0/tests/0/format" }],
  },
  {
    name: "rejects an empty test case",
    input: registry([invariant({ tests: [testEntry({ case: "  " })] })]),
    expected: [{ code: "REG_EMPTY_STRING", path: "/invariants/0/tests/0/case" }],
  },
  {
    name: "rejects a malformed test id",
    input: registry([invariant({ tests: [testEntry({ id: "exe-1" })] })]),
    expected: [{ code: "REG_ID_FORMAT", path: "/invariants/0/tests/0/id" }],
  },
  {
    name: "rejects the owner capability as a consumer",
    input: registry([invariant({ consumers: ["execution-identity"] })]),
    expected: [{ code: "REG_OWNER_AS_CONSUMER", path: "/invariants/0/consumers/0" }],
  },
  {
    name: "rejects a duplicate consumer",
    input: registry([invariant({ consumers: ["manual-execution", "manual-execution"] })]),
    expected: [{ code: "REG_DUPLICATE_ENTRY", path: "/invariants/0/consumers/1" }],
  },
  {
    name: "rejects an unknown supersededBy id",
    input: registry([], {
      retired: [{ id: "EXE-000", reason: "Old", supersededBy: "NOPE-001" }],
    }),
    expected: [{ code: "REG_SUPERSEDED_BY_UNKNOWN", path: "/retired/0/supersededBy" }],
  },
  {
    name: "rejects a self supersededBy id",
    input: registry([], {
      retired: [{ id: "EXE-000", reason: "Old", supersededBy: "EXE-000" }],
    }),
    expected: [{ code: "REG_SUPERSEDED_BY_UNKNOWN", path: "/retired/0/supersededBy" }],
  },
  {
    name: "returns all diagnostics in a stable order",
    input: registry([invariant({ foo: true }), invariant({ id: "EXE-001", tests: [] })], {
      version: 2,
      foo: "bar",
    }),
    expected: [
      { code: "REG_UNKNOWN_FIELD", path: "/foo" },
      { code: "REG_UNKNOWN_FIELD", path: "/invariants/0/foo" },
      { code: "REG_DUPLICATE_ID", path: "/invariants/1/id" },
      { code: "REG_ACTIVE_WITHOUT_TESTS", path: "/invariants/1/tests" },
      { code: "REG_SCHEMA_VERSION", path: "/version" },
    ],
  },
];

void describe("registry validation", () => {
  for (const testCase of cases) {
    void it(testCase.name, () => {
      const first = validateRegistry(testCase.input);
      const second = validateRegistry(testCase.input);
      deepStrictEqual(second, first);

      if (testCase.expected.length === 0) {
        strictEqual(first.ok, true);
        return;
      }

      strictEqual(first.ok, false);
      if (!first.ok) {
        deepStrictEqual(
          first.diagnostics.map(({ code, path }) => ({ code, path })),
          testCase.expected,
        );
      }
    });
  }

  void it("accepts the plan example and returns the same data", () => {
    const input = fixture("valid", "plan-example");
    const result = validateRegistry(input);

    if (!result.ok) {
      throw new Error("expected the plan example to be valid");
    }
    deepStrictEqual(result.registry, input);
  });

  void it("defaults retired to an empty array", () => {
    const result = validateRegistry(fixture("valid", "minimal"));

    if (!result.ok) {
      throw new Error("expected the minimal registry to be valid");
    }
    deepStrictEqual(result.registry.retired, []);
  });
});

void describe("registry schema", () => {
  void it("matches the validator field lists", () => {
    const schema = asRecord(
      readJson(new URL("../../schemas/invariants.schema.json", import.meta.url)),
      "schema",
    );
    strictEqual(schema.$schema, "https://json-schema.org/draft/2020-12/schema");

    const defs = asRecord(schema.$defs, "$defs");
    const levels = {
      registry: schema,
      invariant: asRecord(defs.invariant, "invariant"),
      owner: asRecord(defs.owner, "owner"),
      test: asRecord(defs.test, "test"),
      retired: asRecord(defs.retired, "retired"),
    };

    for (const name of Object.keys(REGISTRY_SHAPE) as (keyof typeof REGISTRY_SHAPE)[]) {
      const node = levels[name];
      const expected = REGISTRY_SHAPE[name];
      strictEqual(node.additionalProperties, false);
      deepStrictEqual(
        Object.keys(asRecord(node.properties, `${name}.properties`)).sort(),
        [...expected.properties].sort(),
      );

      deepStrictEqual(
        stringArray(node.required, `${name}.required`).sort(),
        [...expected.required].sort(),
      );
    }
  });
});
