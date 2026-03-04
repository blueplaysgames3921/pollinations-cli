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
      // We merge local tools + MCP tools + a virtual "Architect" tool
      const systemPrompt = this.buildSystemPrompt(mcpTools);
      
      const response = await this.api.post('/v1/chat/completions', {
        model: this.config.roles.coder,
        messages: [{ role: 'system', content: systemPrompt }, ...this.history]
      });

      const content = response.data.choices[0].message.content;
      this.history.push({ role: 'assistant', content });

      // Cleanly show Pollina's dialogue without the JSON clutter
      const reasoning = content.replace(/\{[\s\S]*?"tool"[\s\S]*?\}/g, '').trim();
      if (reasoning) {
        console.log(chalk.blue(`\n🐝 [Pollina]:`) + chalk.white(` ${reasoning}`));
      }

      const action = this.parseAction(content);
      if (!action) break;

      // Special Handling for the Architect Tool (Internal Delegation)
      if (action.tool === 'consult_architect') {
        process.stdout.write(chalk.cyan(`🏗️  [Architect]: Drafting technical strategy... `));
        const plan = await this.callRole('architect', action.args.goal);
        console.log(chalk.green('Done.'));
        this.history.push({ role: 'system', content: `Architect Plan: ${plan}` });
        continue; // Go back to Coder to execute the plan
      }

      // Normal Tool Execution
      process.stdout.write(chalk.yellow(`⚙️  [Action]: ${action.tool}... `));
      try {
        let result = (action.server === 'local') 
          ? await this.localTools.call(action.tool, action.args) 
          : await this.mcp.callMcp(action.server, action.tool, action.args);

        console.log(chalk.green('Done.'));
        
        // Research & Criticism only happen if a tool was actually used
        const research = await this.researchPhase(action, result);
        this.history.push({ role: 'system', content: `Observation: ${result}\nResearch: ${research}` });

        if (this.config.roles.critic) {
          const validation = await this.validateAction(action, result);
          console.log(chalk.magenta(`🧐 [Critic]:`) + chalk.dim(` ${validation}`));
          this.history.push({ role: 'system', content: `Critic Feedback: ${validation}` });
        }
      } catch (err) {
        console.log(chalk.red('Failed.'));
        this.history.push({ role: 'system', content: `Error: ${err.message}` });
      }
    }

    // Final Task Wrap-up
    if (this.history[this.history.length - 1].role === 'system') {
      const summaryRes = await this.api.post('/v1/chat/completions', {
        model: this.config.roles.coder,
        messages: [...this.history, { role: 'system', content: 'Task finished. Briefly let the user know what you did.' }]
      });
      console.log(chalk.blue(`\n🐝 [Pollina]:`) + chalk.white(` ${summaryRes.data.choices[0].message.content}`));
    }
  }

  async researchPhase(action, result) {
    if (!this.mcp.clients.has('google-search')) return "Verified.";
    // Simple check: does this look like code or a fact?
    if (result.length < 50) return "Verified."; 
    
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.architect,
      messages: [
        { role: 'system', content: 'Output {"search": "query"} if this needs a quick web check, else "OK".' },
        { role: 'user', content: `Tool: ${action.tool}, Result: ${result.substring(0, 200)}` }
      ]
    });
    if (res.data.choices[0].message.content.includes('search')) {
      const query = JSON.parse(res.data.choices[0].message.content).search;
      return await this.mcp.callMcp('google-search', 'search', { query });
    }
    return "Logical verification passed.";
  }

  async callRole(role, prompt) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles[role],
      messages: [{ role: 'system', content: `You are the ${role}. Respond with pure information/strategy, no fluff.` }, { role: 'user', content: prompt }]
    });
    return res.data.choices[0].message.content;
  }

  buildSystemPrompt(mcpTools) {
    const definitions = [...this.localTools.getToolDefinitions(), ...mcpTools];
    // Add the virtual tool to the Coder's belt
    definitions.push({
      name: "consult_architect",
      description: "Use this if the user asks for a complex project, architecture, or multi-step plan. It returns a high-level strategy.",
      parameters: { goal: "The technical objective to plan for." }
    });

    return `You are Pollina, a chill and capable swarm agent.
Roles: ${JSON.stringify(this.config.roles)}
Context: ${this.config.context}

Rules:
1. Don't over-plan small talk. If the user says "sup", just be cool and chat.
2. Use "consult_architect" ONLY when you need a serious technical blueprint for a big task.
3. If you act, use JSON: {"tool": "name", "server": "local|serverName", "args": {}}
4. NEVER truncate output. List everything.`;
  }

  parseAction(content) {
    const match = content.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
    try { return match ? JSON.parse(match[0]) : null; } catch (e) { return null; }
  }

  async validateAction(action, result) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.critic,
      messages: [
        { role: 'system', content: 'Be a brief critic. PASS or FAIL.' },
        { role: 'user', content: `Tool: ${action.tool}, Result: ${result}` }
      ]
    });
    return res.data.choices[0].message.content;
  }
}
