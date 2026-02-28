import axios from 'axios';
import chalk from 'chalk';

export async function textAction(prompt, options) {
  const url = 'https://gen.pollinations.ai/v1/chat/completions';
  const payload = {
    messages: [{ role: 'user', content: prompt }],
    model: options.model || 'openai',
    stream: options.stream || false
  };

  try {
    const res = await axios.post(url, payload, {
      responseType: options.stream ? 'stream' : 'json'
    });

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
    console.error(chalk.red('Error:'), err.message);
  }
}
