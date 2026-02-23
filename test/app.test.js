const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fsp = require("node:fs/promises");
const vm = require("node:vm");

function loadExportsFromAppJs(sourceText) {
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
      getElementById() {
        throw new Error("unexpected DOM access in tests");
      },
      querySelector() {
        return null;
      },
    },
    fetch() {
      throw new Error("unexpected fetch in tests");
    },
    console,
  });

  vm.runInContext(sourceText, ctx, { filename: "app.js" });
  return ctx.__agentDashboardExports;
}

function loadCtxFromAppJs(sourceText, overrides) {
  const ctx = vm.createContext({
    __AGENT_DASHBOARD_NO_BOOT__: true,
    window: { setInterval() {} },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    console,
    ...overrides,
  });
  vm.runInContext(sourceText, ctx, { filename: "app.js" });
  return ctx;
}

test("renderSessions includes status badge, progress bar, terminal preview, git info, timing", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const html = ex.renderSessions(
    [
      {
        name: "feature-build",
        status: "running",
        created: new Date(Date.now() - 62 * 60 * 1000).toISOString(),
        lastSeenAt: new Date().toISOString(),
        lastLines: ["a", "b", "c"],
        taskProgress: { current: 3, total: 8, currentTask: "Implement auth endpoint" },
        git: {
          branch: "feature/auth",
          lastCommit: { hash: "abc1234", subject: "Add auth middleware" },
          uncommittedChanges: 3,
        },
        ralphInfo: { iteration: 4, exitCode: null },
      },
    ],
    "",
  );

  assert.match(html, /class="card status-running"/);
  assert.match(html, /class="pill"/);
  assert.match(html, /class="bar"/);
  assert.match(html, /3\/8 tasks/);
  assert.match(html, /Implement auth endpoint/);
  assert.match(html, /class="term"/);
  assert.match(html, /feature\/auth/);
  assert.match(html, /3 uncommitted/);
  assert.match(html, /iter 4/);
});

test("renderSessions adds status class to card for each status", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const statuses = ["running", "completed", "stalled", "error"];
  for (const status of statuses) {
    const html = ex.renderSessions([{ name: `s-${status}`, status }], "");
    assert.match(html, new RegExp(`class="card status-${status}"`), `expected status-${status} class on card`);
  }
});

test("renderSessions shows empty state when there are no sessions", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const html = ex.renderSessions([], "");

  assert.match(html, /class="empty-state"/);
  assert.match(html, /No active agent sessions/);
});

function extractTerminalPreview(html) {
  const m = html.match(/<pre class="term"[^>]*>([\s\S]*?)<\/pre>/);
  assert.ok(m, "expected terminal preview <pre> to be present");
  return m[1];
}

function stripLineNumbers(termHtml) {
  return termHtml.replace(/<span class="line-num">\d+<\/span>/g, "");
}

test("renderSessions terminal preview drops whitespace-only lines and shows last 15 meaningful lines", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const meaningful = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
  const lastLines = meaningful.flatMap((l) => ["   ", l, "", "\t"]);

  const html = ex.renderSessions([{ name: "s1", lastLines }], "");
  const term = extractTerminalPreview(html);
  const text = stripLineNumbers(term);

  const expected = meaningful.slice(5).join("\n"); // last 15 lines => line6..line20
  assert.equal(text, expected);
});

test("renderSessions terminal preview shows placeholder when capture is only blank lines", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const html = ex.renderSessions([{ name: "s1", lastLines: ["", "   ", "\t"] }], "");
  const term = extractTerminalPreview(html);

  assert.equal(term, "(no output captured)");
});

test("terminal preview renders line numbers for each output line", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const html = ex.renderSessions([{ name: "s1", lastLines: ["hello", "world"] }], "");
  const term = extractTerminalPreview(html);

  assert.match(term, /<span class="line-num">1<\/span>hello/);
  assert.match(term, /<span class="line-num">2<\/span>world/);
});

test("terminal preview escapes HTML in line content but not in line-num spans", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const html = ex.renderSessions([{ name: "s1", lastLines: ["<script>alert(1)</script>"] }], "");
  const term = extractTerminalPreview(html);

  assert.match(term, /<span class="line-num">1<\/span>/);
  assert.doesNotMatch(term, /<script>/);
  assert.match(term, /&lt;script&gt;/);
});

