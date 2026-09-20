---
name: browser-test
description: Live browser testing through the Claude-in-Chrome extension against the real logged-in Chrome session. Use for e2e verification of authenticated pages, Canvas/Fabric.js tools, React state and API calls. Trigger on 幫我測, 瀏覽器測試, browser test, live test.
argument-hint: [path|url]
---

Live browser testing via Chrome MCP (Claude-in-Chrome extension).

## Usage

```
/browser-test                        → test app.aware-wave.com (default smoke)
/browser-test <path>                 → test a specific path, e.g. /tools/canvas
/browser-test <full-url>             → test any URL
```

## What this does

Drives the user's real logged-in Chrome browser — no headless, no credentials needed.
Read the full methodology in `.claude/skills/browser-test/SKILL.md`.

## Steps

1. Load the Chrome tools in one `ToolSearch` call (they are deferred — an unloaded call fails), then call `mcp__claude-in-chrome__list_connected_browsers`
   → If empty: ask user to open Chrome and enable the Claude-in-Chrome extension
   → Server id is `claude-in-chrome`, lowercase with hyphens

2. Navigate to target URL

3. Read page, find elements, interact via Chrome MCP tools

4. Verify via `javascript_tool` (React state, Fabric.js canvas, DOM)

5. Check `read_network_requests` for correct API calls

6. Screenshot for evidence via `computer` with `action=screenshot` (there is no `screenshot` tool)

7. Report: flow results table + any bugs found + REALTEST_EVIDENCE line

## Default target

`https://app.aware-wave.com` — already logged in via user's Chrome session.
