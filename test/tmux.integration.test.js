const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");
const { execFile } = require("node:child_process");

const { createHandler } = require("../server");
const { listTmuxSessions, captureTmuxPane, getTmuxPaneCwd } = require("../agent-dashboard/tmux");

function execFilePromise(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function hasTmux() {
  try {
    await execFilePromise("tmux", ["-V"], { timeout: 2_000 });
    return true;
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    // If tmux exists but -V fails for some reason, treat as unavailable.
    return false;
  }
}

function createMockRes() {
  const { Writable } = require("node:stream");
  const headers = new Map();
  const chunks = [];

  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });

  res.statusCode = 200;
  res.headersSent = false;
  res.setHeader = (k, v) => headers.set(String(k).toLowerCase(), String(v));
  res.getHeader = (k) => headers.get(String(k).toLowerCase());
  res.end = (chunk) => {
    if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    res.headersSent = true;
    res.emit("finish");
  };
  res.bodyText = () => Buffer.concat(chunks).toString("utf8");
  return res;
}

async function runRequest(handler, req) {
  const res = createMockRes();
  const done = new Promise((resolve) => res.once("finish", resolve));
  await handler(req, res);
  await done;
  return res;
}

test("real tmux socket: /api/sessions renders expected fields from a live tmux session", async (t) => {
  if (!(await hasTmux())) {
    t.skip("tmux not available on PATH");
    return;
  }

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-dashboard-tmux-"));
  const socketPath = path.join(dir, "sock");
  const sessionName = `agent-dashboard-test-${Date.now()}`;

  // A tiny script that prints colored markers (exercise ANSI stripping), then stays alive for capture.
  const script = [
    "printf '\\033[32mTask 1/2\\033[0m, 1 remaining\\n'",
    "printf '\\033[35miteration 7\\033[0m\\n'",
    "printf '\\033[31mexit 0\\033[0m\\n'",
    "exec sleep 60",
  ].join("; ");

  try {
    try {
      await execFilePromise("tmux", ["-S", socketPath, "start-server"], { timeout: 5_000 });
    } catch (err) {
      const msg = String((err && err.stderr) || err || "");
      if (/operation not permitted/i.test(msg)) {
        t.skip("tmux socket operations are not permitted in this environment");
        return;
      }
      throw err;
    }

    // Some sandboxed environments allow running tmux but disallow creating/connecting to sockets.
    // Probe connectivity up front and skip if we can't talk to the socket.
    try {
      await execFilePromise("tmux", ["-S", socketPath, "list-sessions"], { timeout: 5_000 });
    } catch (err) {
      const msg = String((err && err.stderr) || err || "");
      if (
        /operation not permitted/i.test(msg) ||
        /error (creating|connecting)/i.test(msg) ||
        /no such file or directory/i.test(msg)
      ) {
        t.skip("tmux socket not usable in this environment");
        return;
      }
      throw err;
    }

    await execFilePromise(
      "tmux",
      ["-S", socketPath, "new-session", "-d", "-s", sessionName, "-c", dir, "sh", "-lc", script],
      { timeout: 5_000 },
    );

    const handler = createHandler({
      listSessions: () => listTmuxSessions({ socketPath }),
      capturePane: (name) => captureTmuxPane(name, { socketPath, maxLines: 40 }),
      getPaneCwd: (name) => getTmuxPaneCwd(name, { socketPath }),
      // Avoid coupling this test to git availability/config.
      getGitInfoForCwd: async () => ({ branch: null, lastCommit: null, uncommittedChanges: null }),
    });

    // Wait briefly for the shell to print the lines before we capture.
    let body = null;
    for (let i = 0; i < 20; i += 1) {
      const res = await runRequest(handler, { method: "GET", url: "/api/sessions" });
      assert.equal(res.statusCode, 200);
      const sessions = JSON.parse(res.bodyText());
      const s = sessions.find((x) => x && x.name === sessionName);
      if (s && Array.isArray(s.lastLines) && s.lastLines.join("\n").includes("Task 1/2")) {
        body = s;
        break;
      }
      await delay(100);
    }

    assert.ok(body, "expected session to appear with captured output");
    assert.equal(body.name, sessionName);
    assert.ok(body.created && Number.isFinite(Date.parse(body.created)), "expected ISO created timestamp");
    assert.equal(body.status, "completed");
    assert.deepEqual(body.taskProgress, { current: 1, total: 2 });
    assert.equal(body.ralphInfo.iteration, 7);
    assert.equal(body.ralphInfo.exitCode, 0);
    assert.equal(body.git && body.git.branch, null);
    assert.ok(body.lastLines.every((l) => !/\x1b/.test(String(l))), "expected ANSI stripped from lastLines");

    const cap = await runRequest(handler, { method: "GET", url: `/api/sessions/${encodeURIComponent(sessionName)}/capture` });
    assert.equal(cap.statusCode, 200);
    const capBody = JSON.parse(cap.bodyText());
    assert.equal(capBody.name, sessionName);
    assert.ok(Array.isArray(capBody.lines));
    assert.ok(capBody.lines.join("\n").includes("Task 1/2"));
    assert.ok(!/\x1b/.test(capBody.lines.join("\n")), "expected ANSI stripped from capture");
  } finally {
    try {
      await execFilePromise("tmux", ["-S", socketPath, "kill-server"], { timeout: 5_000 });
    } catch {
      // ignore
    }
  }
});
