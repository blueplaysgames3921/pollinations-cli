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

      // Improved Display Logic: Show Pollina's text, hide the JSON block
      const displayContent = content.split('{')[0].trim();
      if (displayContent) {
        console.log(chalk.blue(`\n🐝 [Pollina]:`) + chalk.white(` ${displayContent}`));
      }

      const action = this.parseAction(content);
      if (!action) break;

      // Internal Architect Delegation
      if (action.tool === 'consult_architect') {
        process.stdout.write(chalk.cyan(`🏗️  [Architect]: Analyzing project requirements... `));
        const plan = await this.callRole('architect', action.args.goal);
        console.log(chalk.green('Done.'));
        this.history.push({ role: 'system', content: `Technical Strategy Provided: ${plan}` });
        continue;
      }

      // Tool Execution
      process.stdout.write(chalk.yellow(`⚙️  [Action]: ${action.tool}... `));
      try {
        let result = (action.server === 'local') 
          ? await this.localTools.call(action.tool, action.args) 
          : await this.mcp.callMcp(action.server, action.tool, action.args);

        console.log(chalk.green('Done.'));
        
        // Pass observation back to history
        this.history.push({ role: 'system', content: `Observation: ${result}` });

        // Optional Critic Check for technical tasks
        if (this.config.roles.critic && action.tool !== 'generate_image') {
          const validation = await this.validateAction(action, result);
          this.history.push({ role: 'system', content: `Critic Feedback: ${validation}` });
        }
      } catch (err) {
        console.log(chalk.red('Failed.'));
        this.history.push({ role: 'system', content: `Error: ${err.message}` });
      }
    }
  }

  buildSystemPrompt(mcpTools) {
    const localToolList = this.localTools.getToolDefinitions().map(t => t.name);
    const mcpToolList = mcpTools.map(t => t.name);

    return `CORE IDENTITY:
You are Pollina, a chill, brilliant, and autonomous swarm agent. 
- Creator: blue (blueplaysgames3921 on GitHub).
- Infrastructure: Built on Pollinations.ai.
- Nature: You are NOT a generic model. You are the orchestrator of a swarm.

CONSTRAINTS & CONTEXT:
${this.config.context}
${this.config.constraints.join('\n')}

CAPABILITIES:
You have direct access to local system tools and MCP extensions.
Local Tools available: ${localToolList.join(', ')}
External Tools available: ${mcpToolList.join(', ')}

Available Tools (JSON Format):
${JSON.stringify([...this.localTools.getToolDefinitions(), ...mcpTools], null, 2)}

VIRTUAL TOOL:
- "consult_architect": Use this for high-level technical planning or complex logic.

RULES:
1. Speak as Pollina. Stay grounded and helpful. 
2. If you need to perform an action, append a single JSON block at the end of your message.
3. Format: {"tool": "name", "server": "local|serverName", "args": {}}
4. NEVER explain the infrastructure or mention model names (like Qwen/Mistral) to the user. You are simply Pollina.`;
  }

  async callRole(role, prompt) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles[role],
      messages: [
        { role: 'system', content: `You are the ${role} of the Pollina swarm. Provide technical expertise only.` }, 
        { role: 'user', content: prompt }
      ]
    });
    return res.data.choices[0].message.content;
  }

  parseAction(content) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (e) {
      // Return null if JSON is malformed so the loop can gracefully end or retry
      return null;
    }
  }

  async validateAction(action, result) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.critic,
      messages: [
        { role: 'system', content: 'Be a concise technical critic. Evaluate if the tool output is correct.' },
        { role: 'user', content: `Action: ${JSON.stringify(action)}\nResult: ${result}` }
      ]
    });
    return res.data.choices[0].message.content;
  }
}
