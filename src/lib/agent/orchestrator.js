import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';
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
    this.maxIterations = 15;
    this.colors = {
      pollina: gradient(['#ffcc00', '#ff9900', '#ff6600']),
      architect: gradient(['#00c6ff', '#0072ff']),
      critic: gradient(['#834d9b', '#d04ed6']),
      action: chalk.bold.yellow
    };
  }

  async init() {
    console.clear();
    console.log(this.colors.pollina(figlet.textSync('POLLINA', { font: 'Slant' })));
    console.log(chalk.dim(`  Infrastructure: Pollinations.ai | Created by: blue\n`));

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

      // Clean display logic: Strip JSON blocks and Markdown fences so only speech shows
      const reasoning = content
        .replace(/```json\s*\{[\s\S]*?\}\s*```/g, '') // Remove fenced JSON
        .replace(/\{[\s\S]*?"tool"[\s\S]*?\}/g, '')    // Remove raw JSON
        .trim();
      
      if (reasoning) {
        process.stdout.write(`\n${this.colors.pollina('🐝 [Pollina]:')} ${chalk.white(reasoning)}\n`);
      }

      const action = this.parseAction(content);
      
      // If no action tool is called, the agent has finished its thought/task
      if (!action) break;

      // Special Architect Phase
      if (action.tool === 'consult_architect') {
        console.log(`\n${this.colors.architect('🏗️  [Architect]:')} ${chalk.dim('Strategic Planning...')}`);
        const plan = await this.callRole('architect', action.args.goal);
        console.log(chalk.green('  ✔ Technical Plan Prepared.'));
        this.history.push({ role: 'system', content: `Architect Proposal:\n${plan}` });
        continue; 
      }

      // Execute Tool
      process.stdout.write(`${this.colors.action('⚙️  [Action]:')} ${chalk.dim(action.tool)}... `);
      try {
        let result = (action.server === 'local') 
          ? await this.localTools.call(action.tool, action.args) 
          : await this.mcp.callMcp(action.server, action.tool, action.args);

        process.stdout.write(chalk.green('SUCCESS\n'));
        
        // Research/Validation
        const research = await this.researchPhase(action, result);
        this.history.push({ 
            role: 'system', 
            content: `Tool Execution Result [${action.tool}]:\n${result}\n\nValidation: ${research}` 
        });

        if (this.config.roles.critic) {
          const validation = await this.validateAction(action, result);
          const statusColor = validation.includes('PASS') ? chalk.green : chalk.red;
          console.log(`${this.colors.critic('🧐 [Critic]:')} ${statusColor(validation)}`);
          this.history.push({ role: 'system', content: `Critic Feedback: ${validation}` });
        }
      } catch (err) {
        process.stdout.write(chalk.red('FAILED\n'));
        this.history.push({ role: 'system', content: `Error executing ${action.tool}: ${err.message}` });
      }
    }

    // Wrap-up 
    const lastMsg = this.history[this.history.length - 1];
    if (lastMsg.role === 'system' || iteration >= this.maxIterations) {
      const summaryRes = await this.api.post('/v1/chat/completions', {
        model: this.config.roles.coder,
        messages: [
          ...this.history, 
          { role: 'system', content: 'Finalize current progress. Confirm if files were created and give a clear end state.' }
        ]
      });
      console.log(`\n${this.colors.pollina('🐝 [Summary]:')} ${chalk.white(summaryRes.data.choices[0].message.content)}`);
    }
  }

  async researchPhase(action, result) {
    if (!this.mcp.clients.has('google-search')) return "Internal verification only.";
    if (result.length < 50) return "Verified."; 

    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.architect,
      messages: [
        { role: 'system', content: 'You are the Swarm Researcher. If this output is critical and needs fact-checking, output JSON: {"search": "query"}. Otherwise "OK".' },
        { role: 'user', content: `Tool: ${action.tool}\nOutput: ${result.substring(0, 300)}` }
      ]
    });

    const choice = res.data.choices[0].message.content;
    if (choice.includes('search')) {
      try {
        const query = JSON.parse(choice.match(/\{.*\}/)[0]).search;
        console.log(chalk.cyan(`🔍 [Research]: Verifying "${query}"...`));
        return await this.mcp.callMcp('google-search', 'search', { query });
      } catch (e) { return "Search suggested but parsing failed."; }
    }
    return "Verified.";
  }

  async callRole(role, prompt) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles[role],
      messages: [
        { role: 'system', content: `You are the ${role} persona. Execute with maximum technical authority.` }, 
        { role: 'user', content: prompt }
      ]
    });
    return res.data.choices[0].message.content;
  }

  buildSystemPrompt(mcpTools) {
    const definitions = [...this.localTools.getToolDefinitions(), ...mcpTools];
    definitions.push({
      name: "consult_architect",
      description: "Engage the Architect for a high-level technical blueprint.",
      parameters: { goal: "The technical objective." }
    });

    const currentDir = process.cwd();

    return `IDENTITY:
You are Pollina, a sharp and autonomous swarm agent. You lead.
Creator: blue (blueplaysgames3921). Infrastructure: Pollinations.ai.

ENVIRONMENT:
- Root Directory: ${currentDir}
- You must use absolute or relative paths correctly based on this root.
- All file operations must be performed via tools.

STRICT AGENT PROTOCOLS:
1. NO YAPPING: Do not explain that you are an AI or that you are "trying" to create a file. Just use the tool.
2. TOOL FORMAT: You MUST call tools using a single JSON block: {"tool": "name", "server": "local|server", "args": {}}
3. VERIFICATION: After using "write_file", you should ideally use "list_files" or "read_file" in the next iteration to confirm the file exists. Do not assume success.
4. NO TRUNCATION: Always output full file contents and full directory listings.
5. CODE HANDLING: Do not paste the code you are writing into your speech/reasoning if you are also using a tool to write it. The tool output is what matters.

Available Tools:
${JSON.stringify(definitions)}`;
  }

  parseAction(content) {
    // Improved regex to find JSON even if wrapped in markdown or mixed with text
    const jsonRegex = /\{[\s\S]*?"tool"[\s\S]*?\}/;
    const match = content.match(jsonRegex);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      // Fallback: try to clean up common AI formatting errors
      try {
        const cleaned = match[0].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        return JSON.parse(cleaned);
      } catch (innerE) {
        return null;
      }
    }
  }

  async validateAction(action, result) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.critic,
      messages: [
        { role: 'system', content: 'Technical Critic: PASS or FAIL + reason.' },
        { role: 'user', content: `Action: ${action.tool}\nResult: ${result.substring(0, 500)}` }
      ]
    });
    return res.data.choices[0].message.content;
  }
}
