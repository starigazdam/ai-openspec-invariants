export const DIAGNOSTIC_CODES = [
  "REG_NOT_OBJECT",
  "REG_SCHEMA_VERSION",
  "REG_MISSING_FIELD",
  "REG_WRONG_TYPE",
  "REG_UNKNOWN_FIELD",
  "REG_EMPTY_STRING",
  "REG_ID_FORMAT",
  "REG_CAPABILITY_FORMAT",
  "REG_TEST_FORMAT",
  "REG_PATH_INVALID",
  "REG_DUPLICATE_ID",
  "REG_DUPLICATE_TEST_ID",
  "REG_DUPLICATE_ENTRY",
  "REG_RETIRED_ID_REUSED",
  "REG_ACTIVE_WITHOUT_TESTS",
  "REG_OWNER_AS_CONSUMER",
  "REG_SUPERSEDED_BY_UNKNOWN",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export interface InvariantOwner {
  readonly capability: string;
  readonly requirement: string;
}

export interface InvariantTest {
  readonly id: string;
  readonly format: "junit" | "trx";
  readonly case: string;
}

export interface Invariant {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly owner: InvariantOwner;
  readonly consumers?: readonly string[];
  readonly implementation?: readonly string[];
  readonly tests: readonly InvariantTest[];
}

export interface RetiredInvariant {
  readonly id: string;
  readonly reason: string;
  readonly supersededBy?: string;
}

export interface Registry {
  readonly version: 1;
  readonly invariants: readonly Invariant[];
  readonly retired: readonly RetiredInvariant[];
}

export type RegistryValidationResult =
  | { readonly ok: true; readonly registry: Registry }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export const REGISTRY_SHAPE = {
  registry: {
    properties: ["version", "invariants", "retired"],
    required: ["version", "invariants"],
  },
  invariant: {
    properties: ["id", "title", "summary", "owner", "consumers", "implementation", "tests"],
    required: ["id", "title", "summary", "owner", "tests"],
  },
  owner: {
    properties: ["capability", "requirement"],
    required: ["capability", "requirement"],
  },
  test: {
    properties: ["id", "format", "case"],
    required: ["id", "format", "case"],
  },
  retired: {
    properties: ["id", "reason", "supersededBy"],
    required: ["id", "reason"],
  },
} as const;

type UnknownRecord = Record<string, unknown>;
type Reporter = (code: DiagnosticCode, path: string, message: string) => void;

interface StringRule {
  readonly label: string;
  readonly nonEmpty?: boolean;
  readonly pattern?: RegExp;
  readonly formatCode?: DiagnosticCode;
}

const INVARIANT_ID_PATTERN = /^[A-Z][A-Z0-9]*-[0-9]{3,}$/;
const TEST_ID_PATTERN = /^[A-Z][A-Z0-9]*-[0-9]{3,}-T[0-9]+$/;
const CAPABILITY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DRIVE_PATTERN = /^[A-Za-z]:/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(object: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function escapePointerSegment(segment: string | number): string {
  return String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
}

function pointer(...segments: readonly (string | number)[]): string {
  return segments.map((segment) => `/${escapePointerSegment(segment)}`).join("");
}

function childPointer(basePath: string, segment: string | number): string {
  return `${basePath}/${escapePointerSegment(segment)}`;
}

function checkUnknownFields(
  value: UnknownRecord,
  allowed: readonly string[],
  basePath: string,
  report: Reporter,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      report("REG_UNKNOWN_FIELD", childPointer(basePath, key), `Unknown field "${key}".`);
    }
  }
}

function checkString(
  object: UnknownRecord,
  key: string,
  basePath: string,
  rule: StringRule,
  report: Reporter,
): string | undefined {
  const path = childPointer(basePath, key);
  if (!hasOwn(object, key)) {
    report("REG_MISSING_FIELD", path, `Missing required field "${rule.label}".`);
    return undefined;
  }

  const value = object[key];
  if (typeof value !== "string") {
    report("REG_WRONG_TYPE", path, `Field "${rule.label}" must be a string.`);
    return undefined;
  }

  if (rule.nonEmpty === true && value.trim() === "") {
    report("REG_EMPTY_STRING", path, `Field "${rule.label}" must not be empty.`);
    return undefined;
  }

  if (rule.pattern !== undefined && rule.formatCode !== undefined && !rule.pattern.test(value)) {
    report(rule.formatCode, path, `Field "${rule.label}" has an invalid format.`);
    return undefined;
  }

  return value;
}