test("polling is 10s and last-refreshed label is stable", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  assert.equal(ex.POLL_MS, 10_000);
  assert.match(ex.formatLastRefreshedLabel(0), /^Last refreshed:\s+\d{2}:\d{2}:\d{2}$/);
});

test("loadSessions passes status filters to renderSessions", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");

  const grid = { innerHTML: "", querySelectorAll() { return []; } };
  const q = { value: "" };
  const lastRefreshed = { textContent: "" };
  const sessionCount = { textContent: "0" };
  const checkboxes = [
    { value: "running", checked: true },
    { value: "completed", checked: false },
  ];

  const calls = [];
  const ctx = loadCtxFromAppJs(appSource, {
    document: {
      getElementById(id) {
        if (id === "sessions") return grid;
        if (id === "q") return q;
        if (id === "last-refreshed") return lastRefreshed;
        if (id === "session-count") return sessionCount;
        throw new Error(`unexpected getElementById(${id})`);
      },
      querySelector() {
        return null;
      },
      querySelectorAll(sel) {
        if (sel === "#status-filters input[type=checkbox]") return checkboxes;
        return [];
      },
    },
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve([{ name: "a", status: "running" }]);
        },
      });
    },
  });

  ctx.renderSessions = function renderSessionsStub(sessions, query, statusFilters) {
    calls.push({ sessions, query, statusFilters });
    return "ok";
  };

  await ctx.loadSessions();

  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0].statusFilters }, { running: true, completed: false });
  assert.equal(grid.innerHTML, "ok");
});

test("status filter localStorage save/restore cycle persists checkbox state", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");

  const store = new Map();
  const localStorage = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, v);
    },
  };

  const initialCheckboxes = [
    { value: "running", checked: true },
    { value: "stalled", checked: true },
    { value: "completed", checked: true },
    { value: "error", checked: true },
  ];

  const ctx1 = loadCtxFromAppJs(appSource, {
    localStorage,
    document: {
      querySelectorAll(sel) {
        if (sel === "#status-filters input[type=checkbox]") return initialCheckboxes;
        return [];
      },
    },
  });

  ctx1.restoreFilterCheckboxes();
  initialCheckboxes.find((c) => c.value === "completed").checked = false;
  ctx1.saveStatusFilters(ctx1.readFilterCheckboxes());

  const reloadedCheckboxes = [
    { value: "running", checked: true },
    { value: "stalled", checked: true },
    { value: "completed", checked: true },
    { value: "error", checked: true },
  ];

  const ctx2 = loadCtxFromAppJs(appSource, {
    localStorage,
    document: {
      querySelectorAll(sel) {
        if (sel === "#status-filters input[type=checkbox]") return reloadedCheckboxes;
        return [];
      },
    },
  });

  ctx2.restoreFilterCheckboxes();

  assert.equal(reloadedCheckboxes.find((c) => c.value === "running").checked, true);
  assert.equal(reloadedCheckboxes.find((c) => c.value === "stalled").checked, true);
  assert.equal(reloadedCheckboxes.find((c) => c.value === "completed").checked, false);
  assert.equal(reloadedCheckboxes.find((c) => c.value === "error").checked, true);
});

test("status filter persistence tolerates localStorage failures and invalid saved JSON", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");

  const ctx = loadCtxFromAppJs(appSource, {
    localStorage: {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    },
    document: {
      querySelectorAll() {
        return [{ value: "running", checked: true }];
      },
    },
  });

  assert.doesNotThrow(() => ctx.getStatusFilters());
  assert.doesNotThrow(() => ctx.saveStatusFilters({ running: false }));
  assert.doesNotThrow(() => ctx.restoreFilterCheckboxes());

  const store = new Map([["agent-dashboard-status-filters", "null"]]);
  const ctx2 = loadCtxFromAppJs(appSource, {
    localStorage: {
      getItem(k) {
        return store.get(k) ?? null;
      },
      setItem() {},
    },
    document: {
      querySelectorAll() {
        return [{ value: "running", checked: true }];
      },
    },
  });
  assert.doesNotThrow(() => ctx2.restoreFilterCheckboxes());
});

