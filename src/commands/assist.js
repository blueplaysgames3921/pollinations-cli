import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import yaml from 'yaml';
import { AgentOrchestrator } from '../lib/agent-orchestrator.js';

export async function assistAction(options) {
  const agentFilePath = path.join(process.cwd(), 'AGENTS.md');
  let config = {
    roles: {
      coder: 'qwen-coder',
      critic: 'openai',
      architect: 'mistral',
      artist: 'flux'
    },
    rules: []
  };

  if (await fs.pathExists(agentFilePath)) {
    const content = await fs.readFile(agentFilePath, 'utf8');
    try {
      const yamlMatch = content.match(/```yaml([\s\S]*?)```/);
      if (yamlMatch) {
        const parsed = yaml.parse(yamlMatch[1]);
        config = { ...config, ...parsed };
      }
    } catch (e) {
      console.log(chalk.red('Error parsing AGENTS.md config. Using defaults.'));
    }
  }

  const orchestrator = new AgentOrchestrator(config);
  await orchestrator.start();
}

