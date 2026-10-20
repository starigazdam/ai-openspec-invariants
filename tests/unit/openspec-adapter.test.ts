import { deepEqual, match, ok, strictEqual } from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type {
  AdapterDiagnostic,
  OpenSpecInventory,
  OpenSpecRunResult,
  OpenSpecRunner,
} from "../../src/adapters/openspec.js";

const adapter = (await import(
  new URL("../../src/adapters/openspec.ts", import.meta.url).href
)) as typeof import("../../src/adapters/openspec.js");
const { createDefaultRunner, loadInventory, resolveReference } = adapter;

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "openspec",
  "1.14.3",
);

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf8");
}

const VERSION = "--version";
const LIST = "list --specs --json";
const show = (id: string): string => `show ${id} --type spec --json`;
const response = (stdout: string): OpenSpecRunResult => ({ status: 0, stdout, stderr: "" });

function createRunner(overrides: Record<string, OpenSpecRunResult> = {}): OpenSpecRunner {
  const routes: Record<string, OpenSpecRunResult> = {
    [VERSION]: response(fixture("version.txt")),
    [LIST]: response(fixture("list.json")),
    [show("execution-identity")]: response(fixture("show-execution-identity.json")),
    [show("manual-execution")]: response(fixture("show-manual-execution.json")),
    ...overrides,
  };

  return (args) => {
    const key = args.join(" ");
    return routes[key] ?? { status: 1, stdout: "", stderr: `unexpected command: ${key}` };
  };
}

function loadOk(runner: OpenSpecRunner): OpenSpecInventory {
  const result = loadInventory(runner);
  if (!result.ok) {
    throw new Error(`inventory failed: ${result.diagnostics.map((item) => item.code).join(", ")}`);
  }
  return result.inventory;
}

function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) {
    throw new Error("expected at least one item");
  }
  return item;
}

function diagnosticOf(result: { diagnostics: readonly AdapterDiagnostic[] }): AdapterDiagnostic {
  return first(result.diagnostics);
}

const missExecution = JSON.stringify({
  id: "other",
  title: "x",
  overview: "x",
  requirementCount: 1,
  requirements: [{ name: "A", text: "x", scenarios: [] }],
  metadata: {},
  root: {},
});

const countMismatch = JSON.stringify({
  id: "execution-identity",
  title: "x",
  overview: "x",
  requirementCount: 3,
  requirements: [{ name: "A", text: "x", scenarios: [] }],
  metadata: {},
  root: {},
});

const unnamedRequirement = JSON.stringify({
  id: "execution-identity",
  title: "x",
  overview: "x",
  requirementCount: 1,
  requirements: [{ text: "x", scenarios: [] }],
  metadata: {},
  root: {},
});

