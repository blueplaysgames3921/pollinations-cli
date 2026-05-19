import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import readline from 'readline';
import chalk from 'chalk';
import os from 'os';
import { AgentOrchestrator } from '../lib/agent/orchestrator.js';
import { saveSession, updateSession, generateTitle, generateContextDump } from '../lib/sessions.js';

async function findAgentFile(startDir) {
  let current = startDir;
  const home  = os.homedir();
  while (current !== path.parse(current).root) {
    const candidate = path.join(current, 'AGENTS.md');
    if (await fs.pathExists(candidate)) return candidate;
    if (current === home) break;
    current = path.dirname(current);
  }
  return null;
}

// FIX: mcp_servers was [] — pollinations MCP was never launched without an
// AGENTS.md. Now it's included by default so `assist` works out of the box.
const DEFAULT_CONFIG = {
  roles: {
    architect: 'mistral',
    coder:     'qwen-coder',
    critic:    'openai',
    artist:    'flux',
    indexer:   'mistral',
    analyser:  'llama-scout',
    executor:  'openai',
  },
  researcher:  { model: 'gemini-search', enabled: true },
  constraints: [
    'Always use absolute paths for file operations',
    'Verify file existence before reading or editing',
    'Never delete the .git folder',
    'Never hardcode API keys or secrets',
  ],
  context:     'General purpose development environment',
  mcp_servers: [
    { name: 'pollinations', command: 'npx', args: ['-y', '@pollinations_ai/mcp'] },
  ],
};

function buildDefaultAgentsMd(dir) {
  return `# 🐝 Pollina Agent Configuration

Edit this file to configure Pollina's roles, constraints, researcher settings, and MCP servers.
Changes take effect the next time you run \`pollinations assist\`.

\`\`\`yaml
roles:
  architect: "mistral"      # blueprints multi-file plans before coding starts
  coder:     "qwen-coder"   # executes tasks, writes files, runs shell commands
  critic:    "openai"       # validates every write/exec before it lands on disk
  artist:    "flux"         # default image model for generate_image tool
  indexer:   "mistral"      # reads project on startup, feeds structured summary to Coder
  analyser:  "llama-scout"  # reads files/images mentioned in chat, describes them for Coder
  executor:  "openai"       # installs deps, lints, tests, and runs/previews on task complete

researcher:
  model:   "gemini-search"
  enabled: true

constraints:
  - "Never delete the .git folder"
  - "Always use ESM (import/export) instead of CommonJS"
  - "Document every new function with JSDoc"
  - "Never hardcode API keys or secrets — use environment variables"
  - "Run npm install after modifying package.json dependencies"

mcp_servers:
  - name:    "pollinations"
    command: "npx"
    args:    ["-y", "@pollinations_ai/mcp"]

  # GitHub — create PRs, commit code, search issues
  # - name:    "github"
  #   command: "npx"
  #   args:    ["-y", "@modelcontextprotocol/server-github"]
  #   env:
  #     GITHUB_TOKEN: "\${GITHUB_TOKEN}"

context: "This project is located at ${dir}"
\`\`\`
`;
}

async function loadConfig(dir) {
  const agentPath = await findAgentFile(dir);

  // Deep-copy defaults so mutations don't bleed between calls
  const config = {
    ...DEFAULT_CONFIG,
    roles:       { ...DEFAULT_CONFIG.roles },
    researcher:  { ...DEFAULT_CONFIG.researcher },
    constraints: [...DEFAULT_CONFIG.constraints],
    mcp_servers: DEFAULT_CONFIG.mcp_servers.map(s => ({ ...s, args: [...s.args] })),
    context:     `Project at: ${dir}`
  };

  if (!agentPath) return { config, agentPath: null };

  const raw = await fs.readFile(agentPath, 'utf8');
  // FIX: normalise Windows CRLF → LF so the regex and YAML parser work on
  // files authored on Windows, which would otherwise fail silently.
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const match      = normalized.match(/```yaml([\s\S]*?)```/);

  if (!match) {
    console.log(chalk.yellow(`  ⚠ AGENTS.md found but no \`\`\`yaml block detected — using defaults.`));
    return { config, agentPath };
  }

  try {
    const parsed = yaml.parse(match[1]);
    if (!parsed || typeof parsed !== 'object') throw new Error('YAML did not parse to an object');

    if (parsed.roles)                        Object.assign(config.roles,      parsed.roles);
    if (parsed.researcher)                   Object.assign(config.researcher, parsed.researcher);
    if (parsed.constraints)                  config.constraints = parsed.constraints;
    if (Array.isArray(parsed.mcp_servers))   config.mcp_servers = parsed.mcp_servers;
    if (parsed.context)                      config.context     = parsed.context;
  } catch (err) {
    console.error(chalk.red(`  ✖ Failed to parse AGENTS.md YAML: ${err.message}`));
    console.error(chalk.dim('  Using defaults. Validate your YAML at https://yamlchecker.com'));
  }

  return { config, agentPath };
}

