import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const SUPPORTED_RANGE = ">=1.14.0 <2.0.0";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const PACKAGE_NAME = "@fission-ai/openspec";

export type OpenSpecDiagnosticCode =
  | "OPENSPEC_NOT_FOUND"
  | "OPENSPEC_CLI_FAILED"
  | "OPENSPEC_VERSION_UNSUPPORTED"
  | "OPENSPEC_OUTPUT_MALFORMED"
  | "OPENSPEC_CAPABILITY_NOT_FOUND"
  | "OPENSPEC_REQUIREMENT_NOT_FOUND"
  | "OPENSPEC_REQUIREMENT_AMBIGUOUS";

export interface AdapterDiagnostic {
  code: OpenSpecDiagnosticCode;
  message: string;
  location?: string;
}

export interface OpenSpecRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type OpenSpecRunner = (args: readonly string[]) => OpenSpecRunResult;

export interface InventoryRequirement {
  name: string;
  index: number;
}

export interface InventoryCapability {
  id: string;
  source: string;
  requirements: readonly InventoryRequirement[];
}

export interface OpenSpecInventory {
  openspecVersion: string;
  capabilities: readonly InventoryCapability[];
}

export type LoadInventoryResult =
  | { ok: true; inventory: OpenSpecInventory }
  | { ok: false; diagnostics: readonly AdapterDiagnostic[] };

export interface Reference {
  capability: string;
  requirement?: string;
}

export type ResolveReferenceResult =
  | { ok: true; capability: string; requirement?: InventoryRequirement; source: string }
  | { ok: false; diagnostic: AdapterDiagnostic };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function errorCode(error: Error): string | undefined {
  const code: unknown = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isNotFound(error: Error): boolean {
  const code = errorCode(error);
  return code === "ENOENT" || code === "MODULE_NOT_FOUND";
}

function resolveBinPath(projectRoot: string): string {
  const requireFromProject = createRequire(join(projectRoot, "package.json"));
  const packageJsonPath = requireFromProject.resolve(`${PACKAGE_NAME}/package.json`);
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  if (!isRecord(parsed) || !isRecord(parsed.bin) || typeof parsed.bin.openspec !== "string") {
    throw new Error(`${PACKAGE_NAME} package.json does not define bin.openspec`);
  }

  return join(dirname(packageJsonPath), parsed.bin.openspec);
}

export function createDefaultRunner(projectRoot: string, entryPath?: string): OpenSpecRunner {
  return (args) => {
    let binPath: string;
    try {
      binPath = entryPath ?? resolveBinPath(projectRoot);
    } catch (error: unknown) {
      return { status: null, stdout: "", stderr: "", error: toError(error) };
    }

    const result = spawnSync(process.execPath, [binPath, ...args], {
      cwd: projectRoot,
      shell: false,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
      timeout: DEFAULT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
    });

    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      ...(result.error === undefined ? {} : { error: result.error }),
    };
  };
}

interface StatusEntry {
  code: string;
  message: string;
}

function readStatusEntries(stdout: string): readonly StatusEntry[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.status) || parsed.status.length === 0) {
    return undefined;
  }

  const entries: StatusEntry[] = [];
  for (const entry of parsed.status) {
    if (!isRecord(entry) || typeof entry.code !== "string" || typeof entry.message !== "string") {
      return undefined;
    }
    entries.push({ code: entry.code, message: entry.message });
  }
  return entries;
}

function describeFailure(command: string, result: OpenSpecRunResult): string {
  if (result.status === null) {
    const reason = result.error?.message ?? "the process was terminated or timed out";
    return `${reason} (no exit status)`;
  }

  const statuses = readStatusEntries(result.stdout);
  if (statuses !== undefined) {
    return statuses.map((entry) => `${entry.code}: ${entry.message}`).join("; ");
  }

  const stderrLine = result.stderr.split(/\r?\n/).find((line) => line.trim() !== "");
  return stderrLine?.trim() ?? `exit status ${result.status}`;
}

function notFoundDiagnostic(command: string): AdapterDiagnostic {
  return {
    code: "OPENSPEC_NOT_FOUND",
    message:
      `Cannot run OpenSpec command "${command}" because ${PACKAGE_NAME} is not installed ` +
      `in this project. Install it as a devDependency: npm install --save-dev ${PACKAGE_NAME}`,
  };
}

function cliFailedDiagnostic(command: string, result: OpenSpecRunResult): AdapterDiagnostic {
  return {
    code: "OPENSPEC_CLI_FAILED",
    message: `OpenSpec command "${command}" failed: ${describeFailure(command, result)}`,
  };
}

