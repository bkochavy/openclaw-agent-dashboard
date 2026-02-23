#!/usr/bin/env node

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { listTmuxSessions, captureTmuxPane, getTmuxPaneCwd } = require("./agent-dashboard/tmux");
const { getGitInfo } = require("./agent-dashboard/git");
const {
  parseRalphTaskProgress,
  extractChecklistPathFromLines,
  parseChecklistProgress,
  isPathAllowed,
  defaultChecklistRoots,
} = require("./agent-dashboard/progress");

function stripAnsi(s) {
  const str = String(s || "");
  // Strip common ANSI escape sequences (CSI + OSC). tmux captures often include these.
  return str
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

function extractExitCodeFromLines(lines) {
  const text = Array.isArray(lines) ? lines.join("\n") : "";
  const exitMatch = text.match(/\bexit\s+(-?\d+)\b/i);
  if (!exitMatch) return null;
  const code = Number(exitMatch[1]);
  return Number.isFinite(code) ? code : null;
}

function parseRalphIterationFromLines(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const line = stripAnsi(arr[i]);
    let m = line.match(/\biteration\s+(\d+)\b/i);
    if (!m) m = line.match(/\bretry\s+#?\s*(\d+)\b/i);
    if (!m) m = line.match(/\battempt\s+(\d+)\b/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function inferSessionStatusFromLines(lines) {
  const text = Array.isArray(lines) ? lines.join("\n") : "";

  // Prefer explicit exit codes when present.
  const code = extractExitCodeFromLines(lines);
  if (Number.isFinite(code)) return code === 0 ? "completed" : "error";

  // Heuristics as fallback when no exit code is present.
  if (/\bcompleted\b/i.test(text) || /\bfinished\b/i.test(text) || /✅/.test(text)) return "completed";
  if (/\b(error|failed|exception|traceback)\b/i.test(text)) return "error";

  return "running";
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function sendJson(res, statusCode, value) {
  const body = JSON.stringify(value);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(text);
}

async function serveStatic(req, res, staticDir) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD");
    return res.end();
  }

  const base = path.resolve(staticDir);
  let pathname;
  try {
    // URL parsing requires an absolute base.
    const u = new URL(req.url, "http://localhost");
    pathname = decodeURIComponent(u.pathname);
  } catch {
    return sendText(res, 400, "Bad Request");
  }

  if (pathname.includes("\0")) return sendText(res, 400, "Bad Request");
  if (pathname === "/") pathname = "/index.html";

  const candidate = path.resolve(base, "." + pathname);
  const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;
  if (!(candidate + path.sep).startsWith(baseWithSep)) return sendText(res, 404, "Not Found");

  let st;
  try {
    st = await fsp.stat(candidate);
  } catch {
    return sendText(res, 404, "Not Found");
  }
  if (!st.isFile()) return sendText(res, 404, "Not Found");

  res.statusCode = 200;
  res.setHeader("content-type", contentTypeFor(candidate));
  res.setHeader("x-content-type-options", "nosniff");

  if (path.extname(candidate).toLowerCase() === ".html") {
    res.setHeader("cache-control", "no-store");
  } else {
    res.setHeader("cache-control", "public, max-age=3600");
  }

  if (req.method === "HEAD") return res.end();

  const stream = fs.createReadStream(candidate);
  stream.on("error", () => {
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
  stream.pipe(res);
}

function createHandler(options = {}) {
  const staticDir = options.staticDir || path.join(__dirname, "public");
  const listSessions = options.listSessions || (async () => []);
  const capturePane = options.capturePane || (async () => []);
  const capturePaneFallback = options.capturePaneFallback || null;
  const gitInfo = options.getGitInfo || (() => getGitInfo({ cwd: __dirname }));
  const getPaneCwd = options.getPaneCwd || (async () => null);
  const getGitInfoForCwd = options.getGitInfoForCwd || ((cwd) => getGitInfo({ cwd }));
  const stallThreshold = Number.isFinite(options.stallThreshold) ? options.stallThreshold : 3;
  const checklistRoots = options.checklistRoots || defaultChecklistRoots();
  const checklistSearchDirs = Array.isArray(options.checklistSearchDirs)
    ? options.checklistSearchDirs
    : [path.resolve(__dirname, ".."), process.cwd()];

  // In-memory stall tracking. Keyed by session name.
  // State lives for the lifetime of this handler/server process.
  const stallState = new Map();

  function isMeaningfulLine(line) {
    return (line == null ? "" : String(line)).trim().length > 0;
  }

  async function captureLines(name) {
    const captured = await capturePane(name);
    const lines = Array.isArray(captured) ? captured.map(stripAnsi) : [];
    const meaningful = lines.some(isMeaningfulLine);
    if (meaningful) return lines;

    if (capturePaneFallback && lines.length > 0) {
      try {
        const captured2 = await capturePaneFallback(name);
        const lines2 = Array.isArray(captured2) ? captured2.map(stripAnsi) : [];
        if (lines2.some(isMeaningfulLine)) return lines2;
      } catch {
        // Fall back to the original capture on transient errors.
      }
    }

    return lines;
  }

  return async (req, res) => {
    try {
      const u = new URL(req.url, "http://localhost");
      const pathname = u.pathname;

      if (pathname.startsWith("/api/")) {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("allow", "GET");
          return res.end();
        }

        if (pathname === "/api/git") {
          const info = await gitInfo();
          return sendJson(res, 200, info);
        }

        if (pathname === "/api/sessions") {
          const now = Date.now();
          const sessions = await listSessions();
          const seen = new Set();

          const enriched = await Promise.all(
            sessions.map(async (s) => {
              const name = s && s.name ? String(s.name) : "";
              seen.add(name);

              const lines = await captureLines(name);
              const signature = lines.join("\n");
              const prev = stallState.get(name);

              let stallCount = 0;
              let lastChangeAt = now;
              if (prev) {
                stallCount = prev.stallCount || 0;
                lastChangeAt = prev.lastChangeAt || now;
              }

              if (prev && prev.signature === signature) {
                stallCount += 1;
              } else {
                stallCount = 0;
                lastChangeAt = now;
              }

              const baseStatus = inferSessionStatusFromLines(lines);
              const status =
                baseStatus === "running" && stallCount >= stallThreshold ? "stalled" : baseStatus;

              const ralphProgress = parseRalphTaskProgress(lines);
              const exitCode = extractExitCodeFromLines(lines);
              const iteration = parseRalphIterationFromLines(lines);

              const checklistPath = extractChecklistPathFromLines(lines, { searchDirs: checklistSearchDirs });
              let checklistProgress = null;
              if (checklistPath && isPathAllowed(checklistPath, checklistRoots)) {
                try {
                  const md = await fsp.readFile(checklistPath, "utf8");
                  checklistProgress = parseChecklistProgress(md);
                } catch {
                  checklistProgress = null;
                }
              }

              let taskProgress = null;
              let taskProgressSource = null;
              if (ralphProgress) {
                taskProgress = ralphProgress;
                taskProgressSource = "ralph";
              } else if (checklistProgress) {
                taskProgress = { current: checklistProgress.done, total: checklistProgress.total };
                taskProgressSource = "checklist";
              }

              let cwd = null;
              try {
                cwd = await getPaneCwd(name);
              } catch {
                cwd = null;
              }

              let git = { branch: null, lastCommit: null, uncommittedChanges: null };
              if (cwd) {
                try {
                  git = await getGitInfoForCwd(cwd);
                } catch {
                  git = { branch: null, lastCommit: null, uncommittedChanges: null };
                }
              }

              stallState.set(name, {
                signature,
                stallCount,
                lastChangeAt,
                lastSeenAt: now,
              });

              return {
                ...s,
                created: s && s.created ? s.created : null,
                status,
                stallCount,
                lastChangeAt: new Date(lastChangeAt).toISOString(),
                lastSeenAt: new Date(now).toISOString(),
                lastLines: lines,
                taskProgress,
                taskProgressSource,
                git,
                ralphInfo: { iteration, exitCode },
                checklistPath: checklistPath && isPathAllowed(checklistPath, checklistRoots) ? checklistPath : null,
                checklistProgress,
              };
            }),
          );

          // Prune state for sessions that no longer exist.
          for (const key of stallState.keys()) {
            if (!seen.has(key)) stallState.delete(key);
          }

          return sendJson(res, 200, enriched);
        }

        if (pathname.startsWith("/api/sessions/") && pathname.endsWith("/capture")) {
          const prefix = "/api/sessions/";
          const suffix = "/capture";
          const encoded = pathname.slice(prefix.length, pathname.length - suffix.length);
          if (!encoded) return sendJson(res, 400, { error: "Missing session name" });

          let sessionName;
          try {
            sessionName = decodeURIComponent(encoded);
          } catch {
            return sendText(res, 400, "Bad Request");
          }

          try {
            const lines = await captureLines(sessionName);
            return sendJson(res, 200, { name: sessionName, lines });
          } catch (err) {
            if (err && err.code === "TMUX_NO_TARGET") return sendJson(res, 404, { error: "Not Found" });
            throw err;
          }
        }

        return sendJson(res, 404, { error: "Not Found" });
      }

      await serveStatic(req, res, staticDir);
    } catch (err) {
      // Avoid leaking internal errors to clients.
      if (!res.headersSent) sendText(res, 500, "Internal Server Error");
      else res.end();
      // Still log in server logs for debugging.
      console.error(err);
    }
  };
}

function createServer(options = {}) {
  return http.createServer(createHandler(options));
}

function start(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 7891);
  const host = String(options.host ?? process.env.HOST ?? "0.0.0.0");
  const staticDir = options.staticDir || path.join(__dirname, "public");

  const captureMaxLines = Number.isFinite(options.captureMaxLines) ? options.captureMaxLines : 200;
  const captureFallbackMaxLines = Number.isFinite(options.captureFallbackMaxLines) ? options.captureFallbackMaxLines : 2000;

  const server = createServer({
    staticDir,
    listSessions: () => listTmuxSessions(),
    capturePane: (name) => captureTmuxPane(name, { maxLines: captureMaxLines }),
    capturePaneFallback: (name) => captureTmuxPane(name, { maxLines: captureFallbackMaxLines }),
    getPaneCwd: (name) => getTmuxPaneCwd(name),
  });
  server.listen(port, host, () => {
    console.log(`agent-dashboard listening on http://${host}:${port}`);
  });
  return server;
}

if (require.main === module) start();

module.exports = { createHandler, createServer, start };
