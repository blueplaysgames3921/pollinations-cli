import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import readline from 'readline';
import chalk from 'chalk';
import { AgentOrchestrator } from '../lib/agent/orchestrator.js';

export async function assistAction() {
  const agentPath = path.join(process.cwd(), 'AGENTS.md');
  let config = {
    roles: { architect: 'mistral', coder: 'qwen-coder', critic: 'openai', artist: 'flux' },
    constraints: [],
    context: 'Standard coding project',
    mcp_servers: []
  };

  if (await fs.pathExists(agentPath)) {
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
  }

  const orchestrator = new AgentOrchestrator(config);
  await orchestrator.init();

  console.log(chalk.bold.yellow('\n🐝 POLLINA AGENT READY'));
  console.log(chalk.dim('Reading context from AGENTS.md...\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('User ❯ ')
  });

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
