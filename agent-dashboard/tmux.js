const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

function execFilePromise(file, args, options) {
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

function splitLines(stdout) {
  const lines = String(stdout).split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function parseListSessions(stdout) {
  return String(stdout)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      // Preferred format: "#{session_name}|||#{session_created}" (epoch seconds)
      if (line.includes("|||")) {
        const [rawName, rawCreated] = line.split("|||");
        const name = String(rawName || "").trim();
        const createdEpoch = Number(String(rawCreated || "").trim());
        const created =
          Number.isFinite(createdEpoch) && createdEpoch > 0
            ? new Date(createdEpoch * 1000).toISOString()
            : null;
        return { name, created, raw: line };
      }

      // Fallback: default tmux output "name: ..."
      const idx = line.indexOf(":");
      const name = (idx === -1 ? line : line.slice(0, idx)).trim();
      return { name, created: null, raw: line };
    });
}

async function listTmuxSessions(options = {}) {
  const socketPath = options.socketPath || path.join(os.homedir(), ".tmux", "sock");
  const run =
    options.run ||
    ((file, args) =>
      execFilePromise(file, args, {
        timeout: 2_000,
        maxBuffer: 1024 * 1024,
      }));

  try {
    // Include created timestamp for session duration display.
    const { stdout } = await run("tmux", ["-S", socketPath, "list-sessions", "-F", "#{session_name}|||#{session_created}"]);
    return parseListSessions(stdout);
  } catch (err) {
    // Prefer an empty list when tmux isn't available or no server is running.
    const code = err && err.code;
    const stderr = String(err && err.stderr ? err.stderr : "");
    const message = String(err && err.message ? err.message : "");
    const combined = `${stderr}\n${message}`;

    if (code === "ENOENT") return [];
    if (/failed to connect to server/i.test(combined)) return [];
    if (/no server running/i.test(combined)) return [];

    throw err;
  }
}

async function captureTmuxPane(sessionName, options = {}) {
  if (!sessionName || typeof sessionName !== "string") {
    throw new TypeError("sessionName must be a non-empty string");
  }

  const maxLines = Number.isFinite(options.maxLines) ? options.maxLines : 30;
  const socketPath = options.socketPath || path.join(os.homedir(), ".tmux", "sock");
  const run =
    options.run ||
    ((file, args) =>
      execFilePromise(file, args, {
        timeout: 2_000,
        maxBuffer: 1024 * 1024,
      }));

  try {
    const { stdout } = await run("tmux", [
      "-S",
      socketPath,
      "capture-pane",
      "-t",
      sessionName,
      "-p",
      "-S",
      `-${maxLines}`,
    ]);

    const lines = splitLines(stdout);
    if (lines.length <= maxLines) return lines;
    return lines.slice(lines.length - maxLines);
  } catch (err) {
    // Prefer an empty capture when tmux isn't available or no server is running.
    const code = err && err.code;
    const stderr = String(err && err.stderr ? err.stderr : "");
    const message = String(err && err.message ? err.message : "");
    const combined = `${stderr}\n${message}`;

    if (code === "ENOENT") return [];
    if (/failed to connect to server/i.test(combined)) return [];
    if (/no server running/i.test(combined)) return [];

    if (/can't find (session|pane|window|target)/i.test(combined)) {
      const e = new Error(`tmux session not found: ${sessionName}`);
      e.code = "TMUX_NO_TARGET";
      throw e;
    }

    throw err;
  }
}

async function getTmuxPaneCwd(sessionName, options = {}) {
  if (!sessionName || typeof sessionName !== "string") {
    throw new TypeError("sessionName must be a non-empty string");
  }

  const socketPath = options.socketPath || path.join(os.homedir(), ".tmux", "sock");
  const run =
    options.run ||
    ((file, args) =>
      execFilePromise(file, args, {
        timeout: 2_000,
        maxBuffer: 1024 * 1024,
      }));

  try {
    const { stdout } = await run("tmux", ["-S", socketPath, "display-message", "-p", "-t", sessionName, "#{pane_current_path}"]);
    const cwd = String(stdout).trim();
    return cwd ? cwd : null;
  } catch (err) {
    const code = err && err.code;
    const stderr = String(err && err.stderr ? err.stderr : "");
    const message = String(err && err.message ? err.message : "");
    const combined = `${stderr}\n${message}`;

    if (code === "ENOENT") return null;
    if (/failed to connect to server/i.test(combined)) return null;
    if (/no server running/i.test(combined)) return null;

    if (/can't find (session|pane|window|target)/i.test(combined)) {
      const e = new Error(`tmux session not found: ${sessionName}`);
      e.code = "TMUX_NO_TARGET";
      throw e;
    }

    throw err;
  }
}

module.exports = { listTmuxSessions, parseListSessions, captureTmuxPane, getTmuxPaneCwd };
