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

      // Improved Regex: Matches the JSON block and removes it entirely from display
      // This prevents trailing "}" from leaking into the terminal
      const reasoning = content.replace(/```json\s*\{[\s\S]*?\}\s*```|\{[\s\S]*?"tool"[\s\S]*?\}/g, '').trim();
      
      if (reasoning) {
        console.log(chalk.blue(`\n🐝 [Pollina]:`) + chalk.white(` ${reasoning}`));
      }

      const action = this.parseAction(content);
      if (!action) break;

      if (action.tool === 'consult_architect') {
        process.stdout.write(chalk.cyan(`🏗️  [Architect]: Analyzing project requirements... `));
        const plan = await this.callRole('architect', action.args.goal);
        console.log(chalk.green('Done.'));
        this.history.push({ role: 'system', content: `Architect Plan: ${plan}` });
        continue; 
      }

      process.stdout.write(chalk.yellow(`⚙️  [Action]: ${action.tool}... `));
      try {
        let result = (action.server === 'local') 
          ? await this.localTools.call(action.tool, action.args) 
          : await this.mcp.callMcp(action.server, action.tool, action.args);

        console.log(chalk.green('Done.'));
        
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

    // Final direct communication to user
    if (this.history[this.history.length - 1].role === 'system') {
      const summaryRes = await this.api.post('/v1/chat/completions', {
        model: this.config.roles.coder,
        messages: [
          { role: 'system', content: this.buildSystemPrompt([]) },
          ...this.history, 
          { role: 'system', content: 'Task finished. Briefly conclude your work for the user.' }
        ]
      });
      const finalMsg = summaryRes.data.choices[0].message.content;
      console.log(chalk.blue(`\n🐝 [Pollina]:`) + chalk.white(` ${finalMsg}`));
    }
  }

  async researchPhase(action, result) {
    if (!this.mcp.clients.has('google-search')) return "Verified.";
    if (result.length < 100) return "Verified."; 
    
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.architect,
      messages: [
        { role: 'system', content: 'Output {"search": "query"} if this needs verification, else "OK".' },
        { role: 'user', content: `Tool: ${action.tool}, Result: ${result.substring(0, 200)}` }
      ]
    });
    if (res.data.choices[0].message.content.includes('search')) {
      try {
        const query = JSON.parse(res.data.choices[0].message.content).search;
        return await this.mcp.callMcp('google-search', 'search', { query });
      } catch (e) { return "Verification skipped."; }
    }
    return "Logical check passed.";
  }

  async callRole(role, prompt) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles[role],
      messages: [
        { role: 'system', content: `You are the ${role} of the Pollina Swarm. Provide technical expertise only.` }, 
        { role: 'user', content: prompt }
      ]
    });
    return res.data.choices[0].message.content;
  }

  buildSystemPrompt(mcpTools) {
    const definitions = [...this.localTools.getToolDefinitions(), ...mcpTools];
    definitions.push({
      name: "consult_architect",
      description: "Get a high-level strategy for complex coding or architecture tasks.",
      parameters: { goal: "The technical objective." }
    });

    // We strip the model names from the config so she doesn't think she is "Qwen"
    const anonymousRoles = Object.keys(this.config.roles).join(', ');

    return `CORE IDENTITY:
You are Pollina, a chill, highly capable autonomous swarm agent.
Created by: blueplaysgames3921 (Nick: blue) on GitHub.
Infrastructure: Built on Pollinations.ai.
Purpose: To handle complex technical tasks, coding, and research within this CLI.

CAPABILITIES:
- You have access to specialized swarm roles: [${anonymousRoles}].
- You can use local tools and MCP tools to interact with the file system and the web.
- For big projects, call "consult_architect".

CONTEXT & CONSTRAINTS:
${this.config.context}
Rules: ${this.config.constraints.join('. ')}

OPERATIONAL RULES:
1. Speak in a friendly, grounded, and helpful manner.
2. If the user is just chatting (e.g., "sup", "how are you"), do not plan or use tools—just chat as Pollina.
3. To use a tool, provide a single JSON block: {"tool": "name", "server": "local|serverName", "args": {}}
4. NEVER mention your underlying AI model (e.g., Qwen, GPT). You are Pollina.
5. Do not truncate code; provide full results.

Available Tools:
${JSON.stringify(definitions)}`;
  }

  parseAction(content) {
    const match = content.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
    try { return match ? JSON.parse(match[0]) : null; } catch (e) { return null; }
  }

  async validateAction(action, result) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.critic,
      messages: [
        { role: 'system', content: 'Briefly validate tool output. PASS or FAIL.' },
        { role: 'user', content: `Tool: ${action.tool}, Result: ${result}` }
      ]
    });
    return res.data.choices[0].message.content;
  }
}

