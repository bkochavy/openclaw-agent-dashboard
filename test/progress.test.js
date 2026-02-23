const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");

const {
  parseRalphTaskProgress,
  extractChecklistPathFromLines,
  parseChecklistProgress,
  isPathAllowed,
  defaultChecklistRoots,
} = require("../agent-dashboard/progress");

test("parseRalphTaskProgress extracts Task X/Y from output", () => {
  const lines = ["boot", "Task 3/10, 7 remaining", "more"];
  assert.deepEqual(parseRalphTaskProgress(lines), { current: 3, total: 10 });
});

test("parseRalphTaskProgress extracts completed (X/Y, ...)", () => {
  const lines = ["✅ completed (14/14, exit 0, 83min)"];
  assert.deepEqual(parseRalphTaskProgress(lines), { current: 14, total: 14 });
});

test("parseChecklistProgress counts task list items and ignores fenced code blocks", () => {
  const md = [
    "# PRD",
    "- [x] done",
    "- [ ] todo",
    "```",
    "- [x] not a task list item (code fence)",
    "```",
    "* [X] also done",
  ].join("\n");

  assert.deepEqual(parseChecklistProgress(md), { done: 2, total: 3 });
});

test("extractChecklistPathFromLines finds explicit PRD paths and resolves relative filenames", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-dashboard-"));
  const prd = path.join(dir, "PRD.md");
  await fsp.writeFile(prd, "- [ ] a\n");

  const abs = extractChecklistPathFromLines([`PRD: ${prd}`], { searchDirs: [] });
  assert.equal(abs, prd);

  const rel = extractChecklistPathFromLines(["PRD: PRD.md"], { searchDirs: [dir] });
  assert.equal(rel, prd);
});

test("isPathAllowed respects allowed roots", () => {
  const roots = defaultChecklistRoots();
  assert.equal(isPathAllowed(path.join(os.tmpdir(), "x.md"), roots), true);
  assert.equal(isPathAllowed("/etc/passwd", roots), false);
});

