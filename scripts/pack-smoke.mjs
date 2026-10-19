import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  process.stderr.write(
    "pack:smoke: npm_execpath is missing; run this script through npm (npm run pack:smoke).\n",
  );
  process.exit(1);
}

function runNpm(args, cwd) {
  const result = spawnSync(process.execPath, [npmExecPath, ...args], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`npm ${args.join(" ")} failed with status ${String(result.status)}`);
  }

  return result;
}

function readExpectedVersion() {
  const raw = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  if (typeof raw?.version !== "string") {
    throw new Error("package.json does not contain a string version");
  }
  return raw.version;
}

const packDir = mkdtempSync(join(tmpdir(), "ai-openspec-invariants-pack-"));
const installDir = mkdtempSync(join(tmpdir(), "ai-openspec-invariants-install-"));

try {
  runNpm(["pack", "--pack-destination", packDir, "--silent"], repoRoot);

  const tarball = readdirSync(packDir).find((name) => name.endsWith(".tgz"));
  if (!tarball) {
    throw new Error(`npm pack produced no tarball in ${packDir}`);
  }

  writeFileSync(
    join(installDir, "package.json"),
    `${JSON.stringify({ name: "pack-smoke", version: "0.0.0", private: true }, null, 2)}\n`,
  );

  runNpm(
    ["install", "--no-save", "--ignore-scripts", "--no-audit", "--no-fund", join(packDir, tarball)],
    installDir,
  );

  const installedPackage = join(
    installDir,
    "node_modules",
    "ai-openspec-invariants",
    "package.json",
  );
  const installed = JSON.parse(readFileSync(installedPackage, "utf8"));
  const binField = installed?.bin;
  const binEntry = typeof binField === "string" ? binField : binField?.["ai-openspec-invariants"];

  if (typeof binEntry !== "string") {
    throw new Error("installed package does not expose the ai-openspec-invariants bin");
  }

  const binPath = join(dirname(installedPackage), binEntry);
  const expectedVersion = readExpectedVersion();
  const result = spawnSync(process.execPath, [binPath, "--version"], {
    cwd: installDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`installed bin --version failed with status ${String(result.status)}`);
  }

  const actual = result.stdout;
  if (actual !== `${expectedVersion}\n`) {
    throw new Error(
      `installed bin printed ${JSON.stringify(actual)}, expected ${JSON.stringify(`${expectedVersion}\n`)}`,
    );
  }

  process.stdout.write(
    `pack:smoke: installed tarball prints the package version (${expectedVersion}).\n`,
  );
} finally {
  rmSync(packDir, { recursive: true, force: true });
  rmSync(installDir, { recursive: true, force: true });
}
