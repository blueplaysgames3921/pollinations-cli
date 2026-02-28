import axios from 'axios';
import chalk from 'chalk';
import fs from 'fs-extra';
import { config } from '../lib/config-store.js';

export async function textAction(prompt, options) {
  let finalPrompt = prompt;

  // 1. Check for Piping (cat file | pollinations text)
  if (!process.stdin.isTTY) {
    const stdinData = await new Promise(resolve => {
      let data = '';
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data));
    });
    finalPrompt = `${stdinData}\n${prompt || ''}`;
  } 
  // 2. Check for File input
  else if (options.file) {
    finalPrompt = await fs.readFile(options.file, 'utf8');
  }

  if (!finalPrompt) return console.error(chalk.red('Error: No prompt provided.'));

  try {
    const response = await axios.post('https://text.pollinations.ai/openai/chat/completions', {
      model: options.model,
      messages: [{ role: 'user', content: finalPrompt }],
      stream: options.stream || false
    }, {
      headers: { Authorization: `Bearer ${config.get('apiKey')}` },
      responseType: options.stream ? 'stream' : 'json'
    });

    if (options.stream) {
      response.data.on('data', chunk => process.stdout.write(chunk.toString()));
    } else {
      console.log(chalk.cyan(response.data.choices[0].message.content));
    }
  } catch (err) {
    console.error(chalk.red('API Error:'), err.message);
  }
}

