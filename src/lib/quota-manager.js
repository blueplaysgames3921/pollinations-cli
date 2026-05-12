import { getApi } from './api.js';
import { config } from './config-store.js';
import chalk from 'chalk';

// Real hourly tier grant maxes (Pollen)
export const TIER_GRANTS = {
  microbe: 0,
  spore:   0.01,
  seed:    0.15,
  flower:  0.4,
  nectar:  0.8,
};

function currentWindowId() {
  return Math.floor(Date.now() / 3_600_000);
}

function minutesUntilReset() {
  const now        = Date.now();
  const nextWindow = (currentWindowId() + 1) * 3_600_000;
  return Math.ceil((nextWindow - now) / 60_000);
}

// ── Local call-count quota (user-defined hard cap) ────────────────────────────
// This is a local safeguard the user sets themselves — unrelated to Pollen balance.
// It prevents accidentally hammering the API, separate from actual credit tracking.

export class QuotaManager {
  constructor() {
    this.WARN_THRESHOLD = 0.8;
  }

  _getState() {
    return config.get('quota') || { windowId: 0, used: 0, limit: null };
  }

  _setState(state) {
    config.set('quota', state);
  }

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

  // Returns false and prints message if local call cap is hit
  check() {
    const state = this._ensureFreshWindow(this._getState());
    this._setState(state);

    if (!state.limit) return true;

    const pct = state.used / state.limit;

    if (pct >= 1) {
      const mins = minutesUntilReset();
      console.log(
        chalk.red(`\n  ✖ Local call quota reached (${state.used}/${state.limit} calls this hour).`) +
        chalk.dim(`\n    Resets in ${mins} minute${mins !== 1 ? 's' : ''}.\n`)
      );
      return false;
    }

    if (pct >= this.WARN_THRESHOLD) {
      console.log(
        chalk.yellow(`  ⚠ Local quota: ${state.used}/${state.limit} calls used this hour.`) +
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
    const mins  = minutesUntilReset();
    if (!state.limit) {
      return chalk.dim(`  Local quota: unlimited · tier grant resets in ${mins} min`);
    }
    return chalk.dim(`  Local quota: ${state.used}/${state.limit} calls this hour · resets in ${mins} min`);
  }
}

export const quota = new QuotaManager();

// ── Live Pollen balance fetcher (used by profile + balance command) ───────────

export async function fetchBalance(apiKey) {
  const api = getApi(apiKey);
  const res = await api.get('/account/balance');
  return {
    tierBalance:   res.data.tierBalance   ?? 0,
    cryptoBalance: res.data.cryptoBalance ?? 0,
    packBalance:   res.data.packBalance   ?? 0,
    total() { return this.tierBalance + this.cryptoBalance + this.packBalance; },
  };
}