void describe("OpenSpec adapter", () => {
  void it("loads and sorts capabilities with 1-based requirement indexes", () => {
    const reversedList = JSON.stringify({
      specs: [
        { id: "manual-execution", requirementCount: 1 },
        { id: "execution-identity", requirementCount: 2 },
      ],
      root: {},
    });
    const inventory = loadOk(createRunner({ [LIST]: response(reversedList) }));

    strictEqual(inventory.openspecVersion, "1.14.3");
    deepEqual(inventory.capabilities, [
      {
        id: "execution-identity",
        source: "openspec/specs/execution-identity/spec.md",
        requirements: [
          { name: "Single active execution", index: 1 },
          { name: "Restart keeps lock", index: 2 },
        ],
      },
      {
        id: "manual-execution",
        source: "openspec/specs/manual-execution/spec.md",
        requirements: [{ name: "Manual start", index: 1 }],
      },
    ]);
  });

  void it("resolves an exact owner and a consumer", () => {
    const inventory = loadOk(createRunner());
    const owner = resolveReference(inventory, {
      capability: "execution-identity",
      requirement: "Single active execution",
    });

    ok(owner.ok);
    strictEqual(owner.capability, "execution-identity");
    strictEqual(owner.source, "openspec/specs/execution-identity/spec.md");
    deepEqual(owner.requirement, { name: "Single active execution", index: 1 });

    const consumer = resolveReference(inventory, { capability: "manual-execution" });

    ok(consumer.ok);
    strictEqual(consumer.capability, "manual-execution");
    strictEqual(consumer.requirement, undefined);
  });

  const lookupCases: readonly {
    title: string;
    reference: { capability: string; requirement?: string };
    code: string;
    message: RegExp;
    location?: string;
  }[] = [
    {
      title: "rejects an unknown capability",
      reference: { capability: "nope" },
      code: "OPENSPEC_CAPABILITY_NOT_FOUND",
      message: /nope/,
    },
    {
      title: "rejects a requirement with different case",
      reference: { capability: "execution-identity", requirement: "Single Active Execution" },
      code: "OPENSPEC_REQUIREMENT_NOT_FOUND",
      message: /Single Active Execution.*execution-identity.*openspec\/specs\/execution-identity/,
      location: "openspec/specs/execution-identity/spec.md",
    },
    {
      title: "rejects a requirement prefix",
      reference: { capability: "execution-identity", requirement: "Single active" },
      code: "OPENSPEC_REQUIREMENT_NOT_FOUND",
      message: /Single active.*execution-identity.*openspec\/specs\/execution-identity/,
      location: "openspec/specs/execution-identity/spec.md",
    },
  ];

  for (const testCase of lookupCases) {
    void it(testCase.title, () => {
      const result = resolveReference(loadOk(createRunner()), testCase.reference);

      ok(!result.ok);
      strictEqual(result.diagnostic.code, testCase.code);
      match(result.diagnostic.message, testCase.message);
      strictEqual(result.diagnostic.location, testCase.location);
    });
  }

  void it("rejects an ambiguous requirement and lists the indexes", () => {
    const dupList = JSON.stringify({ specs: [{ id: "dup", requirementCount: 2 }], root: {} });
    const inventory = loadOk(
      createRunner({
        [LIST]: response(dupList),
        [show("dup")]: response(fixture("show-dup.json")),
      }),
    );
    const result = resolveReference(inventory, { capability: "dup", requirement: "Same" });

    ok(!result.ok);
    strictEqual(result.diagnostic.code, "OPENSPEC_REQUIREMENT_AMBIGUOUS");
    match(result.diagnostic.message, /1 and 2/);
    strictEqual(result.diagnostic.location, "openspec/specs/dup/spec.md");
  });

  const versionCases: readonly { version: string; code?: string }[] = [
    { version: "1.13.2", code: "OPENSPEC_VERSION_UNSUPPORTED" },
    { version: "2.0.0", code: "OPENSPEC_VERSION_UNSUPPORTED" },
    { version: "1.14.0" },
    { version: "1.15.0-beta.1", code: "OPENSPEC_VERSION_UNSUPPORTED" },
    { version: "garbage", code: "OPENSPEC_OUTPUT_MALFORMED" },
  ];

  for (const testCase of versionCases) {
    void it(`handles version ${testCase.version}`, () => {
      const result = loadInventory(createRunner({ [VERSION]: response(`${testCase.version}\n`) }));

      if (testCase.code === undefined) {
        ok(result.ok);
        strictEqual(result.inventory.openspecVersion, testCase.version);
        return;
      }

      ok(!result.ok);
      strictEqual(diagnosticOf(result).code, testCase.code);
    });
  }

  const failureCases: readonly {
    title: string;
    route: string;
    reply: OpenSpecRunResult;
    code: string;
    message: RegExp;
  }[] = [
    {
      title: "reports a list command failure",
      route: LIST,
      reply: { status: 1, stdout: fixture("list-no-root.json"), stderr: "" },
      code: "OPENSPEC_CLI_FAILED",
      message: /no_openspec_root/,
    },
    {
      title: "reports a show command failure",
      route: show("execution-identity"),
      reply: { status: 1, stdout: fixture("show-missing.json"), stderr: "" },
      code: "OPENSPEC_CLI_FAILED",
      message: /show_error/,
    },
    {
      title: "reports a spawn ENOENT as not found",
      route: VERSION,
      reply: {
        status: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
      },
      code: "OPENSPEC_NOT_FOUND",
      message: /@fission-ai\/openspec/,
    },
    {
      title: "reports a null status as a CLI failure",
      route: VERSION,
      reply: { status: null, stdout: "", stderr: "" },
      code: "OPENSPEC_CLI_FAILED",
      message: /terminated|timed out|no exit status/,
    },
  ];

  for (const testCase of failureCases) {
    void it(testCase.title, () => {
      const result = loadInventory(createRunner({ [testCase.route]: testCase.reply }));

      ok(!result.ok);
      strictEqual(diagnosticOf(result).code, testCase.code);
      match(diagnosticOf(result).message, testCase.message);
    });
  }

  const malformedCases: readonly {
    title: string;
    overrides: Record<string, OpenSpecRunResult>;
    message: RegExp;
  }[] = [
    {
      title: "rejects a non-JSON list",
      overrides: { [LIST]: response("not json") },
      message: /list --specs --json.*specs/,
    },
    {
      title: "rejects a list without specs",
      overrides: { [LIST]: response('{"root":{}}') },
      message: /list --specs --json.*specs/,
    },
    {
      title: "rejects a show id that differs from the request",
      overrides: { [show("execution-identity")]: response(missExecution) },
      message: /show execution-identity --type spec --json.*id/,
    },
    {
      title: "rejects a show requirementCount that differs from the requirements",
      overrides: { [show("execution-identity")]: response(countMismatch) },
      message: /show execution-identity --type spec --json.*requirementCount/,
    },
    {
      title: "rejects a requirement without a name",
      overrides: { [show("execution-identity")]: response(unnamedRequirement) },
      message: /show execution-identity --type spec --json.*requirements\[0\]\.name/,
    },
  ];

  for (const testCase of malformedCases) {
    void it(testCase.title, () => {
      const result = loadInventory(createRunner(testCase.overrides));

      ok(!result.ok);
      strictEqual(diagnosticOf(result).code, "OPENSPEC_OUTPUT_MALFORMED");
      match(diagnosticOf(result).message, testCase.message);
    });
  }

  void it("ignores unknown fields in list and show output", () => {
    const listWithExtras = JSON.stringify({
      specs: [{ id: "execution-identity", requirementCount: 2, extra: true }],
      root: {},
      extra: "ignored",
    });
    const inventory = loadOk(createRunner({ [LIST]: response(listWithExtras) }));

    strictEqual(inventory.capabilities.length, 1);
    deepEqual(inventory.capabilities[0]?.requirements, [
      { name: "Single active execution", index: 1 },
      { name: "Restart keeps lock", index: 2 },
    ]);
  });

  function writePackage(root: string, bin: string | Record<string, string>): void {
    const packageDir = join(root, "node_modules", "@fission-ai", "openspec");
    mkdirSync(join(packageDir, "bin"), { recursive: true });
    const manifest = {
      name: "@fission-ai/openspec",
      version: "1.14.3",
      exports: { ".": "./index.js" },
      bin: typeof bin === "string" ? bin : { openspec: bin.openspec },
    };
    writeFileSync(join(packageDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(
      join(packageDir, "bin", "openspec.js"),
      [
        'const args = process.argv.slice(2).join(" ");',
        'if (args === "--version") { process.stdout.write("1.14.3\\n"); }',
        "else { process.stderr.write(`unexpected: ${args}\\n`); process.exitCode = 1; }",
        "",
      ].join("\n"),
    );
  }

  function writeManifest(root: string): void {
    writeFileSync(
      join(root, "package.json"),
      `${JSON.stringify({ name: "fixture", private: true }, null, 2)}\n`,
    );
  }

  function createProject(withPackage: boolean): string {
    const root = mkdtempSync(join(tmpdir(), "ai-openspec-adapter-"));
    writeManifest(root);

    if (withPackage) {
      writePackage(root, { openspec: "bin/openspec.js" });
    }

    return root;
  }

  void it("runs the project-local OpenSpec bin without a shell", (context) => {
    const root = createProject(true);
    context.after(() => rmSync(root, { recursive: true, force: true }));

    const result = createDefaultRunner(root)([VERSION]);

    strictEqual(result.status, 0);
    strictEqual(result.stdout, "1.14.3\n");
    strictEqual(result.error, undefined);
  });

  void it("finds the package in a parent node_modules directory", (context) => {
    const parent = mkdtempSync(join(tmpdir(), "ai-openspec-adapter-parent-"));
    context.after(() => rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, "child");
    mkdirSync(root);
    writeManifest(root);
    writePackage(parent, { openspec: "bin/openspec.js" });

    const result = createDefaultRunner(root)([VERSION]);

    strictEqual(result.status, 0);
    strictEqual(result.stdout, "1.14.3\n");
    strictEqual(result.error, undefined);
  });

  void it("tells the user to install the package when it is missing", (context) => {
    const root = createProject(false);
    context.after(() => rmSync(root, { recursive: true, force: true }));

    const result = loadInventory(createDefaultRunner(root));

    ok(!result.ok);
    strictEqual(diagnosticOf(result).code, "OPENSPEC_NOT_FOUND");
    match(diagnosticOf(result).message, /@fission-ai\/openspec/);
    match(diagnosticOf(result).message, /devDependency/i);
  });

  void it("rejects a bin path that leaves the package directory", (context) => {
    const root = createProject(false);
    context.after(() => rmSync(root, { recursive: true, force: true }));
    writePackage(root, { openspec: "../escape.js" });

    const result = loadInventory(createDefaultRunner(root));

    ok(!result.ok);
    strictEqual(diagnosticOf(result).code, "OPENSPEC_NOT_FOUND");
    match(diagnosticOf(result).message, /\.\.\/escape\.js/);
  });
});
