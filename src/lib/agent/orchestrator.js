import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';
import path from 'path';
import { getApi } from '../api.js';
import { config as configStore } from '../config-store.js';
import { ToolManager } from './tool-manager.js';
import { MCPManager } from './mcp-manager.js';
import process from 'process';

const COMPRESSION_THRESHOLD = 26;
const COMPRESSION_KEEP_RECENT = 8;

export class AgentOrchestrator {
  constructor(config) {
    this.config = config;
    this.api = getApi();
    this.localTools = new ToolManager();
    this.mcp = new MCPManager();
    this.history = (config._resumedHistory || []).slice();
    this.maxIterations = 15;
    this.researcherModel = config.researcher?.model || config.roles?.researcher || 'gemini-search';
    this.researcherEnabled = config.researcher?.enabled !== false;
    this.latestResearchContext = null;

    this.colors = {
      pollina:    gradient(['#ffcc00', '#ff9900', '#ff6600']),
      architect:  gradient(['#00c6ff', '#0072ff']),
      critic:     gradient(['#834d9b', '#d04ed6']),
      researcher: gradient(['#00b09b', '#96c93d']),
      action:     chalk.bold.yellow
    };
  }

  async init() {
    console.clear();
    console.log(this.colors.pollina(figlet.textSync('POLLINA', { font: 'Slant' })));
    console.log(chalk.dim('  Infrastructure: Pollinations.ai | Created by: blueplaysgames3921\n'));

    const apiKey = configStore.get('apiKey');

    if (this.config.mcp_servers?.length) {
      for (const srv of this.config.mcp_servers) {
        const serverEnv = {
          ...(apiKey ? { POLLINATIONS_API_KEY: apiKey } : {}),
          ...(srv.env || {})
        };
        const ok = await this.mcp.connect(srv.name, srv.command, srv.args || [], serverEnv);
        console.log(ok
          ? '  ' + chalk.green(`✔ MCP: ${srv.name}`)
          : '  ' + chalk.yellow(`⚠ MCP: ${srv.name} (failed to connect — skipped)`)
        );
      }
      console.log('');
    }

    if (this.researcherEnabled) {
      console.log(chalk.dim(`  Researcher: ${this.researcherModel}\n`));
    }
  }

  _extractJSON(str, openChar, closeChar, startIdx) {
    let depth = 0, inStr = false, esc = false;
    for (let i = startIdx; i < str.length; i++) {
      const c = str[i];
      if (!esc) {
        if (c === '"') inStr = !inStr;
        else if (!inStr) {
          if (c === openChar) depth++;
          else if (c === closeChar) depth--;
        }
      }
      esc = (c === '\\' && !esc);
      if (depth === 0 && !inStr) return str.substring(startIdx, i + 1);
    }
    return null;
  }

