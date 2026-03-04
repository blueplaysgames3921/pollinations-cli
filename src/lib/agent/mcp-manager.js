import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPManager {
  constructor() {
    this.clients = new Map();
  }

  async connect(serverName, command, args = []) {
    try {
      const transport = new StdioClientTransport({ command, args });
      const client = new Client(
        { name: "pollina-agent", version: "1.1.1" },
        { capabilities: {} }
      );
      await client.connect(transport);
      this.clients.set(serverName, client);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getExternalTools() {
    const allTools = [];
    for (const [name, client] of this.clients) {
      const { tools } = await client.listTools();
      allTools.push(...tools.map(t => ({ ...t, server: name })));
    }
    return allTools;
  }

  async callMcp(server, tool, args) {
    const client = this.clients.get(server);
    if (!client) throw new Error(`MCP Server ${server} not connected`);
    const result = await client.callTool({ name: tool, arguments: args });
    return JSON.stringify(result.content);
  }
}

