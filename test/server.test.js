const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");
const { Writable } = require("node:stream");

const { createHandler } = require("../server");

function createMockRes() {
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

test("serves index.html from static dir", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-dashboard-"));
  await fsp.mkdir(path.join(dir, "public"), { recursive: true });
  await fsp.writeFile(path.join(dir, "public", "index.html"), "<h1>ok</h1>");

  const handler = createHandler({ staticDir: path.join(dir, "public") });
  const res = await runRequest(handler, { method: "GET", url: "/" });
  assert.equal(res.statusCode, 200);
  assert.match(res.getHeader("content-type") || "", /^text\/html\b/i);
  assert.equal(res.bodyText(), "<h1>ok</h1>");
});

test("GET /api/sessions returns JSON array", async () => {
  const handler = createHandler();
  const res = await runRequest(handler, { method: "GET", url: "/api/sessions" });
  assert.equal(res.statusCode, 200);
  assert.match(res.getHeader("content-type") || "", /^application\/json\b/i);
  assert.ok(Array.isArray(JSON.parse(res.bodyText())));
});

test("GET /api/git returns git info", async () => {
  const handler = createHandler({
    getGitInfo: async () => ({
      branch: "main",
      lastCommit: { hash: "abc123", subject: "hello" },
      uncommittedChanges: 1,
    }),
  });

  const res = await runRequest(handler, { method: "GET", url: "/api/git" });
  assert.equal(res.statusCode, 200);
  assert.match(res.getHeader("content-type") || "", /^application\/json\b/i);
  assert.deepEqual(JSON.parse(res.bodyText()), {
    branch: "main",
    lastCommit: { hash: "abc123", subject: "hello" },
    uncommittedChanges: 1,
  });
});

test("GET /api/sessions enriches sessions with status and stall tracking", async () => {
  let captureCalls = 0;
  const handler = createHandler({
    listSessions: async () => [{ name: "a", created: "2026-02-16T00:00:00.000Z" }],
    capturePane: async () => {
      captureCalls += 1;
      return ["working...", "step 1"];
    },
    stallThreshold: 3,
    getPaneCwd: async () => "/tmp/project",
    getGitInfoForCwd: async () => ({
      branch: "main",
      lastCommit: { hash: "abc123", subject: "hello" },
      uncommittedChanges: 1,
    }),
  });

  const res1 = await runRequest(handler, { method: "GET", url: "/api/sessions" });
  assert.equal(res1.statusCode, 200);
  const body1 = JSON.parse(res1.bodyText());
  assert.deepEqual(
    body1.map((s) => ({ name: s.name, status: s.status, stallCount: s.stallCount })),
    [{ name: "a", status: "running", stallCount: 0 }],
  );
  assert.equal(body1[0].created, "2026-02-16T00:00:00.000Z");
  assert.ok(Array.isArray(body1[0].lastLines));
  assert.deepEqual(body1[0].git, {
    branch: "main",
    lastCommit: { hash: "abc123", subject: "hello" },
    uncommittedChanges: 1,
  });
  assert.ok(body1[0].ralphInfo && Object.prototype.hasOwnProperty.call(body1[0].ralphInfo, "iteration"));
  assert.ok(body1[0].ralphInfo && Object.prototype.hasOwnProperty.call(body1[0].ralphInfo, "exitCode"));

  // Same output again increments stallCount but doesn't mark stalled until threshold is hit.
  const res2 = await runRequest(handler, { method: "GET", url: "/api/sessions" });
  const body2 = JSON.parse(res2.bodyText());
  assert.deepEqual(
    body2.map((s) => ({ name: s.name, status: s.status, stallCount: s.stallCount })),
    [{ name: "a", status: "running", stallCount: 1 }],
  );

  // After enough unchanged polls, status becomes stalled.
  await runRequest(handler, { method: "GET", url: "/api/sessions" }); // stallCount 2
  const res4 = await runRequest(handler, { method: "GET", url: "/api/sessions" }); // stallCount 3
  const body4 = JSON.parse(res4.bodyText());
  assert.deepEqual(
    body4.map((s) => ({ name: s.name, status: s.status, stallCount: s.stallCount })),
    [{ name: "a", status: "stalled", stallCount: 3 }],
  );

  assert.ok(captureCalls >= 4);
});

test("status detection prefers explicit exit codes (completed/error)", async () => {
  const handler = createHandler({
    listSessions: async () => [{ name: "ok" }, { name: "bad" }],
    capturePane: async (name) => {
      if (name === "ok") return ["done", "exit 0"];
      return ["boom", "exit 2"];
    },
  });

  const res = await runRequest(handler, { method: "GET", url: "/api/sessions" });
  const body = JSON.parse(res.bodyText());
  const byName = new Map(body.map((s) => [s.name, s]));

  assert.equal(byName.get("ok").status, "completed");
  assert.equal(byName.get("bad").status, "error");
});