type CommandResult =
  { ok: true; result: OpenSpecRunResult } | { ok: false; diagnostic: AdapterDiagnostic };

function runCommand(
  runner: OpenSpecRunner,
  command: string,
  args: readonly string[],
): CommandResult {
  let result: OpenSpecRunResult;
  try {
    result = runner(args);
  } catch (error: unknown) {
    return {
      ok: false,
      diagnostic: {
        code: "OPENSPEC_CLI_FAILED",
        message: `OpenSpec command "${command}" failed: ${toError(error).message}`,
      },
    };
  }

  if (result.error !== undefined && isNotFound(result.error)) {
    return { ok: false, diagnostic: notFoundDiagnostic(command) };
  }

  if (result.status === null) {
    return { ok: false, diagnostic: cliFailedDiagnostic(command, result) };
  }

  if (result.status !== 0) {
    return { ok: false, diagnostic: cliFailedDiagnostic(command, result) };
  }

  return { ok: true, result };
}

function malformed(command: string, field: string, detail: string): AdapterDiagnostic {
  return {
    code: "OPENSPEC_OUTPUT_MALFORMED",
    message: `OpenSpec command "${command}" returned malformed output: ${field} ${detail}.`,
  };
}

function parseVersion(
  raw: string,
): { ok: true; version: string } | { ok: false; diagnostic: AdapterDiagnostic } {
  const version = raw.trim();
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);

  if (match === null) {
    if (/^\d+\.\d+\.\d+[-+][0-9A-Za-z.-]*$/.test(version)) {
      return {
        ok: false,
        diagnostic: {
          code: "OPENSPEC_VERSION_UNSUPPORTED",
          message: `OpenSpec version "${version}" is not supported. Supported range: ${SUPPORTED_RANGE}.`,
        },
      };
    }
    return {
      ok: false,
      diagnostic: malformed(
        "--version",
        "version",
        `must be a semantic version, received "${version}"`,
      ),
    };
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

  if (major !== 1 || minor < 14) {
    return {
      ok: false,
      diagnostic: {
        code: "OPENSPEC_VERSION_UNSUPPORTED",
        message: `OpenSpec version "${version}" is not supported. Supported range: ${SUPPORTED_RANGE}.`,
      },
    };
  }

  return { ok: true, version };
}

type SpecIdResult =
  { ok: true; ids: readonly string[] } | { ok: false; diagnostic: AdapterDiagnostic };

function parseSpecIds(stdout: string, command: string): SpecIdResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { ok: false, diagnostic: malformed(command, "specs", "is not valid JSON") };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.specs)) {
    return { ok: false, diagnostic: malformed(command, "specs", "must be an array") };
  }

  const ids: string[] = [];
  for (const [position, spec] of parsed.specs.entries()) {
    if (!isRecord(spec) || typeof spec.id !== "string") {
      return {
        ok: false,
        diagnostic: malformed(command, `specs[${position}].id`, "must be a string"),
      };
    }
    if (typeof spec.requirementCount !== "number") {
      return {
        ok: false,
        diagnostic: malformed(command, `specs[${position}].requirementCount`, "must be a number"),
      };
    }
    ids.push(spec.id);
  }

  return { ok: true, ids };
}

type ShowResult =
  | { ok: true; requirements: readonly InventoryRequirement[] }
  | { ok: false; diagnostic: AdapterDiagnostic };

function parseShow(stdout: string, command: string, expectedId: string): ShowResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { ok: false, diagnostic: malformed(command, "spec", "is not valid JSON") };
  }

  if (!isRecord(parsed)) {
    return { ok: false, diagnostic: malformed(command, "spec", "must be an object") };
  }
  if (typeof parsed.id !== "string") {
    return { ok: false, diagnostic: malformed(command, "id", "must be a string") };
  }
  if (parsed.id !== expectedId) {
    return {
      ok: false,
      diagnostic: malformed(command, "id", `must equal the requested id "${expectedId}"`),
    };
  }
  if (typeof parsed.requirementCount !== "number") {
    return { ok: false, diagnostic: malformed(command, "requirementCount", "must be a number") };
  }
  if (!Array.isArray(parsed.requirements)) {
    return { ok: false, diagnostic: malformed(command, "requirements", "must be an array") };
  }
  if (parsed.requirements.length !== parsed.requirementCount) {
    return {
      ok: false,
      diagnostic: malformed(
        command,
        "requirementCount",
        `is ${String(parsed.requirementCount)} but requirements has length ${String(parsed.requirements.length)}`,
      ),
    };
  }

  const requirements: InventoryRequirement[] = [];
  for (const [position, requirement] of parsed.requirements.entries()) {
    if (!isRecord(requirement) || typeof requirement.name !== "string") {
      return {
        ok: false,
        diagnostic: malformed(command, `requirements[${position}].name`, "must be a string"),
      };
    }
    requirements.push({ name: requirement.name, index: position + 1 });
  }

  return { ok: true, requirements };
}

