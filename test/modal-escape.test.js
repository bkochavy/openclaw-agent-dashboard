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
    this.dispatch("click", { target: this });
  }

  dispatch(type, event = {}) {
    const arr = this._listeners.get(type) || [];
    const evt = { currentTarget: this, ...event };
    if (!Object.prototype.hasOwnProperty.call(evt, "target")) evt.target = this;
    for (const fn of arr) fn(evt);
  }
}

function loadExports(appSource, ctx) {
  vm.runInContext(appSource, ctx, { filename: "app.js" });
  return ctx.__agentDashboardExports;
}

test("Escape closes capture modal only when open", async () => {
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

  let onKeydown = null;
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
      addEventListener(type, fn) {
        if (type === "keydown") onKeydown = fn;
      },
      querySelectorAll() {
        return [];
      },
    },
    fetch() {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json() {
          return Promise.resolve({ name: "demo", lines: ["one", "two"] });
        },
      });
    },
    console,
  });

  const ex = loadExports(appSource, ctx);
  ex.wireUi();
  await ex.loadCapture("demo");

  assert.equal(typeof onKeydown, "function");
  assert.equal(els["modal-backdrop"].hidden, false);
  assert.equal(els["refresh-capture"].disabled, false);
  assert.match(els.capture.textContent, /one/);

  onKeydown({ key: "Enter" });
  assert.equal(els["modal-backdrop"].hidden, false);

  onKeydown({ key: "Escape" });
  assert.equal(els["modal-backdrop"].hidden, true);
  assert.equal(els["refresh-capture"].disabled, true);
  assert.equal(els.capture.textContent, "");
});

test("clicking backdrop closes capture modal", async () => {
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
    fetch() {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json() {
          return Promise.resolve({ name: "demo", lines: ["one", "two"] });
        },
      });
    },
    console,
  });

  const ex = loadExports(appSource, ctx);
  ex.wireUi();
  await ex.loadCapture("demo");

  const backdrop = els["modal-backdrop"];
  assert.equal(backdrop.hidden, false);
  backdrop.click();
  assert.equal(backdrop.hidden, true);
  assert.equal(els["refresh-capture"].disabled, true);
  assert.equal(els.capture.textContent, "");
});

test("clicking inside modal does not close capture modal", async () => {
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
    fetch() {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json() {
          return Promise.resolve({ name: "demo", lines: ["one", "two"] });
        },
      });
    },
    console,
  });

  const ex = loadExports(appSource, ctx);
  ex.wireUi();
  await ex.loadCapture("demo");

  const backdrop = els["modal-backdrop"];
  assert.equal(backdrop.hidden, false);
  backdrop.dispatch("click", { target: { id: "modal-content" } });
  assert.equal(backdrop.hidden, false);
});
