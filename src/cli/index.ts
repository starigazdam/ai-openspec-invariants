#!/usr/bin/env node
import { readFileSync } from "node:fs";

const plannedCommands: readonly string[] = [
  "init",
  "doctor",
  "audit export",
  "check",
  "verify",
  "report",
];

function readVersion(): string {
  const raw: unknown = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );

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

function usage(version: string): string {
  return [
    `ai-openspec-invariants ${version}`,
    "",
    "Usage: ai-openspec-invariants [options]",
    "",
    "Options:",
    "  -h, --help     Show this help message",
    "  -v, --version  Print the package version",
    "",
    "Planned commands (not implemented yet):",
    ...plannedCommands.map((command) => `  ${command}`),
    "",
    "Exit codes:",
    "  0  Success",
    "  1  A gate failed (reserved for future check, verify and report --check)",
    "  2  Usage or internal error",
    "",
  ].join("\n");
}

function main(argv: readonly string[]): number {
  const version = readVersion();
  const argument = argv.length === 0 ? undefined : argv.join(" ");

  if (argument === undefined || argument === "--help" || argument === "-h") {
    process.stdout.write(usage(version));
    return 0;
  }

  if (argument === "--version" || argument === "-v") {
    process.stdout.write(`${version}\n`);
    return 0;
  }

  if (plannedCommands.includes(argument)) {
    process.stderr.write(`Error: "${argument}" is a planned command and is not implemented yet.\n`);
    return 2;
  }

  process.stderr.write(`Error: unknown argument "${argument}".\n`);
  return 2;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 2;
}