function displaySessionRecap(history) {
  if (!history?.length) return;
  const userMessages = history.filter(m => m.role === 'user');
  const lastUser     = userMessages[userMessages.length - 1]?.content || '';
  const preview      = lastUser.length > 80 ? lastUser.slice(0, 80) + '…' : lastUser;
  console.log(chalk.dim('  ' + '─'.repeat(54)));
  console.log(chalk.dim(`  Session history: ${history.length} messages, ${userMessages.length} tasks`));
  if (preview) console.log(chalk.dim(`  Last task: "${preview}"`));
  console.log(chalk.dim('  ' + '─'.repeat(54)));
  console.log('');
}

function promptSave(rl) {
  return new Promise(resolve => {
    rl.resume();
    rl.question(chalk.cyan('\nSave this session? (Y/n): '), ans => {
      resolve(ans.trim().toLowerCase() !== 'n');
    });
  });
}

export async function assistAction(resumedSession = null) {
  const homeDir = os.homedir();

  let targetDir = process.cwd();
  if (resumedSession?.directory) {
    const exists = await fs.pathExists(resumedSession.directory);
    targetDir = exists ? resumedSession.directory : targetDir;
    if (!exists) console.log(chalk.yellow(`  ⚠ Saved directory no longer exists — using current directory.\n`));
  }

  if (targetDir !== process.cwd()) process.chdir(targetDir);

  let { config, agentPath } = await loadConfig(targetDir);

  if (resumedSession?.config) {
    const rc = resumedSession.config;
    if (rc.roles)       Object.assign(config.roles,      rc.roles);
    if (rc.researcher)  Object.assign(config.researcher, rc.researcher);
    if (rc.constraints) config.constraints = rc.constraints;
    if (rc.mcp_servers) config.mcp_servers = rc.mcp_servers;
    if (rc.context)     config.context     = rc.context;
  }

  if (resumedSession?.history?.length) config._resumedHistory = resumedSession.history;

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('You ❯ ')
  });

  if (!agentPath && !resumedSession && targetDir !== homeDir) {
    const answer = await new Promise(resolve => {
      rl.question(chalk.yellow('  No AGENTS.md found. Create one here? (y/n): '), resolve);
    });
    if (answer.trim().toLowerCase() === 'y') {
      await fs.writeFile(path.join(targetDir, 'AGENTS.md'), buildDefaultAgentsMd(targetDir));
      console.log(chalk.green('  ✔ Created AGENTS.md'));
      // FIX: reload so the newly written file is used in this session immediately
      ({ config, agentPath } = await loadConfig(targetDir));
    }
  }

  const orchestrator = new AgentOrchestrator(config);
  await orchestrator.init();

  console.log(chalk.bold.yellow('  🐝 POLLINA READY'));
  if (agentPath) console.log(chalk.dim(`  Config: ${agentPath}`));
  console.log(chalk.dim(`  Directory: ${targetDir}`));

  if (resumedSession) {
    console.log(chalk.dim(`  Resumed session #${resumedSession.id} — ${resumedSession.title}`));
    displaySessionRecap(resumedSession.history);
  } else {
    console.log('');
  }

  let firstInput = null;
  let busy       = false;
  let exiting    = false;

  rl.prompt();

  rl.on('line', async (line) => {
    if (exiting) return;
    const input = line.trim();

    if (!input) { rl.prompt(); return; }

    if (input.toLowerCase() === 'exit') {
      exiting = true;
      const wantsSave = await promptSave(rl);

      if (wantsSave) {
        process.stdout.write(chalk.dim('  Summarising session...'));

        // AI title — immutable after first save
        const title = resumedSession?.title
          || await generateTitle(orchestrator.history, targetDir, 'assist');

        // AI context dump
        const contextDump = await generateContextDump(orchestrator.history, 'assist');

        process.stdout.write(chalk.green(' done\n'));

        const payload = {
          type: 'assist', title, directory: targetDir,
          history: orchestrator.history,
          contextDump: contextDump || undefined,
          config: {
            roles: config.roles, researcher: config.researcher,
            constraints: config.constraints, mcp_servers: config.mcp_servers,
            context: config.context,
          },
        };

        if (resumedSession) {
          await updateSession(resumedSession.id, payload);
          console.log(chalk.green(`  ✔ Session #${resumedSession.id} updated — "${title}"`));
        } else {
          const id = await saveSession(payload);
          console.log(chalk.green(`  ✔ Session saved as #${id} — "${title}"`));
        }
      }

      rl.close();
      return;
    }

    if (busy) { console.log(chalk.dim('  (busy — please wait)')); return; }

    if (!firstInput) firstInput = input;
    busy = true;
    await orchestrator.run(input);
    busy = false;
    if (!exiting) rl.prompt();
  });

  rl.on('close', () => {
    orchestrator.cleanup();
    console.log(chalk.dim('\n  Session ended.'));
    process.exit(0);
  });
}