test("filter chip styling toggles via is-checked class on restore + change", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");

  class FakeClassList {
    constructor(initial = []) {
      this._set = new Set(initial);
    }
    add(name) {
      this._set.add(name);
    }
    remove(name) {
      this._set.delete(name);
    }
    toggle(name, force) {
      if (force === undefined) {
        const on = !this._set.has(name);
        if (on) this._set.add(name);
        else this._set.delete(name);
        return on;
      }
      if (force) this._set.add(name);
      else this._set.delete(name);
      return force;
    }
    contains(name) {
      return this._set.has(name);
    }
  }

  class FakeChip {
    constructor(status) {
      this.classList = new FakeClassList(["filter-chip", status]);
    }
  }

  class FakeCheckbox {
    constructor(value, chip) {
      this.value = value;
      this.checked = true;
      this._chip = chip;
      this._listeners = new Map();
    }
    closest(sel) {
      if (sel === "label.filter-chip") return this._chip;
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
  }

  const store = new Map([["agent-dashboard-status-filters", JSON.stringify({ completed: false })]]);
  const localStorage = {
    getItem(k) {
      return store.get(k) ?? null;
    },
    setItem(k, v) {
      store.set(k, v);
    },
  };

  const runningChip = new FakeChip("running");
  const stalledChip = new FakeChip("stalled");
  const completedChip = new FakeChip("completed");
  const errorChip = new FakeChip("error");
  const running = new FakeCheckbox("running", runningChip);
  const stalled = new FakeCheckbox("stalled", stalledChip);
  const completed = new FakeCheckbox("completed", completedChip);
  const error = new FakeCheckbox("error", errorChip);
  const checkboxes = [running, stalled, completed, error];

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

  const ctx = loadCtxFromAppJs(appSource, {
    localStorage,
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
    },
    fetch() {
      return Promise.resolve({
        ok: true,
        async json() {
          return [];
        },
      });
    },
  });

  const ex = ctx.__agentDashboardExports;
  ex.wireUi();

  assert.equal(running.checked, true);
  assert.equal(stalled.checked, true);
  assert.equal(completed.checked, false);
  assert.equal(error.checked, true);

  assert.equal(runningChip.classList.contains("is-checked"), true);
  assert.equal(stalledChip.classList.contains("is-checked"), true);
  assert.equal(completedChip.classList.contains("is-checked"), false);
  assert.equal(errorChip.classList.contains("is-checked"), true);

  // `.active` is a fallback hook for browsers that don't support `:has()`.
  assert.equal(runningChip.classList.contains("active"), true);
  assert.equal(stalledChip.classList.contains("active"), true);
  assert.equal(completedChip.classList.contains("active"), false);
  assert.equal(errorChip.classList.contains("active"), true);

  completed.checked = true;
  completed.dispatch("change");
  await new Promise((r) => setImmediate(r));
  assert.equal(completedChip.classList.contains("is-checked"), true);
  assert.equal(completedChip.classList.contains("active"), true);

  running.checked = false;
  running.dispatch("change");
  await new Promise((r) => setImmediate(r));
  assert.equal(runningChip.classList.contains("is-checked"), false);
  assert.equal(runningChip.classList.contains("active"), false);
});

