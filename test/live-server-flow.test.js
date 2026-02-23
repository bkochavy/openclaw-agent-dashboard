const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { Writable } = require("node:stream");
const fsp = require("node:fs/promises");
const vm = require("node:vm");

const { createHandler } = require("../server");

class FakeCheckbox {
  constructor(value) {
    this.value = value;
    this.checked = true;
    this._listeners = new Map();
  }

  // app.js calls this for styling hooks; we don't need visual behavior in this test.
  closest() {
    return null;
  }

  addEventListener(type, fn) {
    const arr = this._listeners.get(type) || [];
    arr.push(fn);
    this._listeners.set(type, arr);
  }

  dispatch(type) {
    const arr = this._listeners.get(type) || [];
    for (const fn of arr) fn({ target: this });
  }
}

class FakeEl {
  constructor(id) {
    this.id = id;
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
    this._listeners = new Map();
  }

  addEventListener(type, fn) {
    const arr = this._listeners.get(type) || [];
    arr.push(fn);
    this._listeners.set(type, arr);
  }

  querySelectorAll() {
    return [];
  }
}

function createLocalStorage() {
  const store = new Map();
  return {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    _store: store,
  };
}

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

test("live server flow: reload + toggle status filters + sessions appear/disappear", async () => {
  const state = {
    sessions: [],
    captures: new Map(),
  };

  const staticDir = await fsp.mkdtemp(path.join(os.tmpdir(), "agent-dashboard-live-"));
  await fsp.mkdir(path.join(staticDir, "public"), { recursive: true });
  await fsp.cp(path.join(__dirname, "..", "public"), path.join(staticDir, "public"), { recursive: true });

  const handler = createHandler({
    staticDir: path.join(staticDir, "public"),
    listSessions: async () => state.sessions,
    capturePane: async (name) => state.captures.get(String(name)) || [],
    getPaneCwd: async () => "/tmp/project",
    getGitInfoForCwd: async () => ({
      branch: "main",
      lastCommit: { hash: "abc123", subject: "hello" },
      uncommittedChanges: 0,
    }),
  });

  async function runRequest(req) {
    const res = createMockRes();
    const done = new Promise((resolve) => res.once("finish", resolve));
    await handler(req, res);
    await done;
    return res;
  }

  try {
    const appSource = await fsp.readFile(path.join(staticDir, "public", "app.js"), "utf8");

    const localStorage = createLocalStorage();
    const els = {
      refresh: new FakeEl("refresh"),
      q: new FakeEl("q"),
      sessions: new FakeEl("sessions"),
      "last-refreshed": new FakeEl("last-refreshed"),
      "modal-backdrop": new FakeEl("modal-backdrop"),
      close: new FakeEl("close"),
      "refresh-capture": new FakeEl("refresh-capture"),
      "panel-title": new FakeEl("panel-title"),
      capture: new FakeEl("capture"),
    };

    const runningCb = new FakeCheckbox("running");
    const stalledCb = new FakeCheckbox("stalled");
    const completedCb = new FakeCheckbox("completed");
    const errorCb = new FakeCheckbox("error");
    const checkboxes = [runningCb, stalledCb, completedCb, errorCb];

    const ctx = vm.createContext({
      __AGENT_DASHBOARD_NO_BOOT__: true,
      window: { setInterval() {} },
      localStorage,
      setTimeout,
      document: {
        getElementById(id) {
          return els[id] || null;
        },
        querySelector() {
          return null;
        },
        addEventListener() {},
        querySelectorAll(sel) {
          if (sel === "#status-filters input[type=checkbox]") return checkboxes;
          return [];
        },
        createElement() {
          return { set innerHTML(v) {}, get children() { return []; } };
        },
      },
      fetch(url, opts) {
        void opts;
        return runRequest({ method: "GET", url: String(url) }).then((res) => ({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: String(res.statusCode),
          async json() {
            return JSON.parse(res.bodyText());
          },
          async text() {
            return res.bodyText();
          },
        }));
      },
      console,
    });

    vm.runInContext(appSource, ctx, { filename: "app.js" });
    const ex = ctx.__agentDashboardExports;

    // Seed live server with sessions.
    state.sessions = [{ name: "alpha" }, { name: "bravo" }];
    state.captures.set("alpha", ["working...", "step 1"]);
    state.captures.set("bravo", ["done", "exit 0"]);

    ex.wireUi();
    await ctx.loadSessions();
    assert.match(els.sessions.innerHTML, /alpha/);
    assert.match(els.sessions.innerHTML, /bravo/);

    // Toggle a status filter off and ensure the corresponding session disappears.
    completedCb.checked = false;
    completedCb.dispatch("change");
    await new Promise((r) => setImmediate(r));
    assert.match(els.sessions.innerHTML, /alpha/);
    assert.doesNotMatch(els.sessions.innerHTML, /bravo/);

    // Simulate sessions disappearing on the live server and ensure the UI updates.
    state.sessions = [];
    await ctx.loadSessions();
    assert.match(els.sessions.innerHTML, /No active agent sessions/);

    // Session appears again.
    state.sessions = [{ name: "alpha" }];
    await ctx.loadSessions();
    assert.match(els.sessions.innerHTML, /alpha/);

    // Reload page: new JS context, same localStorage; completed should remain unchecked and filtering should apply.
    const els2 = {
      refresh: new FakeEl("refresh"),
      q: new FakeEl("q"),
      sessions: new FakeEl("sessions"),
      "last-refreshed": new FakeEl("last-refreshed"),
      "modal-backdrop": new FakeEl("modal-backdrop"),
      close: new FakeEl("close"),
      "refresh-capture": new FakeEl("refresh-capture"),
      "panel-title": new FakeEl("panel-title"),
      capture: new FakeEl("capture"),
    };
    const r2 = new FakeCheckbox("running");
    const s2 = new FakeCheckbox("stalled");
    const c2 = new FakeCheckbox("completed");
    const e2 = new FakeCheckbox("error");

    const ctx2 = vm.createContext({
      __AGENT_DASHBOARD_NO_BOOT__: true,
      window: { setInterval() {} },
      localStorage,
      setTimeout,
      document: {
        getElementById(id) {
          return els2[id] || null;
        },
        querySelector() {
          return null;
        },
        addEventListener() {},
        querySelectorAll(sel) {
          if (sel === "#status-filters input[type=checkbox]") return [r2, s2, c2, e2];
          return [];
        },
        createElement() {
          return { set innerHTML(v) {}, get children() { return []; } };
        },
      },
      fetch(url, opts) {
        void opts;
        return runRequest({ method: "GET", url: String(url) }).then((res) => ({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: String(res.statusCode),
          async json() {
            return JSON.parse(res.bodyText());
          },
          async text() {
            return res.bodyText();
          },
        }));
      },
      console,
    });

    vm.runInContext(appSource, ctx2, { filename: "app.js" });
    const ex2 = ctx2.__agentDashboardExports;
    ex2.wireUi();

    state.sessions = [{ name: "alpha" }, { name: "bravo" }];
    await ctx2.loadSessions();
    assert.equal(c2.checked, false);
    assert.match(els2.sessions.innerHTML, /alpha/);
    assert.doesNotMatch(els2.sessions.innerHTML, /bravo/);
  } finally {
    await fsp.rm(staticDir, { recursive: true, force: true });
  }
});
