/* eslint-env browser */

const POLL_MS = 10_000;
const STORAGE_KEY = "agent-dashboard-status-filters";
const DEFAULT_STATUS_FILTERS = { running: true, stalled: true, completed: true, error: true };
let activeCaptureSession = null;

function syncFilterChipForCheckbox(cb) {
  if (!cb || typeof cb.closest !== "function") return;
  const chip = cb.closest("label.filter-chip");
  if (!chip || !chip.classList) return;
  if (typeof chip.classList.toggle === "function") {
    chip.classList.toggle("is-checked", !!cb.checked);
    // Fallback styling hook for browsers that don't support :has().
    chip.classList.toggle("active", !!cb.checked);
  } else {
    if (cb.checked) {
      chip.classList.add?.("is-checked");
      chip.classList.add?.("active");
    } else {
      chip.classList.remove?.("is-checked");
      chip.classList.remove?.("active");
    }
  }
}

function getStatusFilters() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {}
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") return { ...DEFAULT_STATUS_FILTERS, ...parsed };
    } catch {}
  }
  return { ...DEFAULT_STATUS_FILTERS };
}

function saveStatusFilters(filters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {}
}

function restoreFilterCheckboxes() {
  const filters = getStatusFilters();
  document.querySelectorAll("#status-filters input[type=checkbox]").forEach((cb) => {
    cb.checked = filters[cb.value] !== false;
    syncFilterChipForCheckbox(cb);
  });
}

function readFilterCheckboxes() {
  const filters = {};
  document.querySelectorAll("#status-filters input[type=checkbox]").forEach((cb) => {
    filters[cb.value] = cb.checked;
  });
  return filters;
}

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el;
}

