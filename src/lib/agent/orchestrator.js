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
    this.tokenThreshold = 10;
  }

  async init() {
    if (this.config.mcp_servers) {
      for (const srv of this.config.mcp_servers) {
        await this.mcp.connect(srv.name, srv.command, srv.args);
      }
    }
  }

  async run(userInput) {
    console.log(chalk.bold.blue('\n🏗️  [Phase 1: Initial Planning]'));
    let currentPlan = await this.callRole('architect', `Create a detailed step-by-step plan for: ${userInput}`);
    console.log(chalk.white(currentPlan));
    
    this.history.push({ role: 'user', content: userInput });
    this.history.push({ role: 'system', content: `Current Plan: ${currentPlan}` });

    let iteration = 0;
    let taskCompleted = false;

    while (iteration < this.maxIterations && !taskCompleted) {
      iteration++;
      
      if (this.history.length > this.tokenThreshold) {
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

      if (content.toLowerCase().includes('task_complete') || content.toLowerCase().includes('final_answer')) {
        taskCompleted = true;
        break;
      }

      const action = this.parseAction(content);
      if (!action) {
        console.log(chalk.yellow('⚠️ No action detected. Asking architect to intervene...'));
        const intervention = await this.callRole('architect', `The coder is stuck and didn't provide a tool call. Review the history and provide a corrected step.`);
        this.history.push({ role: 'system', content: `Architect Intervention: ${intervention}` });
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
          if (validation.includes('FAIL')) {
            console.log(chalk.red(`❌ [Critic]: Validation Failed. Re-planning...`));
            currentPlan = await this.callRole('architect', `The previous action failed validation. Failure: ${validation}. Update the plan.`);
            this.history.push({ role: 'system', content: `Updated Plan: ${currentPlan}` });
          } else {
            console.log(chalk.magenta(`🧐 [Critic]:`) + chalk.dim(` ${validation}`));
          }
        }
      } catch (err) {
        console.log(chalk.red('Error.'));
        this.history.push({ role: 'system', content: `Tool Error: ${err.message}. Adjusting strategy.` });
      }
    }
    
    await this.finalSummary();
  }

  async compressHistory() {
    console.log(chalk.dim('📦 [Memory]: Summarizing early conversation to save context...'));
    const toSummarize = this.history.slice(0, 4);
    const summary = await this.callRole('architect', `Summarize these early steps of the project concisely: ${JSON.stringify(toSummarize)}`);
    this.history = [{ role: 'system', content: `Previous Progress Summary: ${summary}` }, ...this.history.slice(4)];
  }

  async researchPhase(action, result) {
    if (!this.mcp.clients.has('google-search')) return "Local Verification Only.";
    
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.architect,
      messages: [
        { role: 'system', content: 'Decide if this result needs external verification. If so, output {"search": "query"}. Else, say "OK".' },
        { role: 'user', content: `Tool: ${action.tool}, Result: ${result.substring(0, 300)}` }
      ]
    });

    const decision = res.data.choices[0].message.content;
    if (decision.includes('search')) {
      try {
        const query = JSON.parse(decision).search;
        return await this.mcp.callMcp('google-search', 'search', { query });
      } catch (e) { return "Search failed."; }
    }
    return "Result looks consistent with logic.";
  }

  async callRole(role, prompt) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles[role],
      messages: [{ role: 'system', content: `You are the ${role}. Perform your task based on the project state.` }, { role: 'user', content: prompt }]
    });
    return res.data.choices[0].message.content;
  }

  async finalSummary() {
    const summary = await this.callRole('architect', 'Review all history and provide the FINAL report to the user.');
    console.log(chalk.bold.green('\n✔ Mission Accomplished:'));
    console.log(chalk.white(summary));
  }

  buildSystemPrompt(mcpTools) {
    return `You are Pollina, an autonomous swarm.
Roles: ${JSON.stringify(this.config.roles)}
Context: ${this.config.context}
Tools: ${JSON.stringify([...this.localTools.getToolDefinitions(), ...mcpTools])}

Rules:
1. Speak before acting.
2. Use tool JSON: {"tool": "name", "server": "local|server", "args": {}}
3. When finished, you MUST include the text "TASK_COMPLETE".`;
  }

  parseAction(content) {
    const match = content.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
    return match ? JSON.parse(match[0]) : null;
  }

  async validateAction(action, result) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.critic,
      messages: [
        { role: 'system', content: 'Critique the result. If bad, start response with FAIL. If good, start with PASS.' },
        { role: 'user', content: `Action: ${JSON.stringify(action)}\nResult: ${result}` }
      ]
    });
    return res.data.choices[0].message.content;
  }
}
