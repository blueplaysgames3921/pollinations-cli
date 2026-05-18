import chalk from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';
import path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import { getApi } from '../api.js';
import { config as configStore } from '../config-store.js';
import { ToolManager } from './tool-manager.js';
import { MCPManager } from './mcp-manager.js';
import { IndexerAgent } from './indexer.js';
import { AnalyserAgent } from './analyser.js';
import { ExecutorAgent } from './executor.js';
import process from 'process';

const COMPRESSION_THRESHOLD = 26;
const COMPRESSION_KEEP_RECENT = 8;

// Completion signals the Coder can emit to trigger Executor
const COMPLETION_PATTERNS = [
  /task\s+(is\s+)?(complete|done|finished)/i,
  /all\s+(files?\s+)?(have\s+been\s+)?(written|created|implemented)/i,
  /implementation\s+(is\s+)?(complete|done|finished)/i,
  /everything\s+is\s+(in\s+place|ready|complete|done)/i,
  /the\s+project\s+is\s+(ready|complete|done|finished)/i,
  /project\s+(setup\s+)?(is\s+)?(complete|done|ready)/i,
];

// Destructive command patterns — warn user, don't block
const DESTRUCTIVE_PATTERNS = [
  /rm\s+-rf\s+[^\s]/,
  /mkfs/,
  /dd\s+if=/,
  /format\s+[a-zA-Z]:/,
  />\s*\/dev\/[sh]d[a-z]/,
  /wipefs/,
  /shred/,
];

