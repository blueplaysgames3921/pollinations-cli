import { config } from './config-store.js';
import chalk from 'chalk';

// Pollen resets every hour on the hour — use floor(epoch / 3600000) as window key
function currentWindowId() {
  return Math.floor(Date.now() / 3_600_000);
}

function minutesUntilReset() {
  const now        = Date.now();
  const nextWindow = (currentWindowId() + 1) * 3_600_000;
  return Math.ceil((nextWindow - now) / 60_000);
}

export class QuotaManager {
  constructor() {
    this.WARN_THRESHOLD = 0.8; // warn at 80% usage
  }

  _getState() {
    return config.get('quota') || { windowId: 0, used: 0, limit: null };
  }

  _setState(state) {
    config.set('quota', state);
  }

  // Roll over to new window if the hour has changed
  _ensureFreshWindow(state) {
    const windowId = currentWindowId();
    if (state.windowId !== windowId) {
      return { windowId, used: 0, limit: state.limit };
    }
    return state;
  }

  setLimit(limit) {
    const state = this._ensureFreshWindow(this._getState());
    this._setState({ ...state, limit });
  }

  getUsage() {
    const state = this._ensureFreshWindow(this._getState());
    this._setState(state);
    return state;
  }

  check() {
    const state = this._ensureFreshWindow(this._getState());
    this._setState(state);

    if (!state.limit) return true;

    const pct = state.used / state.limit;

    if (pct >= 1) {
      const mins = minutesUntilReset();
      console.log(
        chalk.red(`\n  ✖ Hourly quota reached (${state.used}/${state.limit} calls).`) +
        chalk.dim(`\n    Resets in ${mins} minute${mins !== 1 ? 's' : ''}.\n`)
      );
      return false;
    }

    if (pct >= this.WARN_THRESHOLD) {
      console.log(
        chalk.yellow(`  ⚠ Quota: ${state.used}/${state.limit} calls used this hour.`) +
        chalk.dim(` Resets in ${minutesUntilReset()} min.\n`)
      );
    }

    return true;
  }

  increment() {
    const state = this._ensureFreshWindow(this._getState());
    this._setState({ ...state, used: state.used + 1 });
  }

  status() {
    const state = this._ensureFreshWindow(this._getState());
    if (!state.limit) {
      return chalk.dim(`  Quota: unlimited (set with pollinations quota <n>)`);
    }
    const mins = minutesUntilReset();
    return chalk.dim(`  Quota: ${state.used}/${state.limit} calls this hour · resets in ${mins} min`);
  }
}

export const quota = new QuotaManager();
