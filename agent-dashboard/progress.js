const os = require("node:os");
const path = require("node:path");

function parseRalphTaskProgress(lines) {
  const arr = Array.isArray(lines) ? lines : [];

  // Scan bottom-up to prefer the most recent progress line.
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const line = String(arr[i] || "");

    let m = line.match(/\bTask\s+(\d+)\s*\/\s*(\d+)\b/i);
    if (m) return { current: Number(m[1]), total: Number(m[2]) };

    m = line.match(/\b(\d+)\s+of\s+(\d+)\s+(?:tasks?|steps?)\b/i);
    if (m) return { current: Number(m[1]), total: Number(m[2]) };

    // Common completion summary: "completed (14/14, exit 0, ...)".
    m = line.match(/\bcompleted\b[^(]*\(\s*(\d+)\s*\/\s*(\d+)\b/i);
    if (m) return { current: Number(m[1]), total: Number(m[2]) };
  }

  return null;
}

function stripTrailingPunctuation(s) {
  return String(s).replace(/[),.;\]]+$/g, "");
}

function extractChecklistPathFromLines(lines, options = {}) {
  const arr = Array.isArray(lines) ? lines : [];
  const searchDirs = Array.isArray(options.searchDirs) ? options.searchDirs : [];

  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const line = String(arr[i] || "");

    // Most explicit: "PRD: /path/to/file.md"
    let m = line.match(/\bPRD\s*[:=]\s*([^\s]+\.md)\b/i);
    if (!m) m = line.match(/\bChecklist\s*[:=]\s*([^\s]+\.md)\b/i);
    if (m) return resolveMaybeRelative(stripTrailingPunctuation(m[1]), searchDirs);

    // Any absolute .md path (common in logs).
    m = line.match(/(\/[^\s]+\.md)\b/);
    if (m) return stripTrailingPunctuation(m[1]);

    // A bare filename like "PRD.md" or "BUILD-CHECKLIST.md" (best-effort).
    m = line.match(/\b([A-Za-z0-9._-]+\.md)\b/);
    if (m) return resolveMaybeRelative(stripTrailingPunctuation(m[1]), searchDirs);
  }

  return null;
}

function resolveMaybeRelative(p, searchDirs) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;

  for (const dir of searchDirs) {
    if (!dir) continue;
    const candidate = path.resolve(String(dir), p);
    return candidate;
  }

  return path.resolve(process.cwd(), p);
}

function isPathAllowed(filePath, allowedRoots) {
  if (!filePath) return false;
  const abs = path.resolve(filePath);
  const roots = Array.isArray(allowedRoots) ? allowedRoots : [];

  for (const root of roots) {
    const base = path.resolve(String(root));
    const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;
    if ((abs + path.sep).startsWith(baseWithSep)) return true;
  }

  return false;
}

function parseChecklistProgress(markdownText) {
  const text = String(markdownText || "");
  const lines = text.split(/\r?\n/);

  let inFence = false;
  let total = 0;
  let done = 0;

  for (const rawLine of lines) {
    const line = String(rawLine);

    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // GitHub-style task list items.
    // Examples: "- [ ] foo", "* [x] bar", "1. [ ] baz", "[x] qux"
    const m = line.match(/^\s*(?:(?:[-*+])|\d+\.)?\s*\[( |x|X)\]\s+/);
    if (!m) continue;

    total += 1;
    if (m[1].toLowerCase() === "x") done += 1;
  }

  if (total === 0) return null;
  return { done, total };
}

function defaultChecklistRoots() {
  const home = os.homedir();
  return [path.join(home, ".openclaw", "workspace"), os.tmpdir()];
}

module.exports = {
  parseRalphTaskProgress,
  extractChecklistPathFromLines,
  parseChecklistProgress,
  isPathAllowed,
  defaultChecklistRoots,
};