const CRITIC_SKIP_TOOLS = new Set([
  'list_files', 'read_file', 'test_syntax',
  'delete_file', 'move_file', 'capture_asset',
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
    this.config  = config;
    this.api     = getApi();
    this.localTools = new ToolManager();
    this.mcp        = new MCPManager();
    this.history    = (config._resumedHistory || []).slice();
    this.maxIterations = 15;

    this.researcherModel   = config.researcher?.model || config.roles?.researcher || 'gemini-search';
    this.researcherEnabled = config.researcher?.enabled !== false;
    this.latestResearchContext = null;

    // Sub-agents
    this.indexer  = new IndexerAgent({ model: config.roles?.indexer  || 'mistral' });
    this.analyser = new AnalyserAgent({ model: config.roles?.analyser || 'llama-scout' });
    this.executor = new ExecutorAgent({ dir: process.cwd() });

    this.colors = {
      pollina:    gradient(['#ffcc00', '#ff9900', '#ff6600']),
      architect:  gradient(['#00c6ff', '#0072ff']),
      critic:     gradient(['#834d9b', '#d04ed6']),
      researcher: gradient(['#00b09b', '#96c93d']),
      indexer:    gradient(['#f7971e', '#ffd200']),
      analyser:   gradient(['#56ab2f', '#a8e063']),
      executor:   gradient(['#e96c2c', '#f7b733']),
      action:     chalk.bold.yellow,
    };
  }

  async init() {
    console.clear();
    console.log(this.colors.pollina(figlet.textSync('POLLINA', { font: 'Slant' })));
    console.log(chalk.dim('  Infrastructure: Pollinations.ai | Created by: blueplaysgames3921\n'));

    const apiKey = configStore.get('apiKey');
    const cwd    = process.cwd();

    if (this.config.mcp_servers?.length) {
      for (const srv of this.config.mcp_servers) {
        const serverEnv = {
          ...(apiKey ? { POLLINATIONS_API_KEY: apiKey } : {}),
          ...(srv.env || {}),
        };
        const ok = await this.mcp.connect(srv.name, srv.command, srv.args || [], serverEnv);
        console.log(ok
          ? '  ' + chalk.green(`✔ MCP: ${srv.name}`)
          : '  ' + chalk.yellow(`⚠ MCP: ${srv.name} (failed — skipped)`)
        );
      }
      console.log('');
    }

    if (this.researcherEnabled) {
      console.log(chalk.dim(`  Researcher: ${this.researcherModel}`));
    }

    // ── Parse .env file and inject into shell environment ───────────────
    await this._loadDotEnv(cwd);

    // ── Run Indexer on startup ──────────────────────────────────────────
    process.stdout.write(chalk.dim(`  Indexer: ${this.indexer.model}  `));
    await this.indexer.index(cwd);

    // Watch for file changes — re-index automatically
    this.indexer.watch(cwd);
    this.indexer.onUpdate = (summary, changedFiles = []) => {
      this.history = this.history.filter(m => !m.content?.startsWith('[INDEXER UPDATE]'));
      const changedNote = changedFiles.length
        ? `\nFiles changed since last index: ${changedFiles.map(f => path.relative(process.cwd(), f)).join(', ')}`
        : '';
      this.history.push({
        role:    'system',
        content: `[INDEXER UPDATE]\n${summary}${changedNote}`,
      });
    };

    console.log(chalk.dim(`  Analyser:  ${this.analyser.model}`));
    console.log('');
  }

  // ── Parse .env and inject into shell tool ────────────────────────────────

  async _loadDotEnv(dir) {
    const envPath = path.join(dir, '.env');
    try {
      if (!await fs.pathExists(envPath)) return;
      const raw  = await fs.readFile(envPath, 'utf8');
      const vars = {};
      for (const line of raw.split('\n')) {
        let trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        // Handle `export VAR=value` syntax
        if (trimmed.startsWith('export ')) trimmed = trimmed.slice(7).trim();
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key) vars[key] = val;
      }
      this.localTools.setEnvVars(vars);
      const keyNames = Object.keys(vars);
      if (keyNames.length) {
        console.log(chalk.dim(`  .env loaded: ${keyNames.join(', ')}`));
      }
    } catch {
      // .env unreadable — silently skip
    }
  }

  // ── Task complexity heuristic — auto-trigger Architect ───────────────────

  _isComplexTask(input) {
    const COMPLEX_KEYWORDS = [
      'refactor', 'migrate', 'rewrite', 'redesign', 'implement', 'build',
      'create', 'scaffold', 'set up', 'integrate', 'add feature',
      'multiple files', 'all files', 'entire', 'full',
      'architecture', 'system', 'module', 'component', 'service',
    ];
    const lc = input.toLowerCase();
    const keywordHits = COMPLEX_KEYWORDS.filter(k => lc.includes(k)).length;
    const wordCount    = input.split(/\s+/).length;
    return keywordHits >= 2 || wordCount >= 25;
  }

  _isGreeting(input) {
    return GREETING_PATTERNS.some(p => p.test(input.trim()));
  }

  _isDestructive(command) {
    return DESTRUCTIVE_PATTERNS.some(p => p.test(command));
  }

  _signalsCompletion(content) {
    return COMPLETION_PATTERNS.some(p => p.test(content));
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
      } catch { continue; }
    }
    return null;
  }

  async compressContextIfNeeded() {
    if (this.history.length < COMPRESSION_THRESHOLD) return;

    const toCompress = this.history.slice(0, -COMPRESSION_KEEP_RECENT);
    const recent     = this.history.slice(-COMPRESSION_KEEP_RECENT);

    try {
      const res = await this.api.post('/v1/chat/completions', {
        model:    this.config.roles?.architect || 'mistral',
        messages: [
          {
            role:    'system',
            content: `You are a session memory compressor for an autonomous coding agent.

Extract ONLY the following from the conversation — discard all reasoning, explanation, and chatter:
- FILES CREATED: list each with its path
- FILES EDITED: list each with what changed (one sentence max per file)
- FILES DELETED: list each
- COMMANDS RUN: only those with meaningful outcomes (installs, builds, errors)
- ERRORS RESOLVED: what failed and how it was fixed (one sentence each)
- KEY DECISIONS: architectural choices, technology picks, approach decisions
- CURRENT STATE: what exists on disk right now, what is working

Output as terse bullet points under those headings. Nothing else. No padding. No meta-commentary.`,
          },
          { role: 'user', content: JSON.stringify(toCompress) },
        ],
      });
      const summary = res.data.choices[0].message.content;
      this.history = [
        { role: 'system', content: `[COMPRESSED SESSION MEMORY — decisions and changes only]\n${summary}` },
        ...recent,
      ];
    } catch {
      this.history = this.history.slice(-COMPRESSION_KEEP_RECENT);
    }
  }

  async callResearcher(query) {
    if (!this.researcherEnabled) return 'Researcher is disabled in config.';
    try {
      const res = await this.api.post('/v1/chat/completions', {
        model:    this.researcherModel,
        messages: [
          {
            role:    'system',
            content: 'You are the Pollina Researcher with grounded web search. Answer with precise, current, factual technical information. Include exact API signatures, npm package versions, and sources where relevant. Be concise and direct. No padding or preamble.',
          },
          { role: 'user', content: query },
        ],
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
      model:    this.config.roles?.architect || 'mistral',
      messages: [
        {
          role:    'system',
          content: `You are the Architect in the Pollina swarm. Produce structured technical blueprints. No implementation code.\nOutput: phases, file structure, key decisions, dependencies, pitfalls, and exact instructions for the Coder.\nIf the task requires up-to-date API knowledge, flag "NEEDS_RESEARCH: <query>" explicitly.\nConstraints:\n${constraints || '  - none'}\nContext: ${this.config.context || 'General development environment'}`,
        },
        { role: 'user', content: `Blueprint for: ${goal}` },
      ],
    });
    return res.data.choices[0].message.content;
  }

  _buildCriticContext() {
    return this.history
      .slice(-12)
      .filter(m => m.role === 'system' && m.content.startsWith('Tool Result'))
      .map(m => m.content.slice(0, 300))
      .join('\n---\n') || null;
  }

  async callCritic(action, result, ghostResult, researchCtx) {
    const args       = action.args ? JSON.stringify(action.args, null, 2) : 'none';
    const recentOps  = this._buildCriticContext();
    const researchPart = researchCtx ? `\n\nCURRENT RESEARCH CONTEXT (treat as ground truth):\n${researchCtx}` : '';
    const ghostPart    = (ghostResult && ghostResult !== 'SYNTAX_OK' && ghostResult !== null) ? `\n\nGHOST RUNTIME RESULT:\n${ghostResult}` : '';
    const opsPart      = recentOps ? `\n\nRECENT TOOL RESULTS:\n${recentOps}` : '';

    const res = await this.api.post('/v1/chat/completions', {
      model:    this.config.roles?.critic || 'openai',
      messages: [
        {
          role:    'system',
          content: `You are the Technical Critic in the Pollina swarm. Validate a specific tool action only.\n\nRules:\n1. SYNTAX_ERROR from ghost runtime = automatic FAIL.\n2. Use Research Context to verify library/API usage.\n3. Use Recent Tool Results for project context.\n4. For write_file/edit_file: fail on truncated code, missing imports, wrong signatures, hardcoded secrets, placeholder comments.\n5. For shell_exec: fail on dangerous patterns.\n6. Do NOT fail because you want more files. A list of filenames IS a complete result for list_files.\n7. Respond with EXACTLY one of:\n   PASS\n   FAIL: [specific actionable reason in one sentence]\nNothing else.${researchPart}${ghostPart}${opsPart}`,
        },
        {
          role:    'user',
          content: `Action: ${action.tool}\n\nArguments:\n${args}\n\nExecution Result:\n${result}`,
        },
      ],
    });
    return res.data.choices[0].message.content;
  }

  async ghostRun(action) {
    if (action.tool === 'write_file' && action.args?.content) {
      const ext = path.extname(action.args.filePath || '').slice(1).toLowerCase();
      if (['js', 'mjs', 'cjs', 'json'].includes(ext)) {
        try {
          return await this.localTools.call('test_syntax', {
            code: action.args.content, language: ext,
          });
        } catch { return null; }
      }
    }
    return null;
  }

  // ── Main run loop ─────────────────────────────────────────────────────────

  async run(userInput) {
    // ── Greeting check FIRST — before any expensive operations ──────────
    if (this._isGreeting(userInput)) {
      const res = await this.api.post('/v1/chat/completions', {
        model:    this.config.roles?.coder || 'qwen-coder',
        messages: [
          {
            role:    'system',
            content: 'You are Pollina, an autonomous swarm agent built on Pollinations.ai. This is a casual conversational exchange. Reply naturally in one or two sentences. Do not mention tools or files unless the user brings it up.',
          },
          { role: 'user', content: userInput },
        ],
      });
      const reply = res.data.choices[0].message.content;
      this.history.push({ role: 'user', content: userInput });
      this.history.push({ role: 'assistant', content: reply });
      console.log(`\n${this.colors.pollina('🐝 [Pollina]:')} ${chalk.white(reply)}\n`);
      return;
    }

    // ── Push user message first, then analyser context ───────────────────
    // Order matters: analyser output must follow the user message it describes
    this.history.push({ role: 'user', content: userInput });

    const analysisContext = await this.analyser.analyseMessage(userInput);
    if (analysisContext) {
      this.history.push({
        role:    'system',
        content: `[ANALYSER OUTPUT — files referenced in user message]\n${analysisContext}`,
      });
    }

    this.latestResearchContext = null;
    let iteration       = 0;
    let architectCalled = false;
    let executorRetries = 0;
    const MAX_EXECUTOR_RETRIES = 3; // prevent double-trigger

    // ── Auto-trigger Architect for complex tasks (once per run) ─────────
    if (this._isComplexTask(userInput) && !architectCalled) {
      process.stdout.write(`${this.colors.architect('🏛  [Architect]:')} ${chalk.dim('Complex task detected — planning first...\n')}`);
      const plan = await this.callArchitect(userInput);
      this.history.push({ role: 'system', content: `Architect Blueprint:\n${plan}` });
      architectCalled = true;
    }

    // Track file changes for post-run summary
    const runChanges = { created: [], edited: [], deleted: [] };

    while (iteration < this.maxIterations) {
      iteration++;
      // Don't compress away a fresh Executor failure the Coder hasn't seen yet
      const lastSys = [...this.history].reverse().find(m => m.role === 'system');
      if (!lastSys?.content?.startsWith('[EXECUTOR] Run/build failed')) {
        await this.compressContextIfNeeded();
      }

      const mcpTools     = await this.mcp.getExternalTools();
      const systemPrompt = this.buildSystemPrompt(mcpTools);

      let response;
      try {
        response = await this.api.post('/v1/chat/completions', {
          model:    this.config.roles?.coder || 'qwen-coder',
          messages: [{ role: 'system', content: systemPrompt }, ...this.history],
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

      // ── Check if Coder signals task completion ──────────────────────
      if (!action && this._signalsCompletion(content)) {
        const { confirmed } = await inquirer.prompt([{
          type:    'confirm',
          name:    'confirmed',
          message: chalk.yellow('Task marked complete. Run, preview, and lint the project?'),
          default: true,
        }]);

        if (confirmed) {
          console.log('');
          const result = await this.executor.run();

          if (!result.ok) {
            executorRetries++;
            if (executorRetries >= MAX_EXECUTOR_RETRIES) {
              console.log(chalk.red(`\n  ✖ Executor failed ${MAX_EXECUTOR_RETRIES} times — stopping. Fix the build environment and try again.`));
              break;
            }
            this.history.push({
              role:    'system',
              content: `[EXECUTOR] Run/build failed (attempt ${executorRetries}/${MAX_EXECUTOR_RETRIES}): ${result.reason}. Please fix the issues and try again. Do not signal completion again until the build passes.`,
            });
            iteration--;
            continue;
          }

          // Feed success back
          this.history.push({
            role:    'system',
            content: `[EXECUTOR] Project ran successfully.${result.url ? ` Running at ${result.url}.` : ''}`,
          });
        }

        break;
      }

      if (!action) break;

      // ── Meta tools ──────────────────────────────────────────────────
      if (action.tool === 'consult_architect') {
        process.stdout.write(`${this.colors.architect('🏛  [Architect]:')} ${chalk.dim('Planning...\n')}`);
        const plan = await this.callArchitect(action.args?.goal || userInput);
        this.history.push({ role: 'system', content: `Architect Blueprint:\n${plan}` });
        architectCalled = true;
        continue;
      }

      if (action.tool === 'consult_researcher') {
        process.stdout.write(`${this.colors.researcher('🔬 [Researcher]:')} ${chalk.dim('Searching...\n')}`);
        const findings = await this.callResearcher(action.args?.query || action.args?.goal || userInput);
        this.history.push({ role: 'system', content: `Researcher Findings:\n${findings}` });
        continue;
      }

      // ── Destructive command warning ──────────────────────────────────
      if (action.tool === 'shell_exec' && this._isDestructive(action.args?.command || '')) {
        console.log(chalk.red(`\n  ⚠ DESTRUCTIVE COMMAND: ${action.args.command}`));
        const { confirmed } = await inquirer.prompt([{
          type:    'confirm',
          name:    'confirmed',
          message: chalk.red('This command may be destructive. Allow it to run?'),
          default: false,
        }]);
        if (!confirmed) {
          this.history.push({ role: 'system', content: `User blocked destructive command: ${action.args.command}. Find a safer approach.` });
          continue;
        }
      }

      // ── Execute tool ─────────────────────────────────────────────────
      process.stdout.write(`${this.colors.action('⚙️  [Action]:')} ${chalk.bold.white(action.tool)}... `);

      try {
        const ghostResult = await this.ghostRun(action);

        if (ghostResult?.startsWith('SYNTAX_ERROR')) {
          console.log(chalk.red('SYNTAX ERROR'));
          this.history.push({ role: 'system', content: `Ghost runtime rejected write_file — fix syntax errors:\n${ghostResult}` });
          continue;
        }

        // Track file changes for post-run summary — check BEFORE tool call
        let fileExistedBefore = false;
        if (action.tool === 'write_file' && action.args?.filePath) {
          fileExistedBefore = await fs.pathExists(path.resolve(action.args.filePath)).catch(() => false);
        }

        const result = (action.server === 'local' || !action.server)
          ? await this.localTools.call(action.tool, action.args)
          : await this.mcp.callMcp(action.server, action.tool, action.args);

        console.log(chalk.green('SUCCESS'));

        // Record change after successful execution
        if (action.tool === 'write_file' && action.args?.filePath) {
          if (fileExistedBefore) runChanges.edited.push(action.args.filePath);
          else runChanges.created.push(action.args.filePath);
        } else if (action.tool === 'edit_file' && action.args?.filePath) {
          if (!runChanges.edited.includes(action.args.filePath)) runChanges.edited.push(action.args.filePath);
        } else if (action.tool === 'delete_file' && action.args?.filePath) {
          runChanges.deleted.push(action.args.filePath);
        }

        const needsCritic = this.config.roles?.critic && !CRITIC_SKIP_TOOLS.has(action.tool);

        if (needsCritic) {
          const validation = await this.callCritic(action, result, ghostResult, this.latestResearchContext);
          const pass       = validation.trim().toUpperCase().startsWith('PASS');

          this.history.push({
            role:    'system',
            content: `Tool Result [${action.tool}]: ${result}\nCritic Verdict: ${validation}`,
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

    // ── Post-run summary ─────────────────────────────────────────────────
    this._emitRunSummary(runChanges);
  }

  _emitRunSummary({ created, edited, deleted }) {
    const parts = [];
    if (created.length) parts.push(chalk.green(`Created: ${created.map(f => path.basename(f)).join(', ')}`));
    if (edited.length)  parts.push(chalk.yellow(`Edited: ${edited.map(f => path.basename(f)).join(', ')}`));
    if (deleted.length) parts.push(chalk.red(`Deleted: ${deleted.map(f => path.basename(f)).join(', ')}`));
    if (parts.length) {
      console.log('\n' + chalk.bold.dim('  ── Run summary: ') + parts.join(chalk.dim(' · ')));
    }
  }

  buildSystemPrompt(mcpTools) {
    const localDefs = this.localTools.getToolDefinitions();
    const allTools  = [
      ...localDefs, ...mcpTools,
      {
        name: 'consult_architect',
        description: 'Get a structured technical blueprint before writing code. Required for any multi-file task or architectural decision.',
        parameters: { goal: 'string' },
      },
      {
        name: 'consult_researcher',
        description: 'Fetch current verified technical information using grounded web search. Use whenever uncertain about library syntax, npm versions, API endpoints, or any factual technical detail.',
        parameters: { query: 'string' },
      },
    ];

    const cwd         = process.cwd();
    const constraints = (this.config.constraints || []).map(c => `  ► ${c.toUpperCase()}`).join('\n');
    const indexBlock  = this.indexer.getContextBlock();

    return `IDENTITY: You are Pollina — an autonomous swarm agent on Pollinations.ai.

WORKING DIRECTORY: ${cwd}

PROJECT CONTEXT:
${this.config.context || 'General development environment.'}
${indexBlock}
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
COMPLETION SIGNAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When all tasks are complete, respond with a plain text summary that includes the phrase "task is complete" or "implementation is complete". Do NOT call any tool. The system will offer to run, preview, and lint the project automatically.

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

  cleanup() {
    this.indexer.stop();
    this.executor.cleanup();
  }
}
