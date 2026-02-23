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
    for (const fn of arr) fn({ target: this });
  }
}

function loadExports(appSource, ctx) {
  vm.runInContext(appSource, ctx, { filename: "app.js" });
  return ctx.__agentDashboardExports;
}

test("refresh button in capture header re-fetches the active session capture", async () => {
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

  const fetchCalls = [];
  async function fetch(url) {
    fetchCalls.push(String(url));
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        if (String(url).startsWith("/api/sessions/") && String(url).endsWith("/capture")) {
          return { name: "demo", lines: ["one", "two"] };
        }
        if (String(url) === "/api/git") return { branch: "main", uncommittedChanges: 0, lastCommit: { subject: "x" } };
        if (String(url) === "/api/sessions") return [];
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
        const el = els[id];
        return el || null;
      },
      querySelector() { return null; },
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
    },
    fetch,
    console,
  });

  const ex = loadExports(appSource, ctx);

  // Matches the HTML: the capture refresh button starts disabled until a capture is loaded.
  els["refresh-capture"].disabled = true;
  ex.wireUi();

  // Load a capture to establish the active session and enable the refresh button.
  await ex.loadCapture("demo");
  assert.equal(els["modal-backdrop"].hidden, false);
  assert.equal(els["panel-title"].textContent, "demo");
  assert.equal(els["refresh-capture"].disabled, false);
  assert.match(els.capture.textContent, /one/);

  const before = fetchCalls.length;
  els["refresh-capture"].click();
  await new Promise((r) => setImmediate(r));
  assert.ok(fetchCalls.length > before);
  assert.equal(fetchCalls.filter((u) => u.includes("/api/sessions/demo/capture")).length, 2);

  // Close clears active session and disables refresh.
  els.close.click();
  assert.equal(els["modal-backdrop"].hidden, true);
  assert.equal(els["refresh-capture"].disabled, true);
});
