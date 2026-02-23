# openclaw-agent-dashboard

![openclaw-agent-dashboard](https://raw.githubusercontent.com/bkochavy/openclaw-agent-dashboard/main/.github/social-preview.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-compatible-orange)](https://openclaw.ai)

You kick off five Codex sessions in tmux, step away for coffee, and come back to... which ones finished? Which ones have been stuck for 20 minutes? Which ones errored out silently?

**openclaw-agent-dashboard** is a zero-dependency local web dashboard that monitors your tmux sessions running [Codex](https://github.com/openai/codex) or [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Built for the [OpenClaw](https://openclaw.ai) ecosystem.

## Quick Start

```bash
git clone https://github.com/bkochavy/openclaw-agent-dashboard.git && node openclaw-agent-dashboard/server.js
```

Open **http://localhost:7891** -- that's it. No build step, no framework, no npm install.

## What You See

Each tmux session gets a card showing:

| Element | What it tells you |
|---|---|
| **Status indicator** | Is this session running, stalled, done, or broken? |
| **Task progress** | `4/8 tasks` parsed from agent output or your PRD checklist |
| **Git info** | Branch, last commit hash + message, uncommitted change count |
| **Terminal preview** | Last 15 meaningful lines of output, right on the card |
| **Timing** | How long the session has been running |
| **Full capture** | Click "View capture" to see the complete pane output |

### Status Indicators

| Status | Meaning |
|---|---|
| **Running** | Output is actively changing between polls (every 10s) |
| **Stalled** | Output hasn't changed for 3 consecutive polls (~30s) |
| **Completed** | Agent printed a completion message or exited with code 0 |
| **Error** | Agent hit an error, exception, or exited with a non-zero code |

### Reading the Dashboard

The top bar shows your git branch and a session count badge. Use the **search box** to filter sessions by name, or toggle the **status filter chips** (Running / Stalled / Completed / Error) to focus on what matters. Filter preferences persist across refreshes.

Cards are sorted by urgency: running sessions first, then stalled, errors, and completed last. The terminal preview on each card gives you enough context to decide whether to intervene -- click through for the full output.

## 👤 For Humans

**Requirements:**
- Node.js 18+
- tmux with sessions at `~/.tmux/sock` (or set `TMUX_SOCK`)

**Run it:**

```bash
node server.js
```

**Configuration:**

| Env var | Default | Description |
|---|---|---|
| `PORT` | `7891` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `TMUX_SOCK` | `~/.tmux/sock` | tmux socket path |

The dashboard works even with zero active sessions -- it'll show an empty state and pick up sessions as they start.

## 🤖 For Agents

You are an AI coding agent. Here is everything you need to launch and use the dashboard.

**Start the dashboard:**

```bash
cd ~/.openclaw/workspace/skills/openclaw-agent-dashboard && node server.js &
```

**Stop the dashboard:**

```bash
pkill -f "openclaw-agent-dashboard/server.js"
```

**API:**

| Endpoint | Returns |
|---|---|
| `GET /api/sessions` | JSON array -- all sessions with status, progress, git info, last output lines |
| `GET /api/sessions/:name/capture` | JSON `{ name, lines }` -- full pane capture for one session |
| `GET /api/git` | JSON -- git branch, last commit, uncommitted changes for the dashboard repo |

**Status values:** `running` | `stalled` | `completed` | `error`

**Session object shape:**

```json
{
  "name": "session-name",
  "status": "running",
  "stallCount": 0,
  "taskProgress": { "current": 4, "total": 8 },
  "git": { "branch": "main", "lastCommit": { "hash": "abc1234", "subject": "..." }, "uncommittedChanges": 2 },
  "lastLines": ["..."],
  "ralphInfo": { "iteration": 3, "exitCode": null },
  "checklistProgress": { "done": 12, "total": 47 }
}
```

The dashboard reads tmux socket at `~/.tmux/sock`. Override with `TMUX_SOCK` env var. Polls every 10 seconds. A session is marked "stalled" after 3 polls (~30s) with no output change.

## Install

```bash
git clone https://github.com/bkochavy/openclaw-agent-dashboard.git \
  ~/.openclaw/workspace/skills/openclaw-agent-dashboard
```

Or run directly with npx:

```bash
npx openclaw-agent-dashboard
```

## License

[MIT](LICENSE)
