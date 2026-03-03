import readline from 'readline';
import chalk from 'chalk';
import { getApi } from '../lib/api.js';

export async function chatAction(options) {
  const model = options.model || 'openai';
  const systemPrompt = options.system || 'You are a helpful assistant.';
  let messages = [{ role: 'system', content: systemPrompt }];
  
  const api = getApi();

  // UI Setup: Clear screen and show header
  process.stdout.write('\u001b[2J\u001b[0;0H'); 
  console.log(chalk.bgCyan.black.bold('  POLLINATIONS INTERACTIVE CHAT  '));
  console.log(chalk.dim(` Model: ${model} | System: ${systemPrompt.substring(0, 30)}...\n`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.magenta('❯ ')
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    
    if (!input) { 
      rl.prompt(); 
      return; 
    }
    
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      rl.close();
      return;
    }

    if (input.toLowerCase() === 'clear') {
      messages = [{ role: 'system', content: systemPrompt }];
      process.stdout.write('\u001b[2J\u001b[0;0H');
      console.log(chalk.yellow('Conversation history cleared.\n'));
      rl.prompt();
      return;
    }

    // Add user message to history
    messages.push({ role: 'user', content: input });
    
    process.stdout.write(chalk.gray('AI is thinking...'));

    try {
      // Use your getApi instance to hit the V1 endpoint
      const response = await api.post('/v1/chat/completions', {
        messages,
        model,
        seed: Math.floor(Math.random() * 1000000)
      });

      // Extract text from the OpenAI-compatible response structure
      const aiResponse = response.data.choices[0].message.content;
      
      // Clean up the "thinking..." line
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      
      // Print AI result
      console.log(chalk.white(aiResponse));
      
      // Add assistant response to history for memory
      messages.push({ role: 'assistant', content: aiResponse });

    } catch (err) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      const errorMsg = err.response?.data?.error?.message || err.message;
      console.log(chalk.red(`\nError: ${errorMsg}`));
    }
    
    rl.prompt();
  }).on('close', () => {
    console.log(chalk.yellow('\nSession ended.'));
    process.exit(0);
  });
}
