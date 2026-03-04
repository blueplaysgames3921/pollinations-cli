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
    this.maxIterations = 15; 
  }

  async init() {
    if (this.config.mcp_servers) {
      for (const srv of this.config.mcp_servers) {
        await this.mcp.connect(srv.name, srv.command, srv.args);
      }
    }
  }

  async run(userInput) {
    console.log(chalk.bold.blue('\n🏗️  [Phase 1: Architecture & Planning]'));
    const plan = await this.callRole('architect', `Create a detailed technical plan for: ${userInput}`);
    console.log(chalk.white(plan));
    this.history.push({ role: 'system', content: `Current Plan: ${plan}` });

    this.history.push({ role: 'user', content: userInput });
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      if (this.history.length > 12) {
        await this.compressHistory();
      }

      const mcpTools = await this.mcp.getExternalTools();
      
      const response = await this.api.post('/v1/chat/completions', {
        model: this.config.roles.coder,
        messages: [{ role: 'system', content: this.buildSystemPrompt(mcpTools) }, ...this.history]
      });

      const content = response.data.choices[0].message.content;
      console.log(chalk.blue(`\n🐝 [Pollina]:`) + chalk.white(` ${content}`));
      this.history.push({ role: 'assistant', content });

      if (content.includes('TASK_COMPLETE')) break;

      const action = this.parseAction(content);
      if (!action) break;

      if (action.tool === 'generate_image') {
        console.log(chalk.magenta('🎨 [Artist Phase]: Delegating to vision model...'));
        const result = await this.localTools.call('generate_image', { ...action.args, model: this.config.roles.artist });
        this.history.push({ role: 'system', content: `Artist Output: ${result}` });
        continue;
      }

      process.stdout.write(chalk.yellow(`⚙️  [Executing]: ${action.tool}... `));
      
      try {
        let result;
        if (action.server === 'local') {
          result = await this.localTools.call(action.tool, action.args);
        } else {
          result = await this.mcp.callMcp(action.server, action.tool, action.args);
        }
        console.log(chalk.green('Done.'));

        const research = await this.researchPhase(action, result);
        this.history.push({ role: 'system', content: `Observation: ${result}\nResearch/Validation: ${research}` });
        
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
    
    await this.finalSummary();
  }

  async compressHistory() {
    const toSummarize = this.history.slice(0, 6);
    const summary = await this.callRole('architect', `Summarize the progress made so far based on these logs: ${JSON.stringify(toSummarize)}`);
    this.history = [{ role: 'system', content: `Summary of earlier progress: ${summary}` }, ...this.history.slice(6)];
  }

  async researchPhase(action, result) {
    if (!this.mcp.clients.has('google-search')) return "Verified locally.";
    
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.architect,
      messages: [
        { role: 'system', content: 'You are a technical researcher. Does this result need web verification? If yes, output JSON: {"search": "query"}. If no, say "VERIFIED".' },
        { role: 'user', content: `Action: ${action.tool}\nResult: ${result.substring(0, 500)}` }
      ]
    });

    const decision = res.data.choices[0].message.content;
    if (decision.includes('search')) {
      try {
        const query = JSON.parse(decision.match(/\{.*\}/)[0]).search;
        return await this.mcp.callMcp('google-search', 'search', { query });
      } catch (e) { return "Search failed."; }
    }
    return decision;
  }

  async callRole(role, prompt) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles[role],
      messages: [{ role: 'system', content: `You are the ${role}. Perform your task based on the AGENTS.md context.` }, { role: 'user', content: prompt }]
    });
    return res.data.choices[0].message.content;
  }

  async finalSummary() {
    const summary = await this.callRole('architect', 'Summarize the final state of the project and all changes made.');
    console.log(chalk.bold.green('\n✔ Swarm Task Complete:'));
    console.log(chalk.white(summary));
  }

  buildSystemPrompt(mcpTools) {
    return `You are Pollina, a multimodal swarm.
Roles: ${JSON.stringify(this.config.roles)}
Context: ${this.config.context}
Constraints: ${this.config.constraints.join('. ')}
Tools: ${JSON.stringify([...this.localTools.getToolDefinitions(), ...mcpTools])}

Rules:
1. Speak clearly before acting.
2. NEVER truncate code.
3. Call tools using: {"tool": "name", "server": "local|serverName", "args": {}}
4. If the user's task is fully finished, include "TASK_COMPLETE" in your final message.`;
  }

  parseAction(content) {
    const jsonMatch = content.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
    if (!jsonMatch) return null;
    try { return JSON.parse(jsonMatch[0]); } catch (e) { return null; }
  }

  async validateAction(action, result) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.critic,
      messages: [
        { role: 'system', content: 'You are a critic. Does the tool result align with the architect plan? Reply PASS or explain errors.' },
        { role: 'user', content: `Action: ${JSON.stringify(action)}\nResult: ${result}` }
      ]
    });
    return res.data.choices[0].message.content;
  }
}

