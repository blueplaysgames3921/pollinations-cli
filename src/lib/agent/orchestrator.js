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

const CRITIC_SKIP_TOOLS = new Set([
  'list_files',
  'read_file',
  'test_syntax',
  'delete_file',
  'move_file',
  'capture_asset',
]);

const GREETING_PATTERNS = [
  /^(hi|hello|hey|sup|yo|wassup|what'?s\s*up|howdy|hiya|greetings)[\s!?.]*$/i,
  /^good\s+(morning|afternoon|evening|night|day)[\s!?.]*$/i,
  /^how\s+(are\s+you|r\s+u|you\s+doing|is?\s+it\s+going)[\s!?.]*$/i,
  /^(thanks?|thank\s+you|ty|thx|cheers|appreciated)[\s!?.]*$/i,
  /^(ok|okay|k|sure|cool|nice|great|awesome|perfect|sounds?\s+good|got\s+it|understood|noted|alright)[\s!?.]*$/i,
  /^(what\s+can\s+you\s+do|who\s+are\s+you|tell\s+me\s+about\s+yourself|what\s+are\s+you)[\s!?.]*$/i,
];

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

  _isGreeting(input) {
    const trimmed = input.trim();
    return GREETING_PATTERNS.some(p => p.test(trimmed));
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
    return candidates.sort((a, b) => a.pos - b.pos);
  }

  parseAction(content, mcpTools) {
    const localNames = this.localTools.getToolDefinitions().map(t => t.name);
    const metaNames  = ['consult_architect', 'consult_researcher'];
    const mcpNames   = mcpTools?.map(t => t.name) || [];
    const allKnown   = new Set([...localNames, ...metaNames, ...mcpNames]);

    for (const { json, isArray } of this._findAllJSONCandidates(content)) {
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
            content: `You are a session memory compressor for an autonomous coding agent. Summarise the provided conversation history into a tight factual bullet-point state snapshot. Cover: files created/edited/deleted, shell commands run and their outcomes, errors encountered and how they were resolved, key decisions made, and the current project state. Be accurate and terse. No meta-commentary.`
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
If the task requires up-to-date API knowledge, flag "NEEDS_RESEARCH: <query>" explicitly.
Constraints:\n${constraints || '  - none'}
Context: ${this.config.context || 'General development environment'}`
        },
        { role: 'user', content: `Blueprint for: ${goal}` }
      ]
    });
    return res.data.choices[0].message.content;
  }

  _buildCriticContext() {
    const recentOps = this.history
      .slice(-12)
      .filter(m => m.role === 'system' && m.content.startsWith('Tool Result'))
      .map(m => m.content.slice(0, 300))
      .join('\n---\n');
    return recentOps || null;
  }

  async callCritic(action, result, ghostResult, researchCtx) {
    const args         = action.args ? JSON.stringify(action.args, null, 2) : 'none';
    const recentOps    = this._buildCriticContext();

    const researchPart = researchCtx
      ? `\n\nCURRENT RESEARCH CONTEXT (treat as ground truth over training data):\n${researchCtx}`
      : '';
    const ghostPart    = (ghostResult && ghostResult !== 'SYNTAX_OK' && ghostResult !== null)
      ? `\n\nGHOST RUNTIME RESULT:\n${ghostResult}`
      : '';
    const opsPart      = recentOps
      ? `\n\nRECENT TOOL RESULTS (project context):\n${recentOps}`
      : '';

    const res = await this.api.post('/v1/chat/completions', {
      model: this.config.roles?.critic || 'openai',
      messages: [
        {
          role: 'system',
          content: `You are the Technical Critic in the Pollina swarm. You validate a specific tool action. You do NOT audit the whole codebase. You do NOT ask for more files. You validate only what is provided.

Rules:
1. SYNTAX_ERROR from ghost runtime = automatic FAIL. Do not override.
2. Use Research Context to verify library/API usage — it is more current than your training data.
3. Use Recent Tool Results for project context when validating imports or file references.
4. For write_file / edit_file: fail on truncated code, missing imports that cannot be resolved, wrong signatures, hardcoded secrets, logic errors, placeholder comments ("// rest of code").
5. For shell_exec: fail on dangerous patterns or commands that would break the project.
6. For generate_image: fail only if prompt or parameters are obviously wrong.
7. Do NOT fail because you want to see more files. Do NOT fail because output looks brief. A list of filenames IS a complete and correct result for list_files.
8. Respond with EXACTLY one of:
   PASS
   FAIL: [specific actionable reason in one sentence]
Nothing else.${researchPart}${ghostPart}${opsPart}`
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
    if (this._isGreeting(userInput)) {
      const res = await this.api.post('/v1/chat/completions', {
        model: this.config.roles?.coder || 'qwen-coder',
        messages: [
          {
            role: 'system',
            content: `You are Pollina, an autonomous swarm agent built on Pollinations.ai by blueplaysgames3921. This is a casual conversational exchange. Reply naturally and helpfully in one or two sentences. Do not mention tools, files, or projects unless the user brings it up.`
          },
          { role: 'user', content: userInput }
        ]
      });
      const reply = res.data.choices[0].message.content;
      this.history.push({ role: 'user', content: userInput });
      this.history.push({ role: 'assistant', content: reply });
      console.log(`\n${this.colors.pollina('🐝 [Pollina]:')} ${chalk.white(reply)}\n`);
      return;
    }

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
          this.history.push({ role: 'system', content: `Safety: shell command blocked as dangerous. Choose a safer approach.` });
          continue;
        }

        if (ghostResult?.startsWith('SYNTAX_ERROR')) {
          console.log(chalk.red('SYNTAX ERROR'));
          this.history.push({ role: 'system', content: `Ghost runtime rejected write_file — fix these syntax errors before retrying:\n${ghostResult}` });
          continue;
        }

        const result = (action.server === 'local' || !action.server)
          ? await this.localTools.call(action.tool, action.args)
          : await this.mcp.callMcp(action.server, action.tool, action.args);

        console.log(chalk.green('SUCCESS'));

        const needsCritic = this.config.roles?.critic && !CRITIC_SKIP_TOOLS.has(action.tool);

        if (needsCritic) {
          const validation = await this.callCritic(action, result, ghostResult, this.latestResearchContext);
          const pass       = validation.trim().toUpperCase().startsWith('PASS');

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
CONVERSATIONAL RULE — READ FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If the user is ONLY greeting, chatting, or asking a general question:
  → Respond in plain text. Use ZERO tools. Do NOT list files. Do NOT read files.
  → You already know you are in a development environment. You do NOT need to survey it.

Examples of conversational input (no tools ever):
  "hi" / "hey" / "sup" / "what can you do" / "how are you" / "thanks"

Examples of task input (tools appropriate):
  "create a landing page" / "fix the bug in auth.js" / "add a dark mode toggle"

The difference: tasks have a clear deliverable. Greetings do not.
If there is any doubt — just respond in text. Never run tools on a hunch.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL CALL FORMAT — STRICT AND EXACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output EXACTLY ONE raw JSON object per response. No markdown fences. No wrapper text around it.

CORRECT:
{"tool": "write_file", "args": {"filePath": "src/app.js", "content": "..."}}

WRONG (code fence):
\`\`\`json
{"tool": "write_file", "args": {...}}
\`\`\`

WRONG (shorthand):
[write_file(src/app.js)]

WRONG (two objects — only first is read):
{"tool": "list_files", "args": {}} {"tool": "write_file", "args": {...}}

Wait for the system to report SUCCESS or the error before taking the next action.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE EDITING STRATEGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For SMALL CHANGES (fix a bug, add a function, change a line):
  1. read_file — see current content and line numbers
  2. edit_file — use the right operation:
       insert_after / insert_before  — add lines at a position
       delete_lines                  — remove lines from:to
       replace_lines                 — replace lines from:to with new content
       replace_text                  — find exact text anywhere and replace all occurrences

For NEW FILES or COMPLETE REWRITES:
  1. test_syntax first (for .js or .json)
  2. write_file with COMPLETE final content — never truncate, never write "// rest of code here"
  3. Truncated content = automatic Critic FAIL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY PROTOCOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Multi-file tasks → consult_architect FIRST, then follow the blueprint
2. Uncertain about API, version, or library → consult_researcher. Never guess syntax
3. Writing .js or .json → test_syntax BEFORE write_file
4. Before edit_file → read_file to see actual current lines
5. After writing a file → verify with list_files or read_file
6. After MCP image generation → capture_asset IMMEDIATELY (those URLs expire)
7. Path safety: all paths resolve from ${cwd}. No "../" to escape
8. SUCCESS confirmed only when system reports SUCCESS — never assume

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HANDLING FAILURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After a Critic FAIL:
  • Read the specific reason. Fix ONLY what was flagged.
  • Use edit_file for targeted fixes. write_file only if the whole file must change.
  • Do not retry the same content unchanged — it will fail again.

After a tool ERROR:
  • Path errors → list_files first to verify the path exists
  • Syntax errors → test_syntax before retrying write_file
  • Missing packages → shell_exec npm install

After max iterations:
  • Summarise what was completed and what still needs doing
  • The user can send a follow-up to continue

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVAILABLE TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${JSON.stringify(allTools, null, 2)}`;
  }
}

