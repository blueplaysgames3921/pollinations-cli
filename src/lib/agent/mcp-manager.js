import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPManager {
  constructor() {
    this.clients = new Map();
  }

  _resolveEnvVars(envObj = {}) {
    const out = {};
    for (const [k, v] of Object.entries(envObj)) {
      out[k] = typeof v === 'string'
        ? v.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? '')
        : String(v);
    }
    return out;
  }

  async connect(serverName, command, args = [], env = {}) {
    try {
      const mergedEnv = { ...process.env, ...this._resolveEnvVars(env) };
      const transport = new StdioClientTransport({ command, args, env: mergedEnv });
      const client = new Client({ name: 'pollina-agent', version: '1.3.0' }, { capabilities: {} });
      await client.connect(transport);
      this.clients.set(serverName, client);
      return true;
    } catch {
      return false;
    }
  }

  async getExternalTools() {
    const all = [];
    for (const [name, client] of this.clients) {
      try {
        const { tools } = await client.listTools();
        all.push(...tools.map(t => ({ ...t, server: name })));
      } catch {
        // server may have disconnected
      }
    }
    return all;
  }

  async callMcp(server, tool, args) {
    const client = this.clients.get(server);
    if (!client) throw new Error(`MCP server '${server}' is not connected.`);
    const result = await client.callTool({ name: tool, arguments: args });
    return JSON.stringify(result.content);
  }

  isConnected(name) {
    return this.clients.has(name);
  }
}
