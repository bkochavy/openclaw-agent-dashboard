const test = require("node:test");
const assert = require("node:assert/strict");

const { captureTmuxPane, getTmuxPaneCwd } = require("../agent-dashboard/tmux");

test("captureTmuxPane calls tmux capture-pane and returns last N lines", async () => {
  const all = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
  const expected = all.slice(all.length - 30);

  const calls = [];
  const run = async (file, args) => {
    calls.push({ file, args });
    return { stdout: all.join("\n") + "\n" };
  };

  const lines = await captureTmuxPane("my-session", { socketPath: "/tmp/sock", run });
  assert.deepEqual(lines, expected);
  assert.deepEqual(calls, [
    {
      file: "tmux",
      args: ["-S", "/tmp/sock", "capture-pane", "-t", "my-session", "-p", "-S", "-30"],
    },
  ]);
});

test("captureTmuxPane returns [] when tmux server is not running", async () => {
  const run = async () => {
    const err = new Error("failed");
    err.stderr = "no server running";
    throw err;
  };

  const lines = await captureTmuxPane("my-session", { run });
  assert.deepEqual(lines, []);
});

test("captureTmuxPane throws TMUX_NO_TARGET when session does not exist", async () => {
  const run = async () => {
    const err = new Error("failed");
    err.stderr = "can't find session: my-session";
    throw err;
  };

  await assert.rejects(
    () => captureTmuxPane("my-session", { run }),
    (err) => Boolean(err && err.code === "TMUX_NO_TARGET"),
  );
});

test("getTmuxPaneCwd calls tmux display-message and returns cwd", async () => {
  const calls = [];
  const run = async (file, args) => {
    calls.push({ file, args });
    return { stdout: "/tmp/project\n" };
  };

  const cwd = await getTmuxPaneCwd("my-session", { socketPath: "/tmp/sock", run });
  assert.equal(cwd, "/tmp/project");
  assert.deepEqual(calls, [
    {
      file: "tmux",
      args: ["-S", "/tmp/sock", "display-message", "-p", "-t", "my-session", "#{pane_current_path}"],
    },
  ]);
});
