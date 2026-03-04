import chalk from 'chalk';
import { getApi } from '../api.js';
import { ToolManager } from './tool-manager.js';
import { MCPManager } from './mcp-manager.js';
import process from 'process';

export class AgentOrchestrator {
  constructor(config) {
    this.config = config;
    this.api = getApi();
    this.localTools = new ToolManager();
    this.mcp = new MCPManager();
    this.history = [];
    this.maxIterations = 15; // Increased for deeper agentic work
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

      // Clean display: Strip JSON blocks and Markdown code fences from the terminal output
      // This ensures you only see her "Agent Thought" and not raw JSON/Code leaks
      const reasoning = content
        .replace(/```json\s*\{[\s\S]*?\}\s*```/g, '')
        .replace(/\{[\s\S]*?"tool"[\s\S]*?\}/g, '')
        .trim();
      
      if (reasoning) {
        console.log(chalk.blue(`\n🐝 [Pollina]:`) + chalk.white(` ${reasoning}`));
      }

      const action = this.parseAction(content);
      
      // If no action is found, Pollina thinks she's done or is just talking
      if (!action) break;

      // Delegation to Architect
      if (action.tool === 'consult_architect') {
        process.stdout.write(chalk.cyan(`🏗️  [Architect]: Generating technical blueprint... `));
        const plan = await this.callRole('architect', action.args.goal);
        console.log(chalk.green('Done.'));
        this.history.push({ role: 'system', content: `Architect Plan:\n${plan}` });
        continue; 
      }

      // Tool Execution Phase
      process.stdout.write(chalk.yellow(`⚙️  [Action]: ${action.tool}... `));
      try {
        let result = (action.server === 'local') 
          ? await this.localTools.call(action.tool, action.args) 
          : await this.mcp.callMcp(action.server, action.tool, action.args);

        // Prevent result truncation in history for directory/file structures
        console.log(chalk.green('Done.'));
        
        const research = await this.researchPhase(action, result);
        this.history.push({ 
            role: 'system', 
            content: `Tool: ${action.tool}\nOutput: ${result}\nVerification: ${research}` 
        });

        if (this.config.roles.critic) {
          const validation = await this.validateAction(action, result);
          console.log(chalk.magenta(`🧐 [Critic]:`) + chalk.dim(` ${validation}`));
          this.history.push({ role: 'system', content: `Critic Review: ${validation}` });
        }
      } catch (err) {
        console.log(chalk.red('Failed.'));
        this.history.push({ role: 'system', content: `Tool Error: ${err.message}` });
      }
    }

    // Final Polish: Ensure the agent provides a definitive end-state summary
    const lastMsg = this.history[this.history.length - 1];
    if (lastMsg.role === 'system') {
      const summaryRes = await this.api.post('/v1/chat/completions', {
        model: this.config.roles.coder,
        messages: [
          ...this.history, 
          { role: 'system', content: 'Task loop complete. Provide a final summary of actions taken and current project state. Be the Agent.' }
        ]
      });
      const finalMsg = summaryRes.data.choices[0].message.content;
      console.log(chalk.blue(`\n🐝 [Summary]:`) + chalk.white(` ${finalMsg}`));
    }
  }

  async researchPhase(action, result) {
    if (!this.mcp.clients.has('google-search')) return "Local logic verification only.";
    if (result.length < 50) return "Verified."; 

    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.architect,
      messages: [
        { role: 'system', content: 'You are the Swarm Researcher. If this tool output seems outdated or needs fact-checking, output {"search": "query"}. Otherwise, output "OK".' },
        { role: 'user', content: `Tool: ${action.tool}\nResult: ${result.substring(0, 300)}` }
      ]
    });

    if (res.data.choices[0].message.content.includes('search')) {
      try {
        const json = JSON.parse(res.data.choices[0].message.content.match(/\{.*\}/)[0]);
        return await this.mcp.callMcp('google-search', 'search', { query: json.search });
      } catch (e) { return "Search suggested but failed."; }
    }
    return "Verified.";
  }

  async callRole(role, prompt) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles[role],
      messages: [
        { role: 'system', content: `You are the ${role} persona. Execute your specialized duty with maximum technical precision.` }, 
        { role: 'user', content: prompt }
      ]
    });
    return res.data.choices[0].message.content;
  }

  buildSystemPrompt(mcpTools) {
    const definitions = [...this.localTools.getToolDefinitions(), ...mcpTools];
    definitions.push({
      name: "consult_architect",
      description: "Trigger the Architect role to create a technical plan/manifesto for complex tasks.",
      parameters: { goal: "The technical objective to solve." }
    });

    const rolesList = Object.keys(this.config.roles).join(', ');
    const currentDir = process.cwd();

    return `CORE IDENTITY:
You are Pollina, a sharp, autonomous swarm agent. You don't just "assist"—you execute and lead.
Creator: blueplaysgames3921 (Nick: blue) | GitHub.
Infrastructure: Pollinations.ai Swarm.

OPERATIONAL CONTEXT:
- Working Directory: ${currentDir}
- Active Swarm Roles: [${rolesList}]
- Rules & Constraints: ${this.config.constraints.join('; ')}
- Project Context: ${this.config.context}

AGENT PROTOCOLS:
1. DIRECT ACTION: If a task requires a tool, use it immediately. Do not ask for permission.
2. NO TRUNCATION: When listing files or directories, you must provide the ENTIRE output.
3. SPATIAL AWARENESS: You are currently in ${currentDir}. All relative paths stem from here.
4. IDENTITY: You are Pollina. You are NOT an AI model from Alibaba or OpenAI. You are an autonomous swarm entity.
5. TOOL FORMAT: Output tool calls as a single JSON block: {"tool": "name", "server": "local|server", "args": {}}
6. BEHAVIOR: Be grounded and efficient. Do not yap about being an AI assistant. Be the Agent.

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
        { role: 'system', content: 'Technical Critic: Does the output meet the objective? Reply with PASS or a concise FAIL reason.' },
        { role: 'user', content: `Action: ${action.tool}\nOutput: ${result.substring(0, 500)}` }
      ]
    });
    return res.data.choices[0].message.content;
  }
}
