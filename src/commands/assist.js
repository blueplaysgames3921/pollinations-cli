import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import readline from 'readline';
import chalk from 'chalk';
import os from 'os';
import { AgentOrchestrator } from '../lib/agent/orchestrator.js';
import { saveSession, updateSession, makeTitle } from '../lib/sessions.js';

async function findAgentFile(startDir) {
  let current = startDir;
  const home = os.homedir();
  while (current !== path.parse(current).root) {
    const candidate = path.join(current, 'AGENTS.md');
    if (await fs.pathExists(candidate)) return candidate;
    if (current === home) break;
    current = path.dirname(current);
  }
  return null;
}

const DEFAULT_CONFIG = {
  roles: { architect: 'mistral', coder: 'qwen-coder', critic: 'openai', artist: 'flux' },
  researcher: { model: 'gemini-search', enabled: true },
  constraints: [
    'Always use absolute paths for file operations',
    'Verify file existence before reading or editing',
    'Never delete the .git folder',
    'Never hardcode API keys or secrets'
  ],
  context: 'General purpose development environment',
  mcp_servers: []
};

function buildDefaultAgentsMd(dir) {
  return `# 🐝 Pollina Agent Configuration

\`\`\`yaml
roles:
  architect: "mistral"
  coder:     "qwen-coder"
  critic:    "openai"
  artist:    "flux"

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
    args:    ["-y", "@pollinations/mcp-server"]

  # GitHub — create PRs, commit code, search issues
  # Uncomment and export GITHUB_TOKEN before running
  # - name:    "github"
  #   command: "npx"
  #   args:    ["-y", "@modelcontextprotocol/server-github"]
  #   env:
  #     GITHUB_TOKEN: "\${GITHUB_TOKEN}"

  # PostgreSQL — query and manage databases
  # - name:    "postgres"
  #   command: "npx"
  #   args:    ["-y", "@modelcontextprotocol/server-postgres"]
  #   env:
  #     POSTGRES_CONNECTION_STRING: "\${POSTGRES_CONNECTION_STRING}"

  # Slack — send messages, read channels
  # - name:    "slack"
  #   command: "npx"
  #   args:    ["-y", "@modelcontextprotocol/server-slack"]
  #   env:
  #     SLACK_BOT_TOKEN: "\${SLACK_BOT_TOKEN}"
  #     SLACK_TEAM_ID:   "\${SLACK_TEAM_ID}"

  # Filesystem MCP — extended filesystem access
  # - name:    "filesystem"
  #   command: "npx"
  #   args:    ["-y", "@modelcontextprotocol/server-filesystem", "."]

context: "This project is located at ${dir}"
\`\`\`
`;
}

async function loadConfig(dir) {
  const agentPath = await findAgentFile(dir);
  let config = { ...DEFAULT_CONFIG, context: `Project at: ${dir}` };

  if (!agentPath) return { config, agentPath: null };

  const raw = await fs.readFile(agentPath, 'utf8');
  const match = raw.match(/```yaml([\s\S]*?)```/);
  if (!match) return { config, agentPath };

  try {
    const parsed = yaml.parse(match[1]);
    config = {
      ...config,
      ...parsed,
      roles:       { ...DEFAULT_CONFIG.roles,       ...(parsed.roles       || {}) },
      researcher:  { ...DEFAULT_CONFIG.researcher,  ...(parsed.researcher  || {}) },
      constraints: parsed.constraints || DEFAULT_CONFIG.constraints,
      mcp_servers: parsed.mcp_servers || DEFAULT_CONFIG.mcp_servers
    };
  } catch {
    console.error(chalk.red('  ✖ Failed to parse AGENTS.md YAML. Check your syntax.'));
  }

  return { config, agentPath };
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
    if (exists) {
      targetDir = resumedSession.directory;
    } else {
      console.log(chalk.yellow(`  ⚠ Saved directory no longer exists — using current directory.\n`));
    }
  }

  if (targetDir !== process.cwd()) {
    process.chdir(targetDir);
  }

  const { config, agentPath } = await loadConfig(targetDir);

  if (resumedSession?.config) {
    const rc = resumedSession.config;
    Object.assign(config, {
      ...rc,
      roles:       { ...config.roles,       ...(rc.roles       || {}) },
      researcher:  { ...config.researcher,  ...(rc.researcher  || {}) },
      constraints: rc.constraints || config.constraints,
      mcp_servers: rc.mcp_servers || config.mcp_servers
    });
  }

  if (resumedSession?.history?.length) {
    config._resumedHistory = resumedSession.history;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('You ❯ ')
  });

  if (!agentPath && !resumedSession && targetDir !== homeDir) {
    const answer = await new Promise(resolve => {
      rl.question(chalk.yellow('  No AGENTS.md found. Create one here? (y/n): '), resolve);
    });
    if (answer.toLowerCase() === 'y') {
      await fs.writeFile(path.join(targetDir, 'AGENTS.md'), buildDefaultAgentsMd(targetDir));
      console.log(chalk.green('  ✔ Created AGENTS.md'));
    }
  }

  const orchestrator = new AgentOrchestrator(config);
  await orchestrator.init();

  console.log(chalk.bold.yellow('  🐝 POLLINA READY'));
  if (agentPath) console.log(chalk.dim(`  Config: ${agentPath}`));
  if (resumedSession) console.log(chalk.dim(`  Resumed session #${resumedSession.id}: ${resumedSession.title}`));
  console.log(chalk.dim(`  Directory: ${targetDir}\n`));

  let firstInput = null;
  let busy = false;
  let exiting = false;

  rl.prompt();

  rl.on('line', async (line) => {
    if (exiting) return;
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === 'exit') {
      exiting = true;

      const wantsSave = await promptSave(rl);

      if (wantsSave) {
        const titleText = firstInput || orchestrator.history.find(m => m.role === 'user')?.content || '';
        const title = resumedSession?.title || makeTitle(titleText);

        const payload = {
          type: 'assist',
          title,
          directory: targetDir,
          history: orchestrator.history,
          config: {
            roles:       config.roles,
            researcher:  config.researcher,
            constraints: config.constraints,
            mcp_servers: config.mcp_servers,
            context:     config.context
          }
        };

        if (resumedSession) {
          await updateSession(resumedSession.id, payload);
          console.log(chalk.green(`  ✔ Session #${resumedSession.id} updated.`));
        } else {
          const id = await saveSession(payload);
          console.log(chalk.green(`  ✔ Session saved as #${id}.`));
        }
      }

      rl.close();
      return;
    }

    if (busy) {
      console.log(chalk.dim('  (busy — please wait for the current task to finish)'));
      return;
    }

    if (!firstInput) firstInput = input;
    busy = true;
    await orchestrator.run(input);
    busy = false;
    if (!exiting) rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.dim('\n  Session ended.'));
    process.exit(0);
  });
}