function isValidRepositoryPath(value: string): boolean {
  if (value === "" || value.startsWith("/") || value.startsWith("\\")) return false;
  if (DRIVE_PATTERN.test(value) || value.includes("\\") || value.endsWith("/")) return false;

  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function collectIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) return ids;

  const items: readonly unknown[] = value;
  for (const item of items) {
    if (isRecord(item) && typeof item.id === "string") ids.add(item.id);
  }
  return ids;
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  if (left.path !== right.path) return left.path < right.path ? -1 : 1;
  if (left.code !== right.code) return left.code < right.code ? -1 : 1;
  if (left.message !== right.message) return left.message < right.message ? -1 : 1;
  return 0;
}

function validateOwner(
  item: UnknownRecord,
  invariantPath: string,
  report: Reporter,
): InvariantOwner | undefined {
  const path = childPointer(invariantPath, "owner");
  if (!hasOwn(item, "owner")) {
    report("REG_MISSING_FIELD", path, 'Missing required field "owner".');
    return undefined;
  }

  const value = item.owner;
  if (!isRecord(value)) {
    report("REG_WRONG_TYPE", path, 'Field "owner" must be an object.');
    return undefined;
  }

  checkUnknownFields(value, REGISTRY_SHAPE.owner.properties, path, report);
  const capability = checkString(
    value,
    "capability",
    path,
    {
      label: "owner.capability",
      pattern: CAPABILITY_PATTERN,
      formatCode: "REG_CAPABILITY_FORMAT",
    },
    report,
  );
  const requirement = checkString(
    value,
    "requirement",
    path,
    { label: "owner.requirement", nonEmpty: true },
    report,
  );

  if (capability === undefined || requirement === undefined) return undefined;
  return { capability, requirement };
}

function validateConsumers(
  item: UnknownRecord,
  invariantPath: string,
  ownerCapability: string | undefined,
  report: Reporter,
): string[] | undefined {
  if (!hasOwn(item, "consumers")) return undefined;

  const path = childPointer(invariantPath, "consumers");
  const value = item.consumers;
  if (!Array.isArray(value)) {
    report("REG_WRONG_TYPE", path, 'Field "consumers" must be an array.');
    return undefined;
  }

  const consumers: string[] = [];
  const seen = new Set<string>();
  const items: readonly unknown[] = value;
  items.forEach((entry, index) => {
    const entryPath = childPointer(path, index);
    if (typeof entry !== "string") {
      report("REG_WRONG_TYPE", entryPath, "Consumer must be a string.");
      return;
    }
    if (!CAPABILITY_PATTERN.test(entry)) {
      report("REG_CAPABILITY_FORMAT", entryPath, `Consumer "${entry}" is not a capability name.`);
      return;
    }
    if (ownerCapability !== undefined && entry === ownerCapability) {
      report("REG_OWNER_AS_CONSUMER", entryPath, `Consumer "${entry}" is the owner capability.`);
    }
    if (seen.has(entry)) {
      report("REG_DUPLICATE_ENTRY", entryPath, `Duplicate consumer "${entry}".`);
    } else {
      seen.add(entry);
    }
    consumers.push(entry);
  });

  return consumers;
}

function validateImplementation(
  item: UnknownRecord,
  invariantPath: string,
  report: Reporter,
): string[] | undefined {
  if (!hasOwn(item, "implementation")) return undefined;

  const path = childPointer(invariantPath, "implementation");
  const value = item.implementation;
  if (!Array.isArray(value)) {
    report("REG_WRONG_TYPE", path, 'Field "implementation" must be an array.');
    return undefined;
  }

  const implementation: string[] = [];
  const seen = new Set<string>();
  const items: readonly unknown[] = value;
  items.forEach((entry, index) => {
    const entryPath = childPointer(path, index);
    if (typeof entry !== "string") {
      report("REG_WRONG_TYPE", entryPath, "Implementation path must be a string.");
      return;
    }
    if (!isValidRepositoryPath(entry)) {
      report("REG_PATH_INVALID", entryPath, `Path "${entry}" is not a normalized repository path.`);
      return;
    }
    if (seen.has(entry)) {
      report("REG_DUPLICATE_ENTRY", entryPath, `Duplicate implementation path "${entry}".`);
    } else {
      seen.add(entry);
    }
    implementation.push(entry);
  });

  return implementation;
}

