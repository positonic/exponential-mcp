# Exponential MCP

Connect Claude to your [Exponential](https://exponential.im) workspace. Manage projects, actions, and OKRs directly from Claude Desktop.

## Quick Start

```bash
# 1. Get your API key from exponential.im/settings/api-keys

# 2. Set up the MCP server
npx exponential-mcp init

# 3. Restart Claude Desktop

# 4. Ask Claude to manage your tasks!
```

## What Claude Can Do

Once connected, Claude can:

- **List projects** – "What projects am I working on?"
- **View actions** – "Show my active tasks"
- **Create actions** – "Add a task to call John tomorrow"
- **Complete actions** – "Mark the report task as done"
- **View OKRs** – "What are my Q1 goals?"
- **Search** – "Find anything related to Kenya"

## Manual Setup

If the automatic setup doesn't work, add this to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "exponential": {
      "command": "npx",
      "args": ["exponential-mcp", "serve"],
      "env": {
        "EXPONENTIAL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Commands

```bash
# Initialize with your API key
exponential-mcp init

# Show current config
exponential-mcp config

# Start server manually (usually not needed)
exponential-mcp serve
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_workspaces` | List all workspaces |
| `get_projects` | List projects (optionally by workspace) |
| `get_actions` | List actions/tasks (filter by project or status) |
| `create_action` | Create a new task (supports natural language) |
| `complete_action` | Mark an action as done |
| `get_goals` | List OKRs with progress |
| `search` | Search across everything |

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