test("reconcileGrid adds fade-out class to departing cards", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");

  // Minimal DOM mock for reconcileGrid
  class FakeClassList {
    constructor(initial = []) { this._set = new Set(initial); }
    add(n) { this._set.add(n); }
    remove(n) { this._set.delete(n); }
    contains(n) { return this._set.has(n); }
    toggle(n, f) { if (f) this._set.add(n); else this._set.delete(n); return f; }
  }

  class FakeElement {
    constructor(tag, attrs = {}, classes = []) {
      this.tagName = tag;
      this._attrs = new Map(Object.entries(attrs));
      this.classList = new FakeClassList(classes);
      this.children = [];
      this.innerHTML = "";
      this.parentNode = null;
      this._listeners = new Map();
    }
    getAttribute(k) { return this._attrs.get(k) ?? null; }
    setAttribute(k, v) { this._attrs.set(k, v); }
    get className() { return Array.from(this.classList._set).join(" "); }
    querySelectorAll(sel) {
      // Simple matcher for ".card[data-name], .empty-state"
      return this.children.filter((c) =>
        (c.classList.contains("card") && c._attrs.has("data-name")) ||
        c.classList.contains("empty-state")
      );
    }
    appendChild(el) { el.parentNode = this; this.children.push(el); }
    remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
    replaceWith(el) {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx >= 0) { this.parentNode.children[idx] = el; el.parentNode = this.parentNode; }
        this.parentNode = null;
      }
    }
    addEventListener(type, fn, opts) {
      const arr = this._listeners.get(type) || [];
      arr.push(fn);
      this._listeners.set(type, arr);
    }
    dispatchEvent(type) {
      const arr = this._listeners.get(type) || [];
      for (const fn of arr) fn();
    }
  }

  const cardA = new FakeElement("article", { "data-name": "session-a" }, ["card", "status-running"]);
  const cardB = new FakeElement("article", { "data-name": "session-b" }, ["card", "status-completed"]);
  cardA.parentNode = { children: [] }; // dummy
  cardB.parentNode = { children: [] };

  const grid = new FakeElement("section", {}, ["grid"]);
  grid.children = [cardA, cardB];
  cardA.parentNode = grid;
  cardB.parentNode = grid;

  // New HTML only contains session-a (session-b should fade out)
  const newHtml = '<article class="card status-running" data-name="session-a"><div class="name">A</div></article>';

  // Mock document.createElement to parse newHtml
  const incomingEl = new FakeElement("article", { "data-name": "session-a" }, ["card", "status-running"]);

  const ctx = loadCtxFromAppJs(appSource, {
    setTimeout,
    document: {
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() {
        return {
          innerHTML: "",
          children: [incomingEl],
          set innerHTML(v) {
            // parsed from newHtml
          },
          get children() { return [incomingEl]; },
        };
      },
    },
  });

  ctx.__agentDashboardExports.reconcileGrid(grid, newHtml);

  // cardB should have fade-out class
  assert.equal(cardB.classList.contains("fade-out"), true);
  // cardA should NOT have fade-out
  assert.equal(cardA.classList.contains("fade-out"), false);

  // Wait for safety timeout to resolve to avoid async leaks
  await new Promise((r) => setTimeout(r, 350));
});

test("reconcileGrid adds fade-in class to new arriving cards", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");

  class FakeClassList {
    constructor(initial = []) { this._set = new Set(initial); }
    add(n) { this._set.add(n); }
    remove(n) { this._set.delete(n); }
    contains(n) { return this._set.has(n); }
    toggle(n, f) { if (f) this._set.add(n); else this._set.delete(n); return f; }
  }

  class FakeElement {
    constructor(tag, attrs = {}, classes = []) {
      this.tagName = tag;
      this._attrs = new Map(Object.entries(attrs));
      this.classList = new FakeClassList(classes);
      this.children = [];
      this.parentNode = null;
      this._listeners = new Map();
    }
    getAttribute(k) { return this._attrs.get(k) ?? null; }
    setAttribute(k, v) { this._attrs.set(k, v); }
    get className() { return Array.from(this.classList._set).join(" "); }
    querySelectorAll() {
      return this.children.filter((c) =>
        (c.classList.contains("card") && c._attrs.has("data-name")) ||
        c.classList.contains("empty-state")
      );
    }
    appendChild(el) { el.parentNode = this; this.children.push(el); }
    remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; } }
    replaceWith(el) {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx >= 0) { this.parentNode.children[idx] = el; el.parentNode = this.parentNode; }
        this.parentNode = null;
      }
    }
    addEventListener(type, fn, opts) {
      const arr = this._listeners.get(type) || [];
      arr.push(fn);
      this._listeners.set(type, arr);
    }
    dispatchEvent(type) {
      const arr = this._listeners.get(type) || [];
      for (const fn of arr) fn();
    }
  }

  // Grid starts empty (no cards with data-name)
  const grid = new FakeElement("section", {}, ["grid"]);

  // Incoming card
  const newCard = new FakeElement("article", { "data-name": "session-x" }, ["card", "status-running"]);

  const ctx = loadCtxFromAppJs(appSource, {
    setTimeout,
    document: {
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() {
        return {
          set innerHTML(v) {},
          get children() { return [newCard]; },
        };
      },
    },
  });

  ctx.__agentDashboardExports.reconcileGrid(grid, "irrelevant");

  // No departing cards, so Promise.all resolves immediately
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(newCard.classList.contains("fade-in"), true);
  assert.equal(grid.children.length, 1);
  assert.equal(grid.children[0], newCard);
});

