# openclaw-agent-dashboard

> See all your running AI coding agents in one place.

[screenshot placeholder]

A local web dashboard for monitoring OpenClaw/Ralph coding agent sessions in tmux.
No build step. No framework. Just Node.js + a single HTML file.

[![License: MIT][badge]]
[![OpenClaw][badge]]

## 👤 For Humans

**The problem:** You launch 3 Codex sessions in tmux and have no idea
which ones are running, which stalled, and which finished 20 minutes ago
without telling you.

**What this shows:**
- Every tmux session with a Ralph/Codex agent running
- Status: 🟢 running / 🟡 stalled / ✅ completed / ❌ error
- Task progress: "Task 4 of 8" from Ralph output
- PRD checklist progress: `12 / 47 tasks` from your PRD.md
- Git info: branch, last commit, uncommitted changes
- Full pane output on click

**Start:**
```bash
npx openclaw-agent-dashboard
# or
node server.js
```

Open http://localhost:7891

**Requirements:**
- tmux running with socket at `~/.tmux/sock`
- Node.js 18+

## 🤖 For Agents

To start the dashboard:
```bash
cd ~/.openclaw/workspace/skills/openclaw-agent-dashboard
node server.js &
```

API endpoints:
- `GET /api/sessions` — all sessions with status, progress, git info
- `GET /api/sessions/:name` — single session detail

Status values: `running` | `stalled` | `completed` | `error`

The dashboard reads `~/.tmux/sock`. If sessions use a different socket,
set `TMUX_SOCK` env var.

## Install

```bash
git clone https://github.com/bkochavy/openclaw-agent-dashboard.git \
  ~/.openclaw/workspace/skills/openclaw-agent-dashboard
```

Or tell your agent: "start the agent dashboard" and it will find and launch it.

## Requirements

| Tool | Required | Notes |
|------|----------|-------|
| `node` 18+ | yes | |
| `tmux` | yes | sessions must use `~/.tmux/sock` |
| Ralph/Codex running | no | dashboard works without sessions too |