function escapeForAttr(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtRel(iso) {
  if (!iso) return "unknown";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "unknown";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function fmtDurationSince(iso) {
  if (!iso) return "unknown";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "unknown";
  let s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtClock(ms) {
  if (!Number.isFinite(ms)) return "unknown";
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatLastRefreshedLabel(ms) {
  return `Last refreshed: ${fmtClock(ms)}`;
}

function pillForStatus(status) {
  const st = String(status || "running").toLowerCase();
  const label = st === "error" ? "error" : st === "completed" ? "completed" : st === "stalled" ? "stalled" : "running";
  return `<span class="pill"><span class="pip ${label}" aria-hidden="true"></span>${label}</span>`;
}

function gitLine(git) {
  const g = git && typeof git === "object" ? git : null;
  const branch = g && g.branch ? String(g.branch) : "unknown";
  const uc = Number.isFinite(g && g.uncommittedChanges) ? g.uncommittedChanges : null;
  const dirty = uc === null ? "" : uc === 0 ? "clean" : `${uc} uncommitted`;
  let commit = "unknown";
  if (g && g.lastCommit && typeof g.lastCommit === "object") {
    const hash = g.lastCommit.hash ? String(g.lastCommit.hash).slice(0, 7) : "";
    const subj = g.lastCommit.subject ? String(g.lastCommit.subject) : "";
    commit = hash ? `${hash} ${subj}`.trim() : subj || "unknown";
  } else if (g && g.lastCommit) {
    commit = String(g.lastCommit);
  }
  return `${branch} • ${dirty} • ${commit}`;
}

function progressInfo(s) {
  const tp = s && s.taskProgress && typeof s.taskProgress === "object" ? s.taskProgress : null;
  const cur = tp && Number.isFinite(tp.current) ? tp.current : null;
  const tot = tp && Number.isFinite(tp.total) ? tp.total : null;
  if (!Number.isFinite(cur) || !Number.isFinite(tot) || tot <= 0) return null;
  const pct = Math.max(0, Math.min(100, Math.round((cur / tot) * 100)));
  const label = `${cur}/${tot} tasks`;
  const currentTask = tp && tp.currentTask ? String(tp.currentTask) : null;
  return { pct, label, currentTask };
}

function sessionSubtitle(s) {
  const bits = [];
  if (s && s.taskProgress && Number.isFinite(s.taskProgress.current) && Number.isFinite(s.taskProgress.total)) {
    bits.push(`Task ${s.taskProgress.current}/${s.taskProgress.total}`);
  } else if (Number.isFinite(s && s.stallCount) && s.stallCount > 0) {
    bits.push(`No change x${s.stallCount}`);
  } else {
    bits.push("No progress info");
  }
  if (s && s.lastSeenAt) bits.push(`Seen ${fmtRel(s.lastSeenAt)}`);
  return bits.join(" • ");
}

function updateSessionCount(count) {
  const badge = document.getElementById("session-count");
  if (badge) badge.textContent = String(count);
}

function renderEmptyState() {
  return `
    <section class="empty-state" aria-label="Empty state">
      <div class="empty-state-inner">
        <div class="empty-state-title">No active agent sessions</div>
        <div class="empty-state-sub">Start a tmux session to see it here.</div>
      </div>
    </section>
  `;
}

const STATUS_PRIORITY = { running: 0, stalled: 1, error: 2, completed: 3 };

function sortByStatus(a, b) {
  const sa = String((a && a.status) || "running").toLowerCase();
  const sb = String((b && b.status) || "running").toLowerCase();
  return (STATUS_PRIORITY[sa] ?? 4) - (STATUS_PRIORITY[sb] ?? 4);
}

function renderSessions(sessions, query, statusFilters) {
  const q = String(query || "").trim().toLowerCase();
  const sf = statusFilters || getStatusFilters();
  const all = Array.isArray(sessions) ? sessions : [];
  const filtered = all.filter((s) => {
    const name = String((s && s.name) || "").toLowerCase();
    const status = String((s && s.status) || "running").toLowerCase();
    return (!q || name.includes(q)) && sf[status] !== false;
  });
  filtered.sort(sortByStatus);

  if (all.length === 0) {
    return renderEmptyState();
  }

  if (filtered.length === 0) {
    return `<div class="card" data-name="__no-match__"><div class="name">No sessions</div><div class="meta">Nothing matched your filter.</div></div>`;
  }

  return filtered
    .map((s) => {
      const name = String((s && s.name) || "");
      const subtitle = sessionSubtitle(s);
      const status = pillForStatus(s && s.status);
      const prog = progressInfo(s);
      const lastLines = Array.isArray(s && s.lastLines) ? s.lastLines : [];
      // Drop empty/whitespace-only lines, then take the last 15.
      const meaningful = lastLines.filter((l) => (l == null ? "" : String(l)).trim().length > 0);
      const preview = meaningful.slice(Math.max(0, meaningful.length - 15));
      const term = preview.length
        ? preview.map((l, i) => `<span class="line-num">${i + 1}</span>${escapeHtml(l)}`).join("\n")
        : escapeHtml("(no output captured)");
      const duration = fmtDurationSince(s && s.created);
      const git = gitLine(s && s.git);
      const it = s && s.ralphInfo && Number.isFinite(s.ralphInfo.iteration) ? s.ralphInfo.iteration : null;
      const enc = encodeURIComponent(name);
      const statusClass = String((s && s.status) || "running").toLowerCase();
      return `
        <article class="card status-${statusClass}" data-name="${escapeForAttr(name)}">
          <div class="card-head">
            <div class="name" title="${escapeForAttr(name)}">${escapeHtml(name)}</div>
            ${status}
          </div>
          <div class="meta">${escapeHtml(subtitle)}</div>
          ${
            prog
              ? `<div class="progress" aria-label="${escapeForAttr(prog.label)}">
                   <div class="progress-top">
                     <div class="progress-label">${escapeHtml(prog.label)}</div>
                     <div class="progress-right">${escapeHtml(duration)}${it !== null ? ` • iter ${it}` : ""}</div>
                   </div>
                   <div class="bar" role="progressbar" aria-valuenow="${prog.pct}" aria-valuemin="0" aria-valuemax="100">
                     <span style="width:${prog.pct}%"></span>
                   </div>
                   ${prog.currentTask ? `<div class="task" title="${escapeForAttr(prog.currentTask)}">${escapeHtml(prog.currentTask)}</div>` : ""}
                 </div>`
              : `<div class="kv"><span class="k">Timing</span><span class="v">${escapeHtml(duration)}${it !== null ? ` • iter ${it}` : ""}</span></div>`
          }
          <div class="kv"><span class="k">Git</span><span class="v" title="${escapeForAttr(git)}">${escapeHtml(git)}</span></div>
          <pre class="term" aria-label="Terminal preview">${term}</pre>
          <div class="actions">
            <button class="link" type="button" data-action="capture" data-session="${escapeForAttr(enc)}">View capture</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function fetchJson(path) {
  const r = await fetch(path, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function loadGit() {
  try {
    const g = await fetchJson("/api/git");
    const branch = g && g.branch ? String(g.branch) : "unknown";
    const last = g && g.lastCommit && g.lastCommit.subject ? String(g.lastCommit.subject) : "unknown";
    const dirty = Number.isFinite(g && g.uncommittedChanges) ? g.uncommittedChanges : null;
    const dirtyText = dirty === null ? "" : dirty === 0 ? "clean" : `${dirty} uncommitted`;
    $("git").textContent = `${branch} • ${dirtyText} • ${last}`;
  } catch (e) {
    $("git").textContent = `Git unavailable: ${String(e && e.message ? e.message : e)}`;
  }
}

function reconcileGrid(grid, newHtml) {
  // Parse the new HTML into a temporary container
  const tmp = document.createElement("div");
  tmp.innerHTML = newHtml;
  const incoming = Array.from(tmp.children);

  // Build sets of data-name values for old and new cards
  const oldCards = Array.from(grid.querySelectorAll(".card[data-name], .empty-state"));
  const oldNames = new Set(oldCards.map((c) => c.getAttribute("data-name") || c.className));
  const newNames = new Set(incoming.map((c) => c.getAttribute("data-name") || c.className));

  // Fade out cards that are leaving
  const departing = oldCards.filter((c) => !newNames.has(c.getAttribute("data-name") || c.className));
  const fadeOutPromises = departing.map(
    (card) =>
      new Promise((resolve) => {
        card.classList.add("fade-out");
        card.addEventListener("animationend", () => {
          card.remove();
          resolve();
        }, { once: true });
        // Safety timeout in case animationend doesn't fire (e.g. prefers-reduced-motion)
        setTimeout(() => {
          if (card.parentNode) card.remove();
          resolve();
        }, 300);
      }),
  );

  // After departing cards are gone, add new ones with fade-in
  Promise.all(fadeOutPromises).then(() => {
    // Remove any remaining old cards that weren't already removed
    const remaining = Array.from(grid.querySelectorAll(".card[data-name], .empty-state"));
    const remainingNames = new Set(remaining.map((c) => c.getAttribute("data-name") || c.className));

    for (const el of incoming) {
      const key = el.getAttribute("data-name") || el.className;
      if (remainingNames.has(key)) {
        // Update existing card in place
        const old = remaining.find((c) => (c.getAttribute("data-name") || c.className) === key);
        if (old) {
          old.replaceWith(el);
        }
      } else {
        // New card — fade it in
        el.classList.add("fade-in");
        grid.appendChild(el);
      }
    }
  });
}

async function loadSessions() {
  const grid = $("sessions");
  const q = $("q").value;
  try {
    const sessions = await fetchJson("/api/sessions");
    const newHtml = renderSessions(sessions, q, readFilterCheckboxes());
    const hasOldCards = grid.querySelectorAll(".card[data-name], .empty-state").length > 0;
    if (hasOldCards) {
      reconcileGrid(grid, newHtml);
    } else {
      grid.innerHTML = newHtml;
      // Fade in all initial cards
      grid.querySelectorAll(".card, .empty-state").forEach((c) => c.classList.add("fade-in"));
    }
    updateSessionCount(Array.isArray(sessions) ? sessions.length : 0);
    const stamp = document.getElementById("last-refreshed");
    if (stamp) stamp.textContent = formatLastRefreshedLabel(Date.now());
  } catch (e) {
    grid.innerHTML = `<div class="card"><div class="name">Error</div><div class="meta">${String(
      e && e.message ? e.message : e,
    )}</div></div>`;
  }
}

function closeModal() {
  const backdrop = $("modal-backdrop");
  backdrop.hidden = true;
  $("capture").textContent = "";
  activeCaptureSession = null;
  const refreshBtn = document.getElementById("refresh-capture");
  if (refreshBtn) refreshBtn.disabled = true;
}

async function loadCapture(sessionName) {
  const backdrop = $("modal-backdrop");

  activeCaptureSession = sessionName;
  const refreshBtn = document.getElementById("refresh-capture");
  if (refreshBtn) refreshBtn.disabled = !activeCaptureSession;

  backdrop.hidden = false;
  $("panel-title").textContent = sessionName;
  $("capture").textContent = "Loading…";

  try {
    const data = await fetchJson(`/api/sessions/${encodeURIComponent(sessionName)}/capture`);
    const lines = Array.isArray(data && data.lines) ? data.lines : [];
    $("capture").textContent = lines.join("\n");
  } catch (e) {
    $("capture").textContent = `Error: ${String(e && e.message ? e.message : e)}`;
  }
}

function wireUi() {
  $("refresh").addEventListener("click", () => Promise.all([loadGit(), loadSessions()]));
  $("q").addEventListener("input", () => loadSessions());

  // Status filter checkboxes — restore from localStorage and wire change events
  restoreFilterCheckboxes();
  document.querySelectorAll("#status-filters input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      syncFilterChipForCheckbox(cb);
      saveStatusFilters(readFilterCheckboxes());
      loadSessions();
    });
  });

  const backdrop = $("modal-backdrop");
  const refreshBtn = document.getElementById("refresh-capture");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      if (!activeCaptureSession) return;
      loadCapture(activeCaptureSession);
    });
  }

  $("close").addEventListener("click", closeModal);

  // Close on backdrop click
  backdrop.addEventListener("click", (ev) => {
    if (ev.target !== ev.currentTarget) return;
    closeModal();
  });

  // Close on Escape
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !backdrop.hidden) closeModal();
  });

  $("sessions").addEventListener("click", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.action !== "capture") return;
    const enc = t.dataset.session || "";
    const name = decodeURIComponent(enc);
    loadCapture(name);
  });
}

async function boot() {
  wireUi();
  await Promise.all([loadGit(), loadSessions()]);

  window.setInterval(() => {
    loadSessions();
  }, POLL_MS);
}

globalThis.__agentDashboardExports = {
  renderSessions,
  fmtRel,
  fmtDurationSince,
  pillForStatus,
  sessionSubtitle,
  POLL_MS,
  formatLastRefreshedLabel,
  wireUi,
  loadCapture,
  updateSessionCount,
  reconcileGrid,
  sortByStatus,
};
if (!globalThis.__AGENT_DASHBOARD_NO_BOOT__) boot();
