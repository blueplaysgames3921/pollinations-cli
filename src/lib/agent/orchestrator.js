import chalk from 'chalk';
import { getApi } from '../api.js';
import { ToolManager } from './tool-manager.js';
import { MCPManager } from './mcp-manager.js';

export class AgentOrchestrator {
  constructor(config) {
    this.config = config;
    this.api = getApi();
    this.localTools = new ToolManager();
    this.mcp = new MCPManager();
    this.history = [];
    this.maxIterations = 10;
  }

  async init() {
    if (this.config.mcp_servers) {
      for (const srv of this.config.mcp_servers) {
        await this.mcp.connect(srv.name, srv.command, srv.args);
      }
    }
  }

  async run(userInput) {
    this.history.push({ role: 'user', content: userInput });
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;
      
      const mcpTools = await this.mcp.getExternalTools();
      const systemPrompt = this.buildSystemPrompt(mcpTools);
      
      const response = await this.api.post('/v1/chat/completions', {
        model: this.config.roles.coder,
        messages: [{ role: 'system', content: systemPrompt }, ...this.history]
      });

      const content = response.data.choices[0].message.content;
      console.log(chalk.blue(`\n🐝 [Thought]:`) + chalk.white(` ${content}`));
      this.history.push({ role: 'assistant', content });

      const action = this.parseAction(content);
      if (!action) break;

      process.stdout.write(chalk.yellow(`⚙️  [Executing]: ${action.tool}... `));
      
      try {
        let result;
        if (action.server === 'local') {
          result = await this.localTools.call(action.tool, action.args);
        } else {
          result = await this.mcp.callMcp(action.server, action.tool, action.args);
        }

        console.log(chalk.green('Done.'));
        
        if (this.config.roles.critic) {
          const validation = await this.validateAction(action, result);
          this.history.push({ role: 'system', content: `Observation: ${result}\nCritic Feedback: ${validation}` });
          console.log(chalk.magenta(`🧐 [Critic]:`) + chalk.dim(` ${validation}`));
        } else {
          this.history.push({ role: 'system', content: `Observation: ${result}` });
        }

      } catch (err) {
        console.log(chalk.red('Failed.'));
        this.history.push({ role: 'system', content: `Error: ${err.message}` });
      }
    }
    
    console.log(chalk.bold.green('\n✔ Task finalized.'));
  }

  buildSystemPrompt(mcpTools) {
    return `You are Pollina, an autonomous swarm agent.
Roles: ${JSON.stringify(this.config.roles)}
Context: ${this.config.context}
Rules: ${this.config.constraints.join(', ')}

Local Tools: ${JSON.stringify(this.localTools.getToolDefinitions())}
MCP Tools: ${JSON.stringify(mcpTools)}

Respond in two parts:
1. Reasoning: Explain what you are doing.
2. Action: Use a JSON block to call a tool.
Format: {"tool": "name", "server": "local|serverName", "args": {}}
If you are done, do not provide a JSON block.`;
  }

  async validateAction(action, result) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.critic,
      messages: [
        { role: 'system', content: 'You are a technical critic. Evaluate if the tool output is correct for the intended task. Be concise.' },
        { role: 'user', content: `Action: ${JSON.stringify(action)}\nResult: ${result}` }
      ]
    });
    return res.data.choices[0].message.content;
  }

  parseAction(content) {
    const jsonMatch = content.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      return null;
    }
  }
}
