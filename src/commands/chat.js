import readline from 'readline';
import chalk from 'chalk';

export async function chatAction(options) {
  const model = options.model || 'openai';
  const systemPrompt = options.system || 'You are a helpful assistant.';
  let messages = [{ role: 'system', content: systemPrompt }];

  process.stdout.write('\u001b[2J\u001b[0;0H'); 
  console.log(chalk.bgCyan.black.bold('  POLLINATIONS CHAT  '));
  console.log(chalk.dim(` Model: ${model} | System: ${systemPrompt.substring(0, 30)}...\n`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.magenta('❯ ')
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }
    if (input.toLowerCase() === 'exit') rl.close();
    if (input.toLowerCase() === 'clear') {
      messages = [{ role: 'system', content: systemPrompt }];
      console.log(chalk.yellow('History cleared.'));
      rl.prompt();
      return;
    }

    messages.push({ role: 'user', content: input });
    process.stdout.write(chalk.gray('thinking...'));

    try {
      const response = await fetch(`https://text.pollinations.ai/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model, seed: Math.floor(Math.random() * 1000) })
      });
      const text = await response.text();
      
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      
      console.log(chalk.white(text));
      messages.push({ role: 'assistant', content: text });
    } catch (err) {
      console.log(chalk.red(`\nError: ${err.message}`));
    }
    rl.prompt();
  }).on('close', () => {
    console.log(chalk.yellow('\nGoodbye!'));
    process.exit(0);
  });
}

