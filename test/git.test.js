const test = require("node:test");
const assert = require("node:assert/strict");

const { getGitInfo } = require("../agent-dashboard/git");

test("getGitInfo returns branch, lastCommit, and uncommittedChanges", async () => {
  const calls = [];
  const run = async (file, args) => {
    calls.push({ file, args });

    const key = `${file} ${args.join(" ")}`;
    if (key === "git branch --show-current") return { stdout: "main\n" };
    if (key === "git log -1 --format=%H%x00%s") return { stdout: "abc123\0hello world\n" };
    if (key === "git status --porcelain") return { stdout: " M server.js\n?? new.txt\n" };
    throw new Error(`unexpected command: ${key}`);
  };

  const info = await getGitInfo({ run });
  assert.deepEqual(info, {
    branch: "main",
    lastCommit: { hash: "abc123", subject: "hello world" },
    uncommittedChanges: 2,
  });

  assert.deepEqual(calls, [
    { file: "git", args: ["branch", "--show-current"] },
    { file: "git", args: ["log", "-1", "--format=%H%x00%s"] },
    { file: "git", args: ["status", "--porcelain"] },
  ]);
});

test("getGitInfo returns null branch when detached", async () => {
  const run = async (file, args) => {
    const key = `${file} ${args.join(" ")}`;
    if (key === "git branch --show-current") return { stdout: "\n" };
    if (key === "git log -1 --format=%H%x00%s") return { stdout: "deadbeef\0msg\n" };
    if (key === "git status --porcelain") return { stdout: "" };
    throw new Error(`unexpected command: ${key}`);
  };

  const info = await getGitInfo({ run });
  assert.deepEqual(info, {
    branch: null,
    lastCommit: { hash: "deadbeef", subject: "msg" },
    uncommittedChanges: 0,
  });
});

test("getGitInfo returns nulls when not in a git repository", async () => {
  const calls = [];
  const run = async (file, args) => {
    calls.push({ file, args });
    const err = new Error("fatal");
    err.stderr = "fatal: not a git repository (or any of the parent directories): .git\n";
    throw err;
  };

  const info = await getGitInfo({ run });
  assert.deepEqual(info, { branch: null, lastCommit: null, uncommittedChanges: null });
  assert.deepEqual(calls, [{ file: "git", args: ["branch", "--show-current"] }]);
});

