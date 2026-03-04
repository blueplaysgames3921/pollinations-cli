# 🐝 Pollina Agent Configuration

```yaml
roles:
  architect: "mistral"
  coder: "qwen-coder"
  critic: "openai"
  artist: "flux"

constraints:
  - "Never delete the .git folder"
  - "Always use ESM (import/export) instead of CommonJS"
  - "Document every new function with JSDoc"

mcp_servers:
  - name: "google-search"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-google-search"]

context: "This is a CLI project for Pollinations.ai built in Node.js"

