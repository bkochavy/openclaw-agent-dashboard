# openclaw-agent-dashboard
![openclaw-agent-dashboard](https://raw.githubusercontent.com/bkochavy/openclaw-agent-dashboard/main/.github/social-preview.png)


> Monitor your Codex and Claude Code tmux sessions in real time.

[screenshot placeholder]

A local web dashboard for watching tmux sessions running Codex or Claude Code.
See which sessions are running, which stalled, and which finished — at a glance.
No build step. No framework. Just Node.js + a single HTML file.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-compatible-orange)](https://openclaw.ai)

## 👤 For Humans

**The problem:** You launch 3 Codex sessions in tmux, walk away, and have no idea
which are still running, which stalled 20 minutes ago, and which finished while you
weren't looking.

**What this shows:**
- Every tmux session running Codex or Claude Code
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
