#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

async function listJsFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === "node_modules") continue;
    if (ent.name.startsWith(".")) continue;

    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listJsFiles(p)));
    } else if (ent.isFile() && ent.name.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

async function main() {
  // Prefer ESLint when available (dev installs), but fall back to syntax checking
  // so linting can still run in constrained environments.
  try {
    const eslintBin = require.resolve("eslint/bin/eslint.js", { paths: [process.cwd()] });
    execFileSync(process.execPath, [eslintBin, "."], { stdio: "inherit" });
    return;
  } catch {
    // continue
  }

  const files = await listJsFiles(process.cwd());
  for (const file of files) {
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
    } catch {
      process.exitCode = 1;
      return;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