test("strips ANSI sequences from tmux output before parsing and returning", async () => {
  const handler = createHandler({
    listSessions: async () => [{ name: "a" }],
    capturePane: async () => [
      "\u001b[32mTask 1/2\u001b[0m, 1 remaining",
      "\u001b]0;title\u0007",
      "\u001b[31mexit 0\u001b[0m",
    ],
  });

  const res = await runRequest(handler, { method: "GET", url: "/api/sessions" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.bodyText());
  assert.deepEqual(body[0].taskProgress, { current: 1, total: 2 });
  assert.equal(body[0].status, "completed");
  assert.ok(!/\x1b/.test(body[0].lastLines.join("\n")));
});

test("falls back to a deeper capture when the initial capture is only blank lines", async () => {
  const calls = { primary: 0, fallback: 0 };
  const handler = createHandler({
    listSessions: async () => [{ name: "a" }],
    capturePane: async () => {
      calls.primary += 1;
      return ["", "   ", "\t"];
    },
    capturePaneFallback: async () => {
      calls.fallback += 1;
      return ["older output", "hello"];
    },
  });

  const res = await runRequest(handler, { method: "GET", url: "/api/sessions" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.bodyText());
  assert.equal(body[0].name, "a");
  assert.ok(body[0].lastLines.join("\n").includes("hello"));
  assert.ok(calls.primary >= 1);
  assert.equal(calls.fallback, 1);

  const cap = await runRequest(handler, { method: "GET", url: "/api/sessions/a/capture" });
  assert.equal(cap.statusCode, 200);
  const capBody = JSON.parse(cap.bodyText());
  assert.ok(capBody.lines.join("\n").includes("hello"));
});

test("GET /api/sessions/:name/capture returns capture lines", async () => {
  const handler = createHandler({
    capturePane: async (name) => [`hello ${name}`, "line 2"],
  });
  const res = await runRequest(handler, { method: "GET", url: "/api/sessions/my-session/capture" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.bodyText()), {
    name: "my-session",
    lines: ["hello my-session", "line 2"],
  });
});

test("GET /api/sessions/:name/capture returns 404 when session missing", async () => {
  const handler = createHandler({
    capturePane: async () => {
      const e = new Error("missing");
      e.code = "TMUX_NO_TARGET";
      throw e;
    },
  });
  const res = await runRequest(handler, { method: "GET", url: "/api/sessions/nope/capture" });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(JSON.parse(res.bodyText()), { error: "Not Found" });
});

test("blocks path traversal attempts", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-dashboard-"));
  await fsp.mkdir(path.join(dir, "public"), { recursive: true });
  await fsp.writeFile(path.join(dir, "public", "index.html"), "ok");

  const handler = createHandler({ staticDir: path.join(dir, "public") });
  const res = await runRequest(handler, { method: "GET", url: "/..%2fPRD.md" });
  assert.equal(res.statusCode, 404);
});

test("GET /api/sessions parses task progress from Ralph output and checklist files", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-dashboard-"));
  const checklist = path.join(dir, "BUILD-CHECKLIST.md");
  await fsp.writeFile(checklist, ["- [x] one", "- [ ] two"].join("\n"));

  const handler = createHandler({
    listSessions: async () => [{ name: "a" }],
    capturePane: async () => [`PRD: ${checklist}`, "Task 3/10, 7 remaining"],
  });

  const res = await runRequest(handler, { method: "GET", url: "/api/sessions" });
  const body = JSON.parse(res.bodyText());
  assert.equal(body[0].taskProgressSource, "ralph");
  assert.deepEqual(body[0].taskProgress, { current: 3, total: 10 });
  assert.equal(body[0].checklistPath, checklist);
  assert.deepEqual(body[0].checklistProgress, { done: 1, total: 2 });
});

test("GET /api/sessions falls back to checklist progress when Ralph output has no task counters", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-dashboard-"));
  const checklist = path.join(dir, "PRD.md");
  await fsp.writeFile(checklist, ["- [x] one", "- [x] two", "- [ ] three"].join("\n"));

  const handler = createHandler({
    listSessions: async () => [{ name: "a" }],
    capturePane: async () => [`Checklist: ${checklist}`, "working..."],
  });

  const res = await runRequest(handler, { method: "GET", url: "/api/sessions" });
  const body = JSON.parse(res.bodyText());
  assert.equal(body[0].taskProgressSource, "checklist");
  assert.deepEqual(body[0].taskProgress, { current: 2, total: 3 });
  assert.equal(body[0].checklistPath, checklist);
  assert.deepEqual(body[0].checklistProgress, { done: 2, total: 3 });
});
