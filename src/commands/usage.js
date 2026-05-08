import { getApi } from '../lib/api.js';
import { formatError } from '../lib/api-resilience.js';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';

// ── Helpers ───────────────────────────────────────────────────────────────────

function spendBar(cost, max, width = 20) {
  if (max === 0) return chalk.dim('░'.repeat(width));
  const filled = Math.round((cost / max) * width);
  const empty  = width - filled;
  const color  = filled > width * 0.75 ? chalk.red : filled > width * 0.4 ? chalk.yellow : chalk.green;
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

function fmtCost(n) {
  return n.toFixed(4);
}

function fmtDate(str) {
  // str is "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD"
  return str.split(' ')[0];
}

function fmtTime(str) {
  const parts = str.split(' ');
  return parts[1] ? parts[1].slice(0, 5) : '';
}

function truncate(str, len) {
  if (!str) return chalk.dim('—');
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

// ── Usage History (per-request log) ──────────────────────────────────────────

export async function usageHistoryAction(options = {}) {
  const spinner = ora('Fetching usage history...').start();
  const api     = getApi(options.key);
  const limit   = parseInt(options.limit) || 25;
  const days    = parseInt(options.days)  || 7;

  try {
    const res = await api.get('/account/usage', {
      params: { limit, days, format: 'json' }
    });

    spinner.stop();

    const records = res.data.usage || [];

    if (records.length === 0) {
      console.log(chalk.dim('\n  No usage records found for this period.\n'));
      return;
    }

    console.log(chalk.bold.cyan(`\n📋 USAGE HISTORY  `) + chalk.dim(`last ${days} days · ${records.length} requests`));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    const table = new Table({
      head: [
        chalk.gray('Date'),
        chalk.gray('Time'),
        chalk.gray('Type'),
        chalk.gray('Model'),
        chalk.gray('Source'),
        chalk.gray('Cost (USD)'),
        chalk.gray('Resp ms'),
      ],
      colWidths: [12, 7, 18, 22, 8, 12, 10],
      style: { compact: true },
    });

    for (const r of records) {
      const sourceColor = r.meter_source === 'tier' ? chalk.cyan : chalk.magenta;
      table.push([
        fmtDate(r.timestamp),
        chalk.dim(fmtTime(r.timestamp)),
        truncate(r.type, 17),
        truncate(r.model, 21),
        sourceColor(r.meter_source || '—'),
        chalk.yellow(fmtCost(r.cost_usd || 0)),
        r.response_time_ms != null ? chalk.dim(r.response_time_ms) : chalk.dim('—'),
      ]);
    }

    console.log(table.toString());

    // Summary line
    const totalCost = records.reduce((s, r) => s + (r.cost_usd || 0), 0);
    const avgResp   = records
      .filter(r => r.response_time_ms != null)
      .reduce((s, r, _, a) => s + r.response_time_ms / a.length, 0);

    console.log(
      chalk.dim(`\n  Total: `) +
      chalk.yellow(`$${fmtCost(totalCost)}`) +
      chalk.dim('  ·  Avg response: ') +
      chalk.dim(`${Math.round(avgResp)}ms`) +
      chalk.dim(`  ·  Period: last ${days} days\n`)
    );

  } catch (err) {
    spinner.fail(chalk.red('Failed to fetch usage history.'));
    const status = err.response?.status;
    if (status === 403) {
      console.log(chalk.red('  Your API key needs the account:usage permission for this command.'));
    } else {
      console.log(chalk.red(`  ${formatError(err)}`));
    }
  }
}

// ── Daily Usage (bar chart by day) ───────────────────────────────────────────

export async function usageDailyAction(options = {}) {
  const spinner = ora('Fetching daily usage...').start();
  const api     = getApi(options.key);
  const days    = parseInt(options.days) || 14;

  try {
    const res = await api.get('/account/usage/daily', {
      params: { days, format: 'json' }
    });

    spinner.stop();

    const records = res.data.usage || [];

    if (records.length === 0) {
      console.log(chalk.dim('\n  No usage data found for this period.\n'));
      return;
    }

    // Aggregate by date (collapse model rows into one per day)
    const byDate = {};
    for (const r of records) {
      const d = r.date;
      if (!byDate[d]) byDate[d] = { date: d, requests: 0, cost_usd: 0, sources: new Set() };
      byDate[d].requests += r.requests || 0;
      byDate[d].cost_usd += r.cost_usd || 0;
      if (r.meter_source) byDate[d].sources.add(r.meter_source);
    }

    const days_arr = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    const maxCost  = Math.max(...days_arr.map(d => d.cost_usd), 0.0001);
    const maxReqs  = Math.max(...days_arr.map(d => d.requests), 1);

    console.log(chalk.bold.cyan(`\n📊 DAILY USAGE  `) + chalk.dim(`last ${days} days`));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    // Bar chart
    for (const d of days_arr) {
      const bar      = spendBar(d.cost_usd, maxCost, 24);
      const reqBar   = spendBar(d.requests, maxReqs, 10);
      const sources  = [...d.sources].join('+') || '—';
      const srcColor = sources.includes('pack') || sources.includes('crypto')
        ? chalk.magenta : chalk.cyan;

      console.log(
        chalk.bold(d.date) + '  ' +
        bar + '  ' +
        chalk.yellow(`$${fmtCost(d.cost_usd)}`) +
        chalk.dim('  ') +
        reqBar + '  ' +
        chalk.dim(`${d.requests} req`) +
        chalk.dim('  ') +
        srcColor(sources)
      );
    }

    // Totals
    const totalCost = days_arr.reduce((s, d) => s + d.cost_usd, 0);
    const totalReqs = days_arr.reduce((s, d) => s + d.requests, 0);

    console.log(chalk.gray('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(
      chalk.dim('  Total: ') +
      chalk.yellow(`$${fmtCost(totalCost)}`) +
      chalk.dim('  ·  ') +
      chalk.bold(`${totalReqs}`) +
      chalk.dim(' requests  ·  ') +
      chalk.dim('█ = spend   ') +
      chalk.dim('tier=') + chalk.cyan('■') +
      chalk.dim('  pack/crypto=') + chalk.magenta('■') + '\n'
    );

    // Optional: model breakdown table
    if (options.breakdown) {
      const byModel = {};
      for (const r of records) {
        const m = r.model || 'unknown';
        if (!byModel[m]) byModel[m] = { model: m, requests: 0, cost_usd: 0 };
        byModel[m].requests += r.requests || 0;
        byModel[m].cost_usd += r.cost_usd || 0;
      }

      const modelRows = Object.values(byModel)
        .sort((a, b) => b.cost_usd - a.cost_usd)
        .slice(0, 15);

      console.log(chalk.bold.cyan('📦 TOP MODELS'));
      const modelTable = new Table({
        head: [chalk.gray('Model'), chalk.gray('Requests'), chalk.gray('Total Cost')],
      });
      for (const m of modelRows) {
        modelTable.push([
          truncate(m.model, 30),
          m.requests,
          chalk.yellow(`$${fmtCost(m.cost_usd)}`),
        ]);
      }
      console.log(modelTable.toString());
      console.log('');
    }

  } catch (err) {
    spinner.fail(chalk.red('Failed to fetch daily usage.'));
    const status = err.response?.status;
    if (status === 403) {
      console.log(chalk.red('  Your API key needs the account:usage permission for this command.'));
    } else {
      console.log(chalk.red(`  ${formatError(err)}`));
    }
  }
}