  _findAllJSONCandidates(content) {
    const candidates = [];
    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      if (c === '[' && content[i + 1] === '{') {
        const json = this._extractJSON(content, '[', ']', i);
        if (json) candidates.push({ json, isArray: true, pos: i });
      } else if (c === '{') {
        const json = this._extractJSON(content, '{', '}', i);
        if (json) candidates.push({ json, isArray: false, pos: i });
      }
    }
    candidates.sort((a, b) => a.pos - b.pos);
    return candidates;
  }

  parseAction(content, mcpTools) {
    const localNames = this.localTools.getToolDefinitions().map(t => t.name);
    const metaNames  = ['consult_architect', 'consult_researcher'];
    const mcpNames   = mcpTools?.map(t => t.name) || [];
    const allKnown   = new Set([...localNames, ...metaNames, ...mcpNames]);

    const candidates = this._findAllJSONCandidates(content);

    for (const { json, isArray } of candidates) {
      try {
        const parsed = JSON.parse(json);
        const call   = isArray ? parsed[0] : parsed;
        if (!call || typeof call !== 'object') continue;

        const funcName = call.tool || call.name || call.function?.name;
        if (!funcName || !allKnown.has(funcName)) continue;

        const rawArgs = call.args || call.arguments || call.function?.arguments;
        const args    = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {});

        const mcpMatch = mcpTools?.find(t => t.name === funcName);
        const server   = mcpMatch ? mcpMatch.server : 'local';

        return { tool: funcName, server, args, raw: json };
      } catch {
        continue;
      }
    }

    return null;
  }

  async compressContextIfNeeded() {
    if (this.history.length < COMPRESSION_THRESHOLD) return;

    const toCompress = this.history.slice(0, -COMPRESSION_KEEP_RECENT);
    const recent     = this.history.slice(-COMPRESSION_KEEP_RECENT);

    try {
      const res = await this.api.post('/v1/chat/completions', {
        model: this.config.roles?.architect || 'mistral',
        messages: [
          {
            role: 'system',
            content: `You are a session memory compressor for an autonomous coding agent. Summarise the provided conversation history into a tight factual bullet-point state snapshot. Cover: files created/edited/deleted, shell commands run, errors encountered, key decisions made, and current project state. Be accurate and terse. No meta-commentary.`
          },
          { role: 'user', content: JSON.stringify(toCompress) }
        ]
      });
      const summary = res.data.choices[0].message.content;
      this.history = [
        { role: 'system', content: `[COMPRESSED SESSION MEMORY]\n${summary}` },
        ...recent
      ];
    } catch {
      this.history = this.history.slice(-COMPRESSION_KEEP_RECENT);
    }
  }

  async callResearcher(query) {
    if (!this.researcherEnabled) return 'Researcher is disabled in config.';
    try {
      const res = await this.api.post('/v1/chat/completions', {
        model: this.researcherModel,
        messages: [
          {
            role: 'system',
            content: `You are the Pollina Researcher with grounded web search. Answer with precise, current, factual technical information. Include exact API signatures, npm package versions, and sources where relevant. Be concise and direct. No padding or preamble.`
          },
          { role: 'user', content: query }
        ]
      });
      const result = res.data.choices[0].message.content;
      this.latestResearchContext = `[RESEARCHER — "${query}"]\n${result}`;
      return result;
    } catch (err) {
      return `Researcher unavailable: ${err.message}`;
    }
  }

  async callArchitect(goal) {
    const constraints = (this.config.constraints || []).map(c => `  - ${c}`).join('\n');
    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles?.architect || 'mistral',
      messages: [
        {
          role: 'system',
          content: `You are the Architect in the Pollina swarm. Produce structured technical blueprints. No implementation code.
Output: phases, file structure, key decisions, dependencies, pitfalls, and exact instructions for the Coder.
If the task requires up-to-date API knowledge, flag "NEEDS_RESEARCH: <query>" explicitly so the Coder knows to call consult_researcher first.
Constraints:\n${constraints || '  - none'}
Context: ${this.config.context || 'General development environment'}`
        },
        { role: 'user', content: `Blueprint for: ${goal}` }
      ]
    });
    return res.data.choices[0].message.content;
  }

  async callCritic(action, result, ghostResult, researchCtx) {
    const args = action.args ? JSON.stringify(action.args, null, 2) : 'none';
    const researchPart = researchCtx
      ? `\n\nCURRENT RESEARCH CONTEXT (treat as ground truth — more current than your training data):\n${researchCtx}`
      : '';
    const ghostPart = (ghostResult && ghostResult !== 'SYNTAX_OK' && ghostResult !== null)
      ? `\n\nGHOST RUNTIME RESULT (pre-execution syntax check):\n${ghostResult}`
      : '';

    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles?.critic || 'openai',
      messages: [
        {
          role: 'system',
          content: `You are the Technical Critic in the Pollina swarm. You are the final gate before code reaches disk.
Rules:
1. A SYNTAX_ERROR from the ghost runtime is an automatic FAIL. Do not override it.
2. Use Research Context to verify library/API usage. It is more current than your training data.
3. Fail on any of: truncated code, missing imports, wrong function signatures, hardcoded secrets, logic errors, placeholder comments like "// rest of code here".
4. Respond with EXACTLY one of:
   PASS
   FAIL: [specific actionable reason]
Nothing else. No explanation for a pass. No padding.${researchPart}${ghostPart}`
        },
        {
          role: 'user',
          content: `Action: ${action.tool}\n\nArguments:\n${args}\n\nExecution Result:\n${result}`
        }
      ]
    });
    return res.data.choices[0].message.content;
  }

  async ghostRun(action) {
    if (action.tool === 'write_file' && action.args?.content) {
      const ext = path.extname(action.args.filePath || '').slice(1).toLowerCase();
      if (['js', 'mjs', 'cjs', 'json'].includes(ext)) {
        try {
          return await this.localTools.call('test_syntax', {
            code: action.args.content,
            language: ext
          });
        } catch {
          return null;
        }
      }
    }
    if (action.tool === 'shell_exec') {
      if (/rm\s+-rf\s+\/(?!\S)|mkfs|dd\s+if=/.test(action.args?.command || '')) {
        return 'DANGEROUS_COMMAND_BLOCKED';
      }
    }
    return null;
  }

  async run(userInput) {
    this.history.push({ role: 'user', content: userInput });
    this.latestResearchContext = null;
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      await this.compressContextIfNeeded();

      const mcpTools     = await this.mcp.getExternalTools();
      const systemPrompt = this.buildSystemPrompt(mcpTools);

      let response;
      try {
        response = await this.api.post('/v1/chat/completions', {
          model: this.config.roles?.coder || 'qwen-coder',
          messages: [{ role: 'system', content: systemPrompt }, ...this.history]
        });
      } catch (err) {
        console.log(chalk.red(`\n  ✖ API error: ${err.message}`));
        break;
      }

      const content = response.data.choices[0].message.content;
      this.history.push({ role: 'assistant', content });

      const action = this.parseAction(content, mcpTools);

      let display = content;
      if (action?.raw) display = display.replace(action.raw, '');
      display = display.replace(/```json[\s\S]*?```/g, '').trim();

      const isInternalLabel = /^(Technical Critic:|Architect (Blueprint|Proposal):|Researcher (Output|Findings|Results):)/i.test(display);
      if (display && !isInternalLabel) {
        console.log(`\n${this.colors.pollina('🐝 [Pollina]:')} ${chalk.white(display)}`);
      }

      if (!action) break;

      if (action.tool === 'consult_architect') {
        process.stdout.write(`${this.colors.architect('🏛  [Architect]:')} ${chalk.dim('Planning...\n')}`);
        const plan = await this.callArchitect(action.args?.goal || userInput);
        this.history.push({ role: 'system', content: `Architect Blueprint:\n${plan}` });
        continue;
      }

      if (action.tool === 'consult_researcher') {
        process.stdout.write(`${this.colors.researcher('🔬 [Researcher]:')} ${chalk.dim('Searching...\n')}`);
        const findings = await this.callResearcher(action.args?.query || action.args?.goal || userInput);
        this.history.push({ role: 'system', content: `Researcher Findings:\n${findings}` });
        continue;
      }

      process.stdout.write(`${this.colors.action('⚙️  [Action]:')} ${chalk.bold.white(action.tool)}... `);

      try {
        const ghostResult = await this.ghostRun(action);

        if (ghostResult === 'DANGEROUS_COMMAND_BLOCKED') {
          console.log(chalk.red('BLOCKED'));
          this.history.push({
            role: 'system',
            content: `Safety: the shell command was blocked as catastrophically dangerous. Choose a safer approach.`
          });
          continue;
        }

        if (ghostResult?.startsWith('SYNTAX_ERROR')) {
          console.log(chalk.red('SYNTAX ERROR'));
          this.history.push({
            role: 'system',
            content: `Ghost runtime rejected write_file — fix these syntax errors before retrying:\n${ghostResult}`
          });
          continue;
        }

        const result = (action.server === 'local' || !action.server)
          ? await this.localTools.call(action.tool, action.args)
          : await this.mcp.callMcp(action.server, action.tool, action.args);

        console.log(chalk.green('SUCCESS'));

        if (this.config.roles?.critic) {
          const validation = await this.callCritic(action, result, ghostResult, this.latestResearchContext);
          const pass = validation.trim().toUpperCase().startsWith('PASS');

          this.history.push({
            role: 'system',
            content: `Tool Result [${action.tool}]: ${result}\nCritic Verdict: ${validation}`
          });

          if (!pass) {
            const reason = validation.replace(/^FAIL:\s*/i, '').trim();
            console.log(`${this.colors.critic('🧐 [Critic]:')} ${chalk.red('REJECTED')} — ${chalk.yellow(reason)}`);
            continue;
          }
        } else {
          this.history.push({ role: 'system', content: `Tool Result [${action.tool}]: ${result}` });
        }

      } catch (err) {
        console.log(chalk.red('FAILED'));
        this.history.push({ role: 'system', content: `Error executing ${action.tool}: ${err.message}` });
      }
    }

    if (iteration >= this.maxIterations) {
      console.log(chalk.red('\n  ⚠ Max iterations reached.'));
    }
  }

  buildSystemPrompt(mcpTools) {
    const localDefs = this.localTools.getToolDefinitions();
    const allTools  = [
      ...localDefs,
      ...mcpTools,
      {
        name: 'consult_architect',
        description: 'Get a structured technical blueprint before writing code. Required for any multi-file task or architectural decision. Skip only for trivial single-line edits.',
        parameters: { goal: 'string — the technical objective to blueprint' }
      },
      {
        name: 'consult_researcher',
        description: 'Fetch current verified technical information using grounded web search. Use whenever you are uncertain about library syntax, npm versions, API endpoints, or any factual technical detail. Never guess — always research it first.',
        parameters: { query: 'string — specific technical question to look up' }
      }
    ];

    const cwd         = process.cwd();
    const constraints = (this.config.constraints || []).map(c => `  ► ${c.toUpperCase()}`).join('\n');

    return `IDENTITY: You are Pollina — an autonomous swarm agent on Pollinations.ai.

WORKING DIRECTORY: ${cwd}

PROJECT CONTEXT:
${this.config.context || 'General development environment.'}

CONSTRAINTS [ENFORCE ON EVERY ACTION — NON-NEGOTIABLE]:
${constraints || '  ► none specified'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHEN TO USE TOOLS vs WHEN TO JUST TALK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

USE TOOLS when user asks you to DO something concrete:
  Keywords: build, create, write, make, fix, add, remove, delete,
            install, run, generate, refactor, deploy, test, update,
            search, fetch, download, move, rename

DO NOT USE TOOLS when:
  • User greets you: "hi", "hello", "hey", "yo", "sup" → reply naturally, no tools
  • User asks a question you can answer from knowledge → just answer
  • User says "thank you", "ok", "sounds good" → acknowledge, no tools
  • User asks "what can you do" → explain your capabilities, no tools
  • The response is purely text and requires no files, commands, or data

Rule: if no file system or shell action is needed to satisfy the request, do not use any tool.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL CALL FORMAT — STRICT AND EXACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output EXACTLY ONE raw JSON object per response. No markdown fences. No wrapper text.

CORRECT:
{"tool": "write_file", "args": {"filePath": "src/app.js", "content": "..."}}

WRONG (code block wrapper):
\`\`\`json
{"tool": "write_file", "args": {...}}
\`\`\`

WRONG (shorthand — crashes parser):
[write_file(src/app.js)]

WRONG (two objects in one response — only first is read):
{"tool": "list_files", "args": {}} {"tool": "write_file", "args": {...}}

After a tool call is executed the system will report SUCCESS or the error.
Do not output a second tool call in the same message — wait for the system result first.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE EDITING STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For SMALL CHANGES to an existing file (add a function, fix a bug, change a line):
  1. read_file first — you MUST see current content and line numbers
  2. Use edit_file with the correct operation:
     insert_after / insert_before — add new lines at a position
     delete_lines                 — remove lines from:to
     replace_lines                — replace lines from:to with new content
     replace_text                 — find exact text anywhere and replace all occurrences

For NEW FILES or COMPLETE REWRITES:
  1. test_syntax first if it is .js or .json
  2. write_file with the COMPLETE final content — never truncate, never use "// rest of code here"
  3. Truncated content = automatic Critic FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY PROTOCOL — FOLLOW EVERY TIME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Multi-file tasks → consult_architect FIRST, then follow the blueprint.
2. Uncertain about API, version, or library → consult_researcher. Never guess syntax.
3. Writing .js or .json → test_syntax BEFORE write_file. A ghost SYNTAX_ERROR blocks the write.
4. Before edit_file → always read_file to see the actual current lines and numbers.
5. After writing a file → verify with list_files or read_file.
6. After MCP image generation → capture_asset IMMEDIATELY. Those URLs are transient and expire.
7. Path safety: all paths resolve from ${cwd}. "../" to escape the working directory is permanently blocked.
8. SUCCESS is confirmed only when the system reports SUCCESS — never assume a tool worked.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HANDLING FAILURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After a Critic FAIL:
  • Read the specific reason carefully.
  • Fix ONLY what the Critic flagged — do not rewrite unrelated code.
  • Use edit_file if the fix is targeted. Use write_file only if the whole file must be corrected.
  • Do not try the same thing again unchanged — that will fail again.

After a tool ERROR:
  • Read the error message in the system result.
  • If it is a path issue: use list_files to verify the path exists first.
  • If it is a syntax error: use test_syntax to validate before retrying write_file.
  • If it is a missing package: use shell_exec to run npm install.

After max iterations:
  • Summarise what was completed and what still needs doing.
  • The user can send a follow-up message to continue.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVAILABLE TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${JSON.stringify(allTools, null, 2)}`;
  }
}

