# 🐝 Pollina Agent Configuration

Edit this file to configure Pollina's roles, constraints, researcher settings, and MCP servers.
Changes take effect the next time you run `pollinations assist`.

```yaml
roles:
  architect: "mistral"
  coder:     "qwen-coder"
  critic:    "openai"
  artist:    "flux"

researcher:
  model:   "gemini-search"
  enabled: true

constraints:
  - "Never delete the .git folder"
  - "Always use ESM (import/export) instead of CommonJS"
  - "Document every new function with JSDoc"
  - "Never hardcode API keys or secrets — use environment variables"
  - "Run npm install after modifying package.json dependencies"

mcp_servers:
  - name:    "pollinations"
    command: "npx"
    args:    ["-y", "@pollinations_ai/mcp"]

  # GitHub — create PRs, commit code, search issues
  # Set GITHUB_TOKEN in your shell environment before running
  # - name:    "github"
  #   command: "npx"
  #   args:    ["-y", "@modelcontextprotocol/server-github"]
  #   env:
  #     GITHUB_TOKEN: "${GITHUB_TOKEN}"

  # PostgreSQL — query and manage databases
  # - name:    "postgres"
  #   command: "npx"
  #   args:    ["-y", "@modelcontextprotocol/server-postgres"]
  #   env:
  #     POSTGRES_CONNECTION_STRING: "${POSTGRES_CONNECTION_STRING}"

  # Slack — send messages and read channels
  # - name:    "slack"
  #   command: "npx"
  #   args:    ["-y", "@modelcontextprotocol/server-slack"]
  #   env:
  #     SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}"
  #     SLACK_TEAM_ID:   "${SLACK_TEAM_ID}"

  # Filesystem — extended filesystem operations
  # - name:    "filesystem"
  #   command: "npx"
  #   args:    ["-y", "@modelcontextprotocol/server-filesystem", "."]

context: "This is the Pollinations CLI project. Node.js ESM, built on Pollinations.ai."
```