function checkFormat(
  entry: UnknownRecord,
  testPath: string,
  report: Reporter,
): InvariantTest["format"] | undefined {
  const path = childPointer(testPath, "format");
  if (!hasOwn(entry, "format")) {
    report("REG_MISSING_FIELD", path, 'Missing required field "format".');
    return undefined;
  }

  const value = entry.format;
  if (typeof value !== "string") {
    report("REG_WRONG_TYPE", path, 'Field "format" must be a string.');
    return undefined;
  }
  if (value !== "junit" && value !== "trx") {
    report("REG_TEST_FORMAT", path, `Test format "${value}" is not supported.`);
    return undefined;
  }

  return value;
}

function validateTests(
  item: UnknownRecord,
  invariantPath: string,
  seenTestIds: Set<string>,
  report: Reporter,
): InvariantTest[] | undefined {
  const path = childPointer(invariantPath, "tests");
  if (!hasOwn(item, "tests")) {
    report("REG_ACTIVE_WITHOUT_TESTS", path, "Active invariants must have at least one test.");
    return undefined;
  }

  const value = item.tests;
  if (!Array.isArray(value)) {
    report("REG_WRONG_TYPE", path, 'Field "tests" must be an array.');
    return undefined;
  }
  if (value.length === 0) {
    report("REG_ACTIVE_WITHOUT_TESTS", path, "Active invariants must have at least one test.");
    return [];
  }

  const tests: InvariantTest[] = [];
  const items: readonly unknown[] = value;
  items.forEach((entry, index) => {
    const testPath = childPointer(path, index);
    if (!isRecord(entry)) {
      report("REG_NOT_OBJECT", testPath, "Test entry must be an object.");
      return;
    }

    checkUnknownFields(entry, REGISTRY_SHAPE.test.properties, testPath, report);
    const id = checkString(
      entry,
      "id",
      testPath,
      { label: "test id", pattern: TEST_ID_PATTERN, formatCode: "REG_ID_FORMAT" },
      report,
    );
    if (id !== undefined) {
      if (seenTestIds.has(id)) {
        report("REG_DUPLICATE_TEST_ID", childPointer(testPath, "id"), `Duplicate test id "${id}".`);
      } else {
        seenTestIds.add(id);
      }
    }

    const format = checkFormat(entry, testPath, report);
    const testCase = checkString(
      entry,
      "case",
      testPath,
      { label: "case", nonEmpty: true },
      report,
    );

    if (id !== undefined && format !== undefined && testCase !== undefined) {
      tests.push({ id, format, case: testCase });
    }
  });

  return tests;
}

function validateInvariants(
  items: readonly unknown[],
  retiredIds: ReadonlySet<string>,
  report: Reporter,
): Invariant[] {
  const invariants: Invariant[] = [];
  const seenIds = new Set<string>();
  const seenTestIds = new Set<string>();

  items.forEach((item, index) => {
    const path = pointer("invariants", index);
    if (!isRecord(item)) {
      report("REG_NOT_OBJECT", path, "Invariant must be an object.");
      return;
    }

    checkUnknownFields(item, REGISTRY_SHAPE.invariant.properties, path, report);
    const id = checkString(
      item,
      "id",
      path,
      { label: "id", pattern: INVARIANT_ID_PATTERN, formatCode: "REG_ID_FORMAT" },
      report,
    );
    if (id !== undefined) {
      if (seenIds.has(id)) {
        report("REG_DUPLICATE_ID", childPointer(path, "id"), `Duplicate invariant id "${id}".`);
      } else {
        seenIds.add(id);
      }
      if (retiredIds.has(id)) {
        report("REG_RETIRED_ID_REUSED", childPointer(path, "id"), `Retired id "${id}" is reused.`);
      }
    }

    const title = checkString(item, "title", path, { label: "title", nonEmpty: true }, report);
    const summary = checkString(
      item,
      "summary",
      path,
      { label: "summary", nonEmpty: true },
      report,
    );
    const owner = validateOwner(item, path, report);
    const consumers = validateConsumers(item, path, owner?.capability, report);
    const implementation = validateImplementation(item, path, report);
    const tests = validateTests(item, path, seenTestIds, report);

    if (
      id !== undefined &&
      title !== undefined &&
      summary !== undefined &&
      owner !== undefined &&
      tests !== undefined
    ) {
      invariants.push({
        id,
        title,
        summary,
        owner,
        ...(consumers === undefined ? {} : { consumers }),
        ...(implementation === undefined ? {} : { implementation }),
        tests,
      });
    }
  });

  return invariants;
}