test("sortByStatus orders running > stalled > error > completed", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const sessions = [
    { name: "d", status: "completed" },
    { name: "a", status: "running" },
    { name: "c", status: "error" },
    { name: "b", status: "stalled" },
  ];
  const sorted = [...sessions].sort(ex.sortByStatus);
  assert.deepEqual(sorted.map((s) => s.status), ["running", "stalled", "error", "completed"]);
});

test("sortByStatus treats missing status as running", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const sessions = [
    { name: "c", status: "completed" },
    { name: "a" },
    { name: "b", status: "stalled" },
  ];
  const sorted = [...sessions].sort(ex.sortByStatus);
  assert.equal(sorted[0].name, "a"); // missing status treated as running (priority 0)
  assert.equal(sorted[1].name, "b"); // stalled (priority 1)
  assert.equal(sorted[2].name, "c"); // completed (priority 3)
});

test("renderSessions returns cards sorted by status priority", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const sessions = [
    { name: "completed-task", status: "completed" },
    { name: "running-task", status: "running" },
    { name: "error-task", status: "error" },
    { name: "stalled-task", status: "stalled" },
  ];
  const html = ex.renderSessions(sessions, "");

  const nameOrder = [...html.matchAll(/data-name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(nameOrder, ["running-task", "stalled-task", "error-task", "completed-task"]);
});

test("renderSessions no-match card has data-name attribute for reconciliation", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const html = ex.renderSessions(
    [{ name: "a", status: "running" }],
    "",
    { running: false, stalled: false, completed: false, error: false },
  );

  assert.match(html, /data-name="__no-match__"/);
  assert.match(html, /No sessions/);
});

test("running session progress bar is inside status-running card for shimmer targeting", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const html = ex.renderSessions(
    [
      {
        name: "shimmer-test",
        status: "running",
        taskProgress: { current: 2, total: 5 },
      },
    ],
    "",
  );

  // The card must have status-running class AND contain a .bar element
  assert.match(html, /class="card status-running"/);
  assert.match(html, /class="bar"/);
  // Verify the bar span is present (the shimmer ::after target)
  assert.match(html, /<span style="width:\d+%"><\/span>/);
});

test("completed session progress bar is inside status-completed card (no shimmer)", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");
  const ex = loadExportsFromAppJs(appSource);

  const html = ex.renderSessions(
    [
      {
        name: "done-test",
        status: "completed",
        taskProgress: { current: 5, total: 5 },
      },
    ],
    "",
  );

  assert.match(html, /class="card status-completed"/);
  assert.match(html, /class="bar"/);
  // No status-running class on this card
  assert.doesNotMatch(html, /class="card status-running"/);
});

test("loadCapture opens the capture modal and renders output", async () => {
  const appPath = path.join(__dirname, "..", "public", "app.js");
  const appSource = await fsp.readFile(appPath, "utf8");

  const modalBackdrop = { hidden: true };
  const panelTitle = { textContent: "" };
  const capture = { textContent: "" };
  const refreshBtn = { disabled: true };

  const ctx = loadCtxFromAppJs(appSource, {
    document: {
      getElementById(id) {
        if (id === "modal-backdrop") return modalBackdrop;
        if (id === "panel-title") return panelTitle;
        if (id === "capture") return capture;
        if (id === "refresh-capture") return refreshBtn;
        return null;
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    fetch() {
      return Promise.resolve({
        ok: true,
        json() { return Promise.resolve({ lines: ["hello"] }); },
      });
    },
  });

  await ctx.__agentDashboardExports.loadCapture("test-session");

  assert.equal(modalBackdrop.hidden, false, "capture modal should be visible");
  assert.equal(panelTitle.textContent, "test-session");
  assert.equal(refreshBtn.disabled, false);
  assert.equal(capture.textContent, "hello");
});

test("CSS contains barShimmer animation scoped to running cards", async () => {
  const cssPath = path.join(__dirname, "..", "public", "styles.css");
  const css = await fsp.readFile(cssPath, "utf8");

  // The shimmer animation keyframes must exist
  assert.match(css, /@keyframes barShimmer/);
  // The shimmer pseudo-element must be scoped to status-running cards
  assert.match(css, /\.card\.status-running\s+\.bar\s*>\s*span::after/);
  // prefers-reduced-motion must disable the animation
  assert.match(css, /prefers-reduced-motion[\s\S]*?\.card\.status-running\s+\.bar\s*>\s*span::after[\s\S]*?animation:\s*none/);
});
