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

function isNotRepoError(err) {
  const stderr = String(err && err.stderr ? err.stderr : "");
  const message = String(err && err.message ? err.message : "");
  const combined = `${stderr}\n${message}`.toLowerCase();
  return combined.includes("not a git repository");
}

function splitNonEmptyLines(text) {
  return String(text)
    .split(/\r?\n/)
    .map((s) => s.trimEnd())
    .filter(Boolean);
}

async function getGitInfo(options = {}) {
  const cwd = options.cwd || process.cwd();
  const run =
    options.run ||
    ((file, args) =>
      execFilePromise(file, args, {
        cwd,
        timeout: 2_000,
        maxBuffer: 1024 * 1024,
      }));

  const out = { branch: null, lastCommit: null, uncommittedChanges: null };

  try {
    const { stdout } = await run("git", ["branch", "--show-current"]);
    const branch = String(stdout).trim();
    out.branch = branch ? branch : null;
  } catch (err) {
    if (!isNotRepoError(err)) throw err;
    return out;
  }

  try {
    const { stdout } = await run("git", ["log", "-1", "--format=%H%x00%s"]);
    const raw = String(stdout).trimEnd();
    if (raw) {
      const [hash, subject] = raw.split("\0");
      if (hash) out.lastCommit = { hash, subject: subject || "" };
    }
  } catch (err) {
    if (!isNotRepoError(err)) throw err;
  }

  try {
    const { stdout } = await run("git", ["status", "--porcelain"]);
    out.uncommittedChanges = splitNonEmptyLines(stdout).length;
  } catch (err) {
    if (!isNotRepoError(err)) throw err;
  }

  return out;
}

module.exports = { getGitInfo, isNotRepoError, splitNonEmptyLines };

