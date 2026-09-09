# Exponential MCP

[![npm version](https://img.shields.io/npm/v/exponential-mcp.svg)](https://www.npmjs.com/package/exponential-mcp)

Connect Claude to your [Exponential](https://exponential.im) workspace. Manage projects, actions, and OKRs directly from Claude.

## Quick Start

### 1. Create an API Key

Go to [exponential.im/settings/api-keys](https://www.exponential.im/settings/api-keys) and create a new key:
- Click **Create API Key**
- Select **JWT Token** as the token type
- Copy the generated key

### 2. Set Up the MCP Server

```bash
npx exponential-mcp init
```

Paste your API key when prompted.

### 3. Configure for Your Claude Client

**For Claude Desktop:**
- `exponential-mcp init` will automatically configure Claude Desktop
- Restart Claude Desktop

**For Claude Code (VSCode Extension):**
- The server uses `.mcp.json` in your project directory
- Reload your VSCode window (`Cmd+Shift+P` → "Developer: Reload Window")
- The server will be available in your current project

### 4. Ask Claude to manage your tasks!

## What Claude Can Do

Once connected, Claude can:

- **List projects** – "What projects am I working on?"
- **View actions** – "Show my active tasks"
- **Create actions** – "Add a task to call John tomorrow"
- **Complete actions** – "Mark the report task as done"
- **View OKRs** – "What are my Q1 goals?"
- **Search** – "Find anything related to Kenya"

## Manual Setup

### For Claude Desktop

**macOS (recommended path):** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Legacy path:** `~/.claude/claude_desktop_config.json`

Add this to the appropriate file:

```json
{
  "mcpServers": {
    "exponential": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/exponential-mcp/dist/index.js"]
    }
  }
}
```

### For Claude Code (VSCode Extension)

Create a `.mcp.json` file in your project directory:

```json
{
  "mcpServers": {
    "exponential": {
      "command": "npx",
      "args": ["-y", "exponential-mcp", "serve"]
    }
  }
}
```

Then reload your VSCode window.

**Note:** The API key is stored in the Exponential SDK config store (created by `npx exponential-mcp init`), so you don't need to specify it in the MCP configuration. Run `exponential-mcp config` to see the current storage path and values. Run `exponential-mcp doctor` to print a recommended MCP config snippet for your machine.

## Commands

```bash
# Initialize with your API key
exponential-mcp init

# Show current config
exponential-mcp config

# Diagnose local setup
exponential-mcp doctor

# Start server manually (usually not needed)
exponential-mcp serve
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_workspaces` | List all workspaces |
| `get_projects` | List projects (optionally by workspace) |
| `get_project` | One project in full: linked objectives & key results, DRI, team, dates |
| `update_project` | Rename, change status/priority, set dates, re-link to OKRs |
| `get_actions` | List actions/tasks (filter by project or status; no date filtering) |
| `get_todays_actions` | **What's on your plate now** — overdue / today / inbox, across all workspaces |
| `get_overdue_triage` | Why the overdue pile is that size: bulk-created cohorts vs real debt |
| `create_action` | Create a new task (supports natural language) |
| `update_action` | Rename, re-prioritise, move project, or set dates (incl. `scheduledStart`) |
| `defer_actions` | Amnesty: clear dates, back to the project backlog untimed |
| `reschedule_actions` | Move actions to a new do-date |
| `complete_action` | Mark an action as done |
| `get_goals` | List objectives, flat or as the annual → quarterly tree |
| `get_key_results` | List key results, grouped by objective or flat |
| `get_meetings` | List meetings, newest first, with a summary preview (no notes/transcript) |
| `get_meeting` | One meeting with notes; transcript on request |
| `create_meeting` | Record a meeting from a transcript or notes |
| `update_meeting` | Edit title, description, summary, date, or replace notes |
| `append_meeting_notes` | Add to a meeting's notes without overwriting them |
| `search` | Search across everything |

### Asking about the day

Use **`get_todays_actions`**, not `get_actions`, for anything about today,
priorities, or what the user is behind on. `get_actions` has no date filtering
at all, so it cannot distinguish overdue work from anything else.

When there is a lot of overdue work, follow up with **`get_overdue_triage`**
before proposing what to do. A large overdue count is usually a few bulk writes
— a generated project plan stamped every row with one timestamp — not a large
number of missed commitments. Those are **cohorts**, and the honest disposition
is `defer_actions` (amnesty); `reschedule_actions` would just re-inflict the
same pile tomorrow. Individually-dated **loose** actions are the ones that
deserve a real decision.

## Development

```bash
# Clone the repo
git clone https://github.com/your-org/exponential-mcp
cd exponential-mcp

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start
```

## License

MIT
