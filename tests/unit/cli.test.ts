import { strictEqual, match, ok } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliPath = join(repoRoot, "dist", "cli", "index.js");

function readPackageVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

  if (
    typeof raw !== "object" ||
    raw === null ||
    !("version" in raw) ||
    typeof raw.version !== "string"
  ) {
    throw new Error("package.json does not contain a string version");
  }

  return raw.version;
}

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: readonly string[]): CliResult {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

const expectedVersion = readPackageVersion();
const plannedCommands = ["init", "doctor", "audit export", "check", "verify", "report"];

void describe("CLI", () => {
  void it("prints usage when run without arguments", () => {
    const result = runCli([]);

    strictEqual(result.status, 0);
    strictEqual(result.stderr, "");
    match(result.stdout, /Usage:/);
    match(result.stdout, /not implemented/i);
    for (const command of plannedCommands) {
      ok(result.stdout.includes(command), `usage should mention ${command}`);
    }
  });

  void it("prints usage for --help", () => {
    const result = runCli(["--help"]);

    strictEqual(result.status, 0);
    strictEqual(result.stderr, "");
    match(result.stdout, /Usage: ai-openspec-invariants/);
    match(result.stdout, /--help/);
    match(result.stdout, /--version/);
    match(result.stdout, /not implemented/i);
    for (const command of plannedCommands) {
      ok(result.stdout.includes(command), `usage should mention ${command}`);
    }
  });

  void it("prints usage for -h", () => {
    const result = runCli(["-h"]);

    strictEqual(result.status, 0);
    strictEqual(result.stderr, "");
    strictEqual(result.stdout, runCli(["--help"]).stdout);
  });

  void it("prints exactly the package version for --version", () => {
    const result = runCli(["--version"]);

    strictEqual(result.status, 0);
    strictEqual(result.stderr, "");
    strictEqual(result.stdout, `${expectedVersion}\n`);
  });

  void it("prints exactly the package version for -v", () => {
    const result = runCli(["-v"]);

    strictEqual(result.status, 0);
    strictEqual(result.stderr, "");
    strictEqual(result.stdout, `${expectedVersion}\n`);
  });

  void it("rejects a planned command as not implemented", () => {
    const result = runCli(["check"]);

    strictEqual(result.status, 2);
    strictEqual(result.stdout, "");
    match(result.stderr, /check/);
    match(result.stderr, /not implemented/i);
  });

  void it("rejects an unknown option", () => {
    const result = runCli(["--bogus"]);

    strictEqual(result.status, 2);
    strictEqual(result.stdout, "");
    match(result.stderr, /--bogus/);
    match(result.stderr, /unknown/i);
  });
});
