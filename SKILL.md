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
nohup node server.js >/tmp/openclaw-agent-dashboard.log 2>&1 &
echo $! >/tmp/openclaw-agent-dashboard.pid
until curl -fsS http://127.0.0.1:7891/api/sessions >/dev/null; do sleep 0.2; done
```

Dashboard available at: http://localhost:7891

## How to stop

```bash
if [ -f /tmp/openclaw-agent-dashboard.pid ]; then
  kill "$(cat /tmp/openclaw-agent-dashboard.pid)" && rm -f /tmp/openclaw-agent-dashboard.pid
fi
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
| `HOST` | `0.0.0.0` | Bind address |
| `TMUX_SOCK` | `~/.tmux/sock` | tmux socket path |

## API

`GET /api/sessions` — returns JSON array of all sessions
`GET /api/sessions/:name/capture` — returns full capture lines for one session
`GET /api/git` — returns branch/commit/uncommitted info for the dashboard repo
