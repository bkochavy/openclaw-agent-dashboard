const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fsp = require("node:fs/promises");
const vm = require("node:vm");

class FakeEl {
  constructor(id) {
    this.id = id;
    this.hidden = false;
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.dataset = {};
    this._listeners = new Map();
  }

  addEventListener(type, fn) {
    const arr = this._listeners.get(type) || [];
    arr.push(fn);
    this._listeners.set(type, arr);
  }

  click() {
    const arr = this._listeners.get("click") || [];
    for (const fn of arr) fn({ currentTarget: this, target: this });
  }
}

function loadExports(appSource, ctx) {
  vm.runInContext(appSource, ctx, { filename: "app.js" });
  return ctx.__agentDashboardExports;
}

test("modal refresh button updates capture content from latest fetch", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");

  const els = {
    refresh: new FakeEl("refresh"),
    q: new FakeEl("q"),
    sessions: new FakeEl("sessions"),
    "modal-backdrop": new FakeEl("modal-backdrop"),
    close: new FakeEl("close"),
    "refresh-capture": new FakeEl("refresh-capture"),
    "panel-title": new FakeEl("panel-title"),
    capture: new FakeEl("capture"),
    git: new FakeEl("git"),
    "last-refreshed": new FakeEl("last-refreshed"),
  };
  els["modal-backdrop"].hidden = true;

  let captureFetches = 0;
  async function fetch(url) {
    const u = String(url);
    if (u.startsWith("/api/sessions/") && u.endsWith("/capture")) {
      captureFetches += 1;
      const line = captureFetches === 1 ? "first snapshot" : "second snapshot";
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return { name: "demo", lines: [line] };
        },
      };
    }
    if (u === "/api/git") {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return { branch: "main", uncommittedChanges: 0, lastCommit: { subject: "x" } };
        },
      };
    }
    if (u === "/api/sessions") {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async json() {
          return [];
        },
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return {};
      },
    };
  }

  const ctx = vm.createContext({
    __AGENT_DASHBOARD_NO_BOOT__: true,
    window: { setInterval() {} },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    document: {
      getElementById(id) {
        return els[id] || null;
      },
      querySelector() {
        return null;
      },
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
    },
    fetch,
    console,
  });

  const ex = loadExports(appSource, ctx);
  ex.wireUi();

  await ex.loadCapture("demo");
  assert.equal(els["modal-backdrop"].hidden, false);
  assert.equal(els["refresh-capture"].disabled, false);
  assert.match(els.capture.textContent, /first snapshot/);

  els["refresh-capture"].click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(captureFetches, 2);
  assert.match(els.capture.textContent, /second snapshot/);
});
