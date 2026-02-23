---
name: openclaw-agent-dashboard
description: "Launch and manage the agent dashboard web UI. Use when: user wants to see all running coding agent sessions, check Ralph loop progress, see which agents stalled, or monitor tmux sessions. Dashboard runs at http://localhost:7891."
metadata: {"openclaw":{"emoji":"📊","requires":{"bins":["node"]}}}
---

# OpenClaw Agent Dashboard

Launch a local web dashboard to monitor all running tmux/Ralph coding sessions.

## How to start

```bash
cd {baseDir}
node server.js
```

Dashboard available at: http://localhost:7891

## How to stop

```bash
pkill -f "agent-dashboard/server.js"
```

## What it shows

- All tmux sessions with Ralph/Codex agents
- Status: running / stalled / completed / error
- Task progress from Ralph output + PRD checklist
- Git branch + last commit + uncommitted changes

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `PORT` | `7891` | HTTP port |
| `TMUX_SOCK` | `~/.tmux/sock` | tmux socket path |

## API

`GET /api/sessions` — returns JSON array of all sessions
