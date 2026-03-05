import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import readline from 'readline';
import chalk from 'chalk';
import os from 'os';
import { AgentOrchestrator } from '../lib/agent/orchestrator.js';

async function findAgentFile(startDir) {
  let current = startDir;
  const home = os.homedir();
  while (current !== path.parse(current).root) {
    const checkPath = path.join(current, 'AGENTS.md');
    if (await fs.pathExists(checkPath)) return checkPath;
    if (current === home) break;
    current = path.dirname(current);
  }
  return null;
}

export async function assistAction() {
  const homeDir = os.homedir();
  const currentDir = process.cwd();
  const agentPath = await findAgentFile(currentDir);
  
  let config = {
    roles: { architect: 'mistral', coder: 'qwen-coder', critic: 'openai', artist: 'flux' },
    constraints: [
      "Always use absolute paths for file operations",
      "Prioritize using tools over explaining code",
      "Verify file existence before reading"
    ],
    context: 'General purpose development environment',
    mcp_servers: []
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('User ❯ ')
  });

  if (agentPath) {
    console.log(chalk.blue(`ℹ Using configuration from: ${agentPath}`));
    const fileContent = await fs.readFile(agentPath, 'utf8');
    const yamlBlock = fileContent.match(/```yaml([\s\S]*?)```/);
    if (yamlBlock) {
      try {
        const parsed = yaml.parse(yamlBlock[1]);
        config = { ...config, ...parsed };
      } catch (e) {
        console.error(chalk.red('Failed to parse AGENTS.md YAML. Check syntax.'));
      }
    }
  } else if (currentDir !== homeDir) {
    const answer = await new Promise(resolve => {
      rl.question(chalk.yellow('No AGENTS.md found. Create one in this directory? (y/n): '), resolve);
    });

    if (answer.toLowerCase() === 'y') {
      const template = `# 🐝 Pollina Agent Configuration

\`\`\`yaml
roles:
  architect: "mistral"
  coder: "qwen-coder"
  critic: "openai"
  artist: "flux"

constraints:
  - "Never delete the .git folder"
  - "Always use ESM (import/export) instead of CommonJS"
  - "Document every new function with JSDoc"

mcp_servers:
  - name: "google-search"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-google-search"]

context: "This project is located at ${currentDir}"
\`\`\`
`;
      await fs.writeFile(path.join(currentDir, 'AGENTS.md'), template);
      console.log(chalk.green('✔ Created AGENTS.md with default template.'));
      config.context = `This project is located at ${currentDir}`;
    }
  }

  const orchestrator = new AgentOrchestrator(config);
  await orchestrator.init();

  console.log(chalk.bold.yellow('\n🐝 POLLINA AGENT READY'));
  if (agentPath) console.log(chalk.dim('Reading context from AGENTS.md...\n'));

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (input.toLowerCase() === 'exit') {
      rl.close();
      return;
    }
    if (input) {
      await orchestrator.run(input);
    }
    rl.prompt();
  }).on('close', () => {
    process.exit(0);
  });
}
