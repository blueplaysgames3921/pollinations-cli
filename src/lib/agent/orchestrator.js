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

  // A bulletproof JSON extractor that safely counts brackets and ignores strings
  extractJSON(str, startChar, endChar, startIndex) {
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = startIndex; i < str.length; i++) {
      const char = str[i];
      
      if (!escapeNext) {
        if (char === '"') inString = !inString;
        else if (!inString) {
          if (char === startChar) depth++;
          else if (char === endChar) depth--;
        }
      }
      escapeNext = (char === '\\' && !escapeNext);
      
      if (depth === 0 && !inString) {
        return str.substring(startIndex, i + 1);
      }
    }
    return null;
  }

  parseAction(content, mcpTools) {
    try {
      // 1. Catch the OpenAI tool call array leak (this is what caused the bug)
      const oaiIndex = content.indexOf('[{"id"');
      if (oaiIndex !== -1) {
        const jsonStr = this.extractJSON(content, '[', ']', oaiIndex);
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          const call = parsed[0];
          const funcName = call.function?.name || call.name; 
          const rawArgs = call.function?.arguments || call.arguments;
          
          // OpenAI returns arguments as a stringified JSON. We must parse it again.
          const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
          
          // Dynamically map server
          let server = 'local';
          const isLocal = this.localTools.getToolDefinitions().some(t => t.name === funcName);
          if (!isLocal && mcpTools) {
            const mcpDef = mcpTools.find(t => t.name === funcName);
            if (mcpDef) server = mcpDef.server;
          }
          return { tool: funcName, server, args };
        }
      }

      // 2. Catch custom format fallback
      const customIndex = content.indexOf('{"tool"');
      if (customIndex !== -1) {
        const jsonStr = this.extractJSON(content, '{', '}', customIndex);
        if (jsonStr) return JSON.parse(jsonStr);
      }
    } catch (e) {
      // Silently fail and return null so the loop continues instead of crashing
    }
    return null;
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

      // Clean display logic: Use our extractor to perfectly strip the JSON payloads from the terminal UI
      let reasoning = content;
      
      const oaiIndex = reasoning.indexOf('[{"id"');
      if (oaiIndex !== -1) {
        const jsonStr = this.extractJSON(reasoning, '[', ']', oaiIndex);
        if (jsonStr) reasoning = reasoning.replace(jsonStr, '');
      }

      const customIndex = reasoning.indexOf('{"tool"');
      if (customIndex !== -1) {
        const jsonStr = this.extractJSON(reasoning, '{', '}', customIndex);
        if (jsonStr) reasoning = reasoning.replace(jsonStr, '');
      }

      reasoning = reasoning.replace(/```json[\s\S]*?```/g, '').trim();
      
      if (reasoning) {
        process.stdout.write(`\n${this.colors.pollina('🐝 [Pollina]:')} ${chalk.white(reasoning)}\n`);
      }

      const action = this.parseAction(content, mcpTools);
      
      if (!action) break;

      if (action.tool === 'consult_architect') {
        console.log(`\n${this.colors.architect('🏗️  [Architect]:')} ${chalk.dim('Strategic Planning...')}`);
        const plan = await this.callRole('architect', action.args.goal);
        console.log(chalk.green('  ✔ Technical Plan Prepared.'));
        this.history.push({ role: 'system', content: `Architect Proposal:\n${plan}` });
        continue; 
      }

      process.stdout.write(`${this.colors.action('⚙️  [Action]:')} ${chalk.bold.white(action.tool)}... `);
      try {
        let result = (action.server === 'local' || !action.server) 
          ? await this.localTools.call(action.tool, action.args) 
          : await this.mcp.callMcp(action.server, action.tool, action.args);

        process.stdout.write(chalk.green('SUCCESS\n'));
        
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
        { role: 'system', content: 'You are the Swarm Researcher. You have to create a detailed step-by-step plan while verifying it. If this output is critical and needs fact-checking, output JSON: {"search": "query"}. Otherwise "OK".' },
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
      description: "Engage the Architect for a high-level technical blueprint. Use this BEFORE writing any code for complex features",
      parameters: { goal: "The technical objective." }
    });

    const currentDir = process.cwd();

    const customConstraints = (this.config.constraints || [])
    .map(c => `- ${c.toUpperCase()}`) 
    .join('\n');

    return `IDENTITY:
You are Pollina, a sharp and autonomous swarm agent. You lead.
Creator: blueplaysgames3921. Infrastructure: Pollinations.ai.

ENVIRONMENT:
- Root Directory: ${currentDir}
- You must use absolute or relative paths correctly based on this root.
- All file operations must be performed via tools.

PROJECT CONSTRAINTS(HIGH PRIORITY):
${customConstraints || '- No specific constraints provided.'}

PROJECT CONTEXT:
${this.config.context || 'Standard development environment.'}

STRICT AGENT PROTOCOLS:
1. NO YAPPING: Do not explain that you are an AI or that you are "trying" to create a file. Just use the tool.
2. YOU MUST ACTUALLY CALL TOOLS: Do not just output code blocks. If you want to write a file, you must output the JSON payload.
3. NEVER ASSUME SUCCESS: If you call "write_file", do not act like it succeeded until the system replies to you with "SUCCESS".
4. NO TRUNCATION: Always output full file contents.
5. DO NOT PASTE CODE IN YOUR SPEECH: Place the code directly into the tool arguments.
6. ARCHITECT CONSULTATION: If you deem the task too complex and requires heavy planning to do it alone or unsure or uncertain, ask the architect to create a detailed plan using "consult_architect".

Available Tools:
${JSON.stringify(definitions)}`;
  }

  async validateAction(action, result) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.critic,
      messages: [
        { role: 'system', content: 'You are a Technical Critic. If something is incorrect/invalid or may potentially create bugs or errors in the code, Technical Critic: PASS or FAIL + reason. You have to ensure the code works properly by pointing out the mistakes.' },
        { role: 'user', content: `Action: ${action.tool}\nResult: ${result.substring(0, 500)}` }
      ]
    });
    return res.data.choices[0].message.content;
  }
}
