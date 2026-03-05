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
    console.log(chalk.dim(`  Infrastructure: Pollinations.ai | Created by: blueplaysgames3921\n`));

    if (this.config.mcp_servers) {
      for (const srv of this.config.mcp_servers) {
        await this.mcp.connect(srv.name, srv.command, srv.args);
      }
    }
  }

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
      const arrayIndex = content.indexOf('[{');
      const objectIndex = content.indexOf('{"');
      
      let jsonStr = null;
      let startIndex = -1;

      if (arrayIndex !== -1 && (objectIndex === -1 || arrayIndex < objectIndex)) {
        jsonStr = this.extractJSON(content, '[', ']', arrayIndex);
        startIndex = arrayIndex;
      } else if (objectIndex !== -1) {
        jsonStr = this.extractJSON(content, '{', '}', objectIndex);
        startIndex = objectIndex;
      }

      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        const call = Array.isArray(parsed) ? parsed[0] : parsed;
        
        if (call && (call.tool || call.name || (call.function && call.function.name))) {
          const funcName = call.tool || call.name || call.function.name;
          const rawArgs = call.args || call.arguments || (call.function && call.function.arguments);
          const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
          
          let server = 'local';
          const isLocal = this.localTools.getToolDefinitions().some(t => t.name === funcName);
          if (!isLocal && mcpTools) {
            const mcpDef = mcpTools.find(t => t.name === funcName);
            if (mcpDef) server = mcpDef.server;
          }
          return { tool: funcName, server, args, raw: jsonStr };
        }
      }
    } catch (e) {
      // Fail silently and return null to break loop or continue as chat
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

      const action = this.parseAction(content, mcpTools);
      let reasoning = content;
      
      if (action && action.raw) {
        reasoning = reasoning.replace(action.raw, '');
      }
      
      reasoning = reasoning.replace(/```json[\s\S]*?```/g, '').trim();
      
      // Filter out internal "Critic/Architect" yapping from the UI
      if (reasoning && !reasoning.startsWith('Technical Critic:') && !reasoning.startsWith('Architect Proposal:')) {
        process.stdout.write(`\n${this.colors.pollina('🐝 [Pollina]:')} ${chalk.white(reasoning)}\n`);
      }

      if (!action) break;

      if (action.tool === 'consult_architect') {
        const plan = await this.callRole('architect', action.args.goal);
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
          const isPass = validation.includes('PASS');
          // Hide Critic text from terminal unless it is a failure you need to see
          if (!isPass) {
             console.log(`${this.colors.critic('🧐 [Critic]:')} ${chalk.red('REJECTED - Fixing...')}`);
          }
          this.history.push({ role: 'system', content: `Critic Feedback: ${validation}` });
          
          if (!isPass) continue; // Loop back to let the coder fix it immediately
        }
      } catch (err) {
        process.stdout.write(chalk.red('FAILED\n'));
        this.history.push({ role: 'system', content: `Error executing ${action.tool}: ${err.message}` });
      }
    }

    // Final summary is only shown if the conversation actually ended with system tasks
    const lastMsg = this.history[this.history.length - 1];
    if (iteration >= this.maxIterations) {
      console.log(chalk.red('\n  ⚠ Max iterations reached.'));
    }
  }

  async researchPhase(action, result) {
    if (!this.mcp.clients.has('google-search')) return "Internal verification only.";
    if (result.length < 50) return "Verified."; 

    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.architect,
      messages: [
        { role: 'system', content: 'You are the Swarm Researcher. Analyze the tool output. If it contains data that needs fact-checking, output JSON: {"search": "query"}. If it is just code or local file data, output "OK".' },
        { role: 'user', content: `Tool: ${action.tool}\nOutput: ${result.substring(0, 300)}` }
      ]
    });

    const choice = res.data.choices[0].message.content;
    if (choice.includes('search')) {
      try {
        const jsonMatch = choice.match(/\{.*\}/);
        if (jsonMatch) {
            const query = JSON.parse(jsonMatch[0]).search;
            return await this.mcp.callMcp('google-search', 'search', { query });
        }
      } catch (e) { return "Search suggested but parsing failed."; }
    }
    return "Verified.";
  }

  async callRole(role, prompt) {
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles[role],
      messages: [
        { role: 'system', content: `You are the ${role} persona. Execute with maximum technical authority. Be concise. No small talk.` }, 
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
    const customConstraints = (this.config.constraints || []).map(c => `- ${c.toUpperCase()}`).join('\n');

    return `IDENTITY:
You are Pollina, a sharp and autonomous swarm agent. You lead.
Creator: blueplaysgames3921. Infrastructure: Pollinations.ai.

ENVIRONMENT:
- Root Directory: ${currentDir}
- Use absolute or relative paths correctly based on this root.

PROJECT CONSTRAINTS(HIGH PRIORITY):
${customConstraints || '- No specific constraints provided.'}

PROJECT CONTEXT:
${this.config.context || 'Standard development environment.'}

STRICT AGENT PROTOCOLS(MAJOR HIGHEST PRIORITY):
1. NO YAPPING: Do not explain your existence. If the user says "Hi", reply like a human, do NOT use tools.
2. CONTEXTUAL AWARENESS: Use tools ONLY when a task is requested. Do not create files for simple greetings.
3. TOOL EXECUTION: To use a tool, you MUST output a JSON object. No code blocks. No shorthand.
4. NEVER ASSUME SUCCESS: You only know a tool worked if the System says "SUCCESS".
5. NO TRUNCATION: Always output the full file content. 
6. ARCHITECT CONSULTATION: Use "consult_architect" for complex planning before writing files.
7. MANDATORY TOOL FORMAT[HIGHLY NECESSARY]: Output valid JSON only. 
   Example: {"tool": "write_file", "args": {"filePath": "test.txt", "content": "data"}}
   Shorthand like [write_file()] is forbidden. If you use it, the system crashes and the project fails.

Available Tools:
${JSON.stringify(definitions)}`;
  }

  async validateAction(action, result) {
    // Crucial: The Critic now sees the ARGS (the code being written) not just the "SUCCESS" string.
    const inputContent = action.args ? JSON.stringify(action.args) : "No arguments provided";
    
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles.critic,
      messages: [
        { role: 'system', content: `You are a Technical Critic. 
        Your ONLY job is to verify the technical correctness of an action.
        - If the code/action is valid, functional, and correct, respond: "PASS".
        - If there is a bug, truncation, or logical error, respond: "FAIL: [reason]".
        Do not explain why it passed. Do not be polite. Do not judge content unless it is broken.` },
        { role: 'user', content: `Action: ${action.tool}\nArguments: ${inputContent}\nResult: ${result}` }
      ]
    });
    return res.data.choices[0].message.content;
  }
}
