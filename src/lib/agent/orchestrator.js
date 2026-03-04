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
      this.history.push({ role: 'assistant', content });

      const reasoning = content.replace(/\{[\s\S]*?"tool"[\s\S]*?\}/g, '').trim();
      
      if (reasoning) {
        console.log(chalk.blue(`\n🐝 [Pollina]:`) + chalk.white(` ${reasoning}`));
      } else if (content.includes('"tool"')) {
        console.log(chalk.blue(`\n🐝 [Pollina]:`) + chalk.dim(` Preparing to execute automated task...`));
      }

      const action = this.parseAction(content);
      if (!action) break;

      process.stdout.write(chalk.yellow(`⚙️  [Action]: ${action.tool}... `));
      
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

    if (this.history[this.history.length - 1].role === 'system') {
      const summaryRes = await this.api.post('/v1/chat/completions', {
        model: this.config.roles.coder,
        messages: [
          ...this.history,
          { role: 'system', content: 'The task loop is complete. Provide a direct and friendly final summary of your achievements to the user. Do not use any more tools.' }
        ]
      });
      const finalMsg = summaryRes.data.choices[0].message.content;
      console.log(chalk.blue(`\n🐝 [Summary]:`) + chalk.white(` ${finalMsg}`));
      this.history.push({ role: 'assistant', content: finalMsg });
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

Instructions:
1. Always explain what you are doing clearly to the user.
2. If you need to act, use a JSON block: {"tool": "name", "server": "local|serverName", "args": {}}
3. If you have finished the user's request, provide a comprehensive summary and stop.`;
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

