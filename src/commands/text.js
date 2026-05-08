import { getApi } from '../lib/api.js';
import { resilientCall, formatError } from '../lib/api-resilience.js';
import { quota } from '../lib/quota-manager.js';
import { getSetting } from '../lib/settings.js';
import { logHistory } from './history.js';
import fs from 'fs-extra';
import chalk from 'chalk';

export async function textAction(prompt, options = {}) {
  if (!quota.check()) return;

  let textContent = prompt || '';

  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const piped = Buffer.concat(chunks).toString().trim();
    textContent = piped + (textContent ? `\n${textContent}` : '');
  } else if (options.file) {
    textContent = await fs.readFile(options.file, 'utf8');
  }

  if (!textContent && !options.image) {
    return console.error(chalk.red('  ✖ No prompt provided.'));
  }

  // Build message content — array for vision, string for plain text
  let messageContent;
  if (options.image) {
    messageContent = [
      { type: 'image_url', image_url: { url: options.image } },
      { type: 'text', text: textContent || 'Describe this image.' },
    ];
  } else {
    messageContent = textContent;
  }

  const model  = options.model  || getSetting('defaults.text.model');
  const stream = options.stream ?? getSetting('text.stream');

  await logHistory('text', { content: textContent, model });

  const api = getApi(options.key);

  try {
    if (stream) {
      let res;
      try {
        res = await api.post('/v1/chat/completions', {
          model,
          messages: [{ role: 'user', content: messageContent }],
          stream: true,
        }, { responseType: 'stream' });
      } catch (err) {
        console.error(chalk.red(`  ✖ ${formatError(err)}`));
        return;
      }

      res.data.on('data', chunk => {
        for (const line of chunk.toString().split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try { process.stdout.write(JSON.parse(data).choices[0].delta?.content || ''); } catch {}
        }
      });
      res.data.on('end', () => { process.stdout.write('\n'); quota.increment(); });

    } else {
      const res = await resilientCall(
        (apiClient, m) => apiClient.post('/v1/chat/completions', {
          model: m,
          messages: [{ role: 'user', content: messageContent }],
        }),
        api,
        model
      );
      console.log(chalk.cyan(res.data.choices[0].message.content));
      quota.increment();
    }

  } catch (err) {
    console.error(chalk.red(`  ✖ ${formatError(err)}`));
  }
}