function validateSupersededBy(
  entry: UnknownRecord,
  retiredPath: string,
  ownId: string | undefined,
  activeIds: ReadonlySet<string>,
  retiredIds: ReadonlySet<string>,
  report: Reporter,
): string | undefined {
  if (!hasOwn(entry, "supersededBy")) return undefined;

  const path = childPointer(retiredPath, "supersededBy");
  const value = entry.supersededBy;
  if (typeof value !== "string") {
    report("REG_WRONG_TYPE", path, 'Field "supersededBy" must be a string.');
    return undefined;
  }
  if (value === ownId || (!activeIds.has(value) && !retiredIds.has(value))) {
    report("REG_SUPERSEDED_BY_UNKNOWN", path, `supersededBy "${value}" is not a known id.`);
    return undefined;
  }

  return value;
}

function validateRetired(
  items: readonly unknown[],
  activeIds: ReadonlySet<string>,
  retiredIds: ReadonlySet<string>,
  report: Reporter,
): RetiredInvariant[] {
  const retired: RetiredInvariant[] = [];
  const seenIds = new Set<string>();

  items.forEach((item, index) => {
    const path = pointer("retired", index);
    if (!isRecord(item)) {
      report("REG_NOT_OBJECT", path, "Retired entry must be an object.");
      return;
    }

    checkUnknownFields(item, REGISTRY_SHAPE.retired.properties, path, report);
    const id = checkString(
      item,
      "id",
      path,
      { label: "id", pattern: INVARIANT_ID_PATTERN, formatCode: "REG_ID_FORMAT" },
      report,
    );
    if (id !== undefined) {
      if (seenIds.has(id)) {
        report("REG_DUPLICATE_ID", childPointer(path, "id"), `Duplicate retired id "${id}".`);
      } else {
        seenIds.add(id);
      }
    }

    const reason = checkString(item, "reason", path, { label: "reason", nonEmpty: true }, report);
    const ownId = typeof item.id === "string" ? item.id : undefined;
    const supersededBy = validateSupersededBy(item, path, ownId, activeIds, retiredIds, report);

    if (id !== undefined && reason !== undefined) {
      retired.push({
        id,
        reason,
        ...(supersededBy === undefined ? {} : { supersededBy }),
      });
    }
  });

  return retired;
}

function validateRoot(input: unknown, report: Reporter): Registry | undefined {
  if (!isRecord(input)) {
    report("REG_NOT_OBJECT", "", "Registry must be an object.");
    return undefined;
  }

  checkUnknownFields(input, REGISTRY_SHAPE.registry.properties, "", report);

  const version = input.version;
  if (!hasOwn(input, "version") || version !== 1) {
    report("REG_SCHEMA_VERSION", "/version", 'Field "version" must be the number 1.');
  }

  const rawInvariants = input.invariants;
  const rawRetired = input.retired;
  const activeIds = collectIds(rawInvariants);
  const retiredIds = collectIds(rawRetired);

  let invariants: Invariant[] = [];
  if (!hasOwn(input, "invariants")) {
    report("REG_MISSING_FIELD", "/invariants", 'Missing required field "invariants".');
  } else if (!Array.isArray(rawInvariants)) {
    report("REG_WRONG_TYPE", "/invariants", 'Field "invariants" must be an array.');
  } else {
    const items: readonly unknown[] = rawInvariants;
    invariants = validateInvariants(items, retiredIds, report);
  }

  let retired: RetiredInvariant[] = [];
  if (hasOwn(input, "retired")) {
    if (!Array.isArray(rawRetired)) {
      report("REG_WRONG_TYPE", "/retired", 'Field "retired" must be an array.');
    } else {
      const items: readonly unknown[] = rawRetired;
      retired = validateRetired(items, activeIds, retiredIds, report);
    }
  }

  if (version !== 1) return undefined;
  if (!hasOwn(input, "invariants") || !Array.isArray(rawInvariants)) return undefined;
  if (hasOwn(input, "retired") && !Array.isArray(rawRetired)) return undefined;

  return { version: 1, invariants, retired };
}

export function validateRegistry(input: unknown): RegistryValidationResult {
  const diagnostics: Diagnostic[] = [];
  const report: Reporter = (code, path, message) => {
    diagnostics.push({ code, path, message });
  };

  const registry = validateRoot(input, report);
  if (diagnostics.length > 0) {
    diagnostics.sort(compareDiagnostics);
    return { ok: false, diagnostics };
  }

  if (registry === undefined) {
    return {
      ok: false,
      diagnostics: [{ code: "REG_NOT_OBJECT", path: "", message: "Registry must be an object." }],
    };
  }

  return { ok: true, registry };
}
