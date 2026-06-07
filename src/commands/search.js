import { getApi } from '../lib/api.js';
import { resilientCall, formatError } from '../lib/api-resilience.js';
import { quota } from '../lib/quota-manager.js';
import chalk from 'chalk';
import { logHistory } from './history.js';
import ora from 'ora';

// Search-capable models — hasSearch: true per official model list
const SEARCH_MODELS = {
  'gemini-search':        'Gemini 2.5 Flash Lite Search',  // default — not paidOnly
  'perplexity-fast':      'Perplexity Sonar',
  'perplexity-reasoning': 'Perplexity Sonar Reasoning',
  'gemini':               'Gemini 3 Flash',                // isPaidOnly
  'gemini-large':         'Gemini 3.1 Pro',                // isPaidOnly
  'polly':                'Polly (alpha)',
};

const DEFAULT_SEARCH_MODEL = 'perplexity-fast';

export async function searchAction(query, options = {}) {
  if (!query) {
    console.error(chalk.red('  ✖ Provide a search query. Usage: pollinations search <query>'));
    return;
  }

  if (!quota.check()) return;

  const model = options.model || DEFAULT_SEARCH_MODEL;

  // Warn if model doesn't have search capability
  if (!SEARCH_MODELS[model]) {
    console.log(chalk.yellow(`  ⚠ '${model}' may not have web search capability.`));
    console.log(chalk.dim(`  Search-capable models: ${Object.keys(SEARCH_MODELS).join(', ')}\n`));
  }

  await logHistory('search', { query, model });

  const spinner = ora(`Searching with ${chalk.bold(model)}...`).start();
  const api     = getApi(options.key);

  const systemPrompt = options.raw
    ? 'Answer concisely using web search results. Include sources.'
    : 'You are a helpful search assistant. Use web search to find current, accurate information. Format your response clearly with the most important information first. Cite your sources inline.';

  try {
    const res = await resilientCall(
      (apiClient, m) => apiClient.post('/v1/chat/completions', {
        model: m,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: query },
        ],
      }),
      api,
      model,
      { type: 'text' }
    );

    spinner.stop();
    quota.increment();

    const answer = res.data.choices[0].message.content;

    console.log(chalk.bold.cyan(`\n  Search: ${query}\n`));
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log(chalk.white(answer));
    console.log('');

  } catch (err) {
    spinner.fail(chalk.red('Search failed.'));
    console.log(chalk.red(`  ${formatError(err)}`));

    if (!SEARCH_MODELS[model]) {
      console.log(chalk.dim(`  Try a search-capable model: pollinations search "${query}" --model gemini-search`));
    }
  }
}
