import readline from 'readline';
import chalk from 'chalk';
import { getApi } from '../lib/api.js';
import { saveSession, updateSession, makeTitle } from '../lib/sessions.js';

function displayPreviousMessages(messages, limit = 10) {
  const visible = messages.filter(m => m.role !== 'system');
  if (!visible.length) return;

  const total  = visible.length;
  const toShow = visible.slice(-limit);

  console.log(chalk.dim('  ' + '─'.repeat(54)));
  if (total > limit) {
    console.log(chalk.dim(`  ··· ${total - limit} earlier message${total - limit > 1 ? 's' : ''} not shown ···`));
  }

  for (const msg of toShow) {
    const label = msg.role === 'user'
      ? chalk.cyan('  You:')
      : chalk.yellow('   AI:');
    const text = msg.content.length > 140
      ? msg.content.slice(0, 140).replace(/\n/g, ' ') + '…'
      : msg.content.replace(/\n/g, ' ');
    console.log(`${label} ${chalk.white(text)}`);
  }

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

export async function chatAction(options, resumedSession = null) {
  const model        = resumedSession?.model        || options?.model  || 'openai';
  const systemPrompt = resumedSession?.systemPrompt || options?.system || 'You are a helpful assistant.';
  let messages = resumedSession?.messages || [{ role: 'system', content: systemPrompt }];

  const api = getApi();

  process.stdout.write('\u001b[2J\u001b[0;0H');
  console.log(chalk.bgCyan.black.bold('  POLLINATIONS CHAT  '));
  console.log(chalk.dim(` Model: ${model} | System: ${systemPrompt.substring(0, 50)}`));

  if (resumedSession) {
    console.log(chalk.dim(` Resumed session #${resumedSession.id} — ${resumedSession.title}`));
    console.log('');
    displayPreviousMessages(messages);
  } else {
    console.log('');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.magenta('❯ ')
  });

  let busy    = false;
  let exiting = false;

  rl.prompt();

  rl.on('line', async (line) => {
    if (exiting) return;
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      exiting = true;

      const wantsSave = await promptSave(rl);

      if (wantsSave) {
        try {
          const firstUser = messages.find(m => m.role === 'user')?.content || '';
          const title     = resumedSession?.title || makeTitle(firstUser);
          const payload   = { type: 'chat', model, systemPrompt, messages, title };

          if (resumedSession) {
            await updateSession(resumedSession.id, payload);
            console.log(chalk.green(`  ✔ Session #${resumedSession.id} updated.`));
          } else {
            const id = await saveSession(payload);
            console.log(chalk.green(`  ✔ Session saved as #${id}.`));
          }
        } catch (err) {
          console.log(chalk.red(`  ✖ Failed to save session: ${err.message}`));
        }
      }

      rl.close();
      return;
    }

    if (input.toLowerCase() === 'clear') {
      messages = [{ role: 'system', content: systemPrompt }];
      process.stdout.write('\u001b[2J\u001b[0;0H');
      console.log(chalk.yellow('Conversation cleared.\n'));
      rl.prompt();
      return;
    }

    if (busy) {
      console.log(chalk.dim('  (still thinking — please wait...)'));
      return;
    }

    busy = true;
    messages.push({ role: 'user', content: input });
    process.stdout.write(chalk.dim('thinking...'));

    try {
      const response = await api.post('/v1/chat/completions', {
        messages,
        model,
        seed: Math.floor(Math.random() * 1000000)
      });

      const reply = response.data.choices[0].message.content;
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      console.log(chalk.white(reply));
      messages.push({ role: 'assistant', content: reply });
    } catch (err) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      console.log(chalk.red(`Error: ${err.response?.data?.error?.message || err.message}`));
      messages.pop();
    }

    busy = false;
    if (!exiting) rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.dim('\nSession ended.'));
    process.exit(0);
  });
}

