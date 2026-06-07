import chalk from 'chalk';

// Shared formatting utilities used across display commands

export function truncate(str, len) {
  if (!str) return chalk.dim('(empty)');
  const s = str.replace(/\n/g, ' ').trim();
  return s.length > len ? s.slice(0, len) + '…' : s;
}

export function fmtDate(iso) {
  if (!iso) return chalk.dim('—');
  try {
    const d    = new Date(iso);
    const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return chalk.dim(`${date} ${time}`);
  } catch {
    return chalk.dim(iso);
  }
}

export function fmtCost(n) {
  return (n || 0).toFixed(4);
}

