import { getApi } from '../lib/api.js';
import { logHistory } from './history.js';
import fs from 'fs-extra';
import chalk from 'chalk';

export async function textAction(prompt, options) {
  let content = prompt;
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    content = Buffer.concat(chunks).toString() + (prompt ? `\n${prompt}` : '');
  } else if (options.file) {
    content = await fs.readFile(options.file, 'utf8');
  }

  if (!content) return console.error(chalk.red('Error: No prompt provided.'));
  
  await logHistory('text', { content, model: options.model });

  const api = getApi();
  try {
    const res = await api.post('/v1/chat/completions', {
      model: options.model || 'openai',
      messages: [{ role: 'user', content }],
      stream: !!options.stream
    }, { responseType: options.stream ? 'stream' : 'json' });

    if (options.stream) {
      res.data.on('data', chunk => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            try {
              const parsed = JSON.parse(data);
              process.stdout.write(parsed.choices[0].delta?.content || '');
            } catch (e) {}
          }
        }
      });
    } else {
      console.log(chalk.cyan(res.data.choices[0].message.content));
    }
  } catch (err) {
    console.error(chalk.red('Error:'), err.response?.data || err.message);
  }
}