function sourceFor(capabilityId: string): string {
  return `openspec/specs/${capabilityId}/spec.md`;
}

function byId(left: InventoryCapability, right: InventoryCapability): number {
  if (left.id < right.id) {
    return -1;
  }
  if (left.id > right.id) {
    return 1;
  }
  return 0;
}

export function loadInventory(runner: OpenSpecRunner): LoadInventoryResult {
  const versionCommand = "--version";
  const versionRun = runCommand(runner, versionCommand, [versionCommand]);
  if (!versionRun.ok) {
    return { ok: false, diagnostics: [versionRun.diagnostic] };
  }

  const parsedVersion = parseVersion(versionRun.result.stdout);
  if (!parsedVersion.ok) {
    return { ok: false, diagnostics: [parsedVersion.diagnostic] };
  }

  const listCommand = "list --specs --json";
  const listRun = runCommand(runner, listCommand, ["list", "--specs", "--json"]);
  if (!listRun.ok) {
    return { ok: false, diagnostics: [listRun.diagnostic] };
  }

  const parsedList = parseSpecIds(listRun.result.stdout, listCommand);
  if (!parsedList.ok) {
    return { ok: false, diagnostics: [parsedList.diagnostic] };
  }

  const capabilities: InventoryCapability[] = [];
  for (const id of parsedList.ids) {
    const showCommand = `show ${id} --type spec --json`;
    const showRun = runCommand(runner, showCommand, ["show", id, "--type", "spec", "--json"]);
    if (!showRun.ok) {
      return { ok: false, diagnostics: [showRun.diagnostic] };
    }

    const parsedShow = parseShow(showRun.result.stdout, showCommand, id);
    if (!parsedShow.ok) {
      return { ok: false, diagnostics: [parsedShow.diagnostic] };
    }

    capabilities.push({
      id,
      source: sourceFor(id),
      requirements: parsedShow.requirements,
    });
  }

  capabilities.sort(byId);

  return {
    ok: true,
    inventory: {
      openspecVersion: parsedVersion.version,
      capabilities,
    },
  };
}

function requirementNotFound(
  capability: string,
  requirement: string,
  source: string,
): AdapterDiagnostic {
  return {
    code: "OPENSPEC_REQUIREMENT_NOT_FOUND",
    message: `Requirement "${requirement}" was not found in capability "${capability}" (${source}).`,
    location: source,
  };
}

function requirementAmbiguous(
  capability: string,
  requirement: string,
  source: string,
  indexes: readonly number[],
): AdapterDiagnostic {
  return {
    code: "OPENSPEC_REQUIREMENT_AMBIGUOUS",
    message:
      `Requirement "${requirement}" is ambiguous in capability "${capability}" (${source}); ` +
      `matching indexes ${indexes.join(" and ")}.`,
    location: source,
  };
}

export function resolveReference(
  inventory: OpenSpecInventory,
  reference: Reference,
): ResolveReferenceResult {
  const capability = inventory.capabilities.find((item) => item.id === reference.capability);

  if (capability === undefined) {
    return {
      ok: false,
      diagnostic: {
        code: "OPENSPEC_CAPABILITY_NOT_FOUND",
        message: `Capability "${reference.capability}" was not found in the OpenSpec inventory.`,
      },
    };
  }

  if (reference.requirement === undefined) {
    return { ok: true, capability: capability.id, source: capability.source };
  }

  const matches = capability.requirements.filter((item) => item.name === reference.requirement);
  if (matches.length === 0) {
    return {
      ok: false,
      diagnostic: requirementNotFound(capability.id, reference.requirement, capability.source),
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      diagnostic: requirementAmbiguous(
        capability.id,
        reference.requirement,
        capability.source,
        matches.map((item) => item.index),
      ),
    };
  }

  const requirement = matches[0];
  if (requirement === undefined) {
    return {
      ok: false,
      diagnostic: requirementNotFound(capability.id, reference.requirement, capability.source),
    };
  }

  return {
    ok: true,
    capability: capability.id,
    requirement,
    source: capability.source,
  };
}
