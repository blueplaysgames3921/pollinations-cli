import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { execa } from 'execa';
import ora from 'ora';
import net from 'net';

// ── Project type detectors ────────────────────────────────────────────────────

async function detectProjectType(dir) {
  const has  = async (f) => fs.pathExists(path.join(dir, f));
  const read = async (f) => {
    try { return await fs.readFile(path.join(dir, f), 'utf8'); } catch { return ''; }
  };

  // Android
  if (await has('AndroidManifest.xml') || await has('build.gradle') || await has('app/build.gradle')) {
    return 'android';
  }

  // iOS
  if (await has('Podfile') || (await has('Info.plist'))) return 'ios';

  // Read package.json for JS/TS projects
  const pkgRaw = await read('package.json');
  if (pkgRaw) {
    let pkg = {};
    try { pkg = JSON.parse(pkgRaw); } catch {}
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const scripts = pkg.scripts || {};

    if (deps['discord.js'] || deps['discord-api-types'])        return 'bot-discord';
    if (deps['telegraf'] || deps['grammy'] || deps['node-telegram-bot-api']) return 'bot-telegram';
    if (deps['@slack/bolt'] || deps['@slack/web-api'])          return 'bot-slack';
    if (deps['electron'])                                         return 'electron';
    if (deps['react-native'] || deps['expo'])                    return 'react-native';
    if (deps['next'] || deps['nuxt'] || deps['@nuxtjs/nuxt'])    return 'web-framework';
    if (deps['vite'] || deps['create-vite'])                     return 'web-vite';
    if (deps['react'] || deps['vue'] || deps['svelte'])          return 'web-frontend';
    if (deps['express'] || deps['fastify'] || deps['koa'] || deps['hapi']) return 'web-server';
    if (scripts['start'] || scripts['dev'])                      return 'node-generic';
  }

  // Python
  const pyFiles = await has('pyproject.toml') || await has('requirements.txt') || await has('setup.py');
  if (pyFiles) {
    const req = await read('requirements.txt');
    const pyp = await read('pyproject.toml');
    const combined = req + pyp;
    if (/discord/.test(combined))   return 'bot-discord-py';
    if (/python-telegram/.test(combined)) return 'bot-telegram-py';
    if (/flask|fastapi|django/.test(combined)) return 'web-server-py';
    return 'python-generic';
  }

  // Go
  if (await has('go.mod')) return 'go-generic';

  // Rust
  if (await has('Cargo.toml')) return 'rust-generic';

  // Docker
  if (await has('docker-compose.yml') || await has('Dockerfile')) return 'docker';

  return 'unknown';
}

// ── Find a free port ──────────────────────────────────────────────────────────

function findFreePort(start = 3000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(start, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(findFreePort(start + 1)));
  });
}

// ── Terminal hyperlink ────────────────────────────────────────────────────────

function hyperlink(url, label) {
  return `\u001b]8;;${url}\u0007${label}\u001b]8;;\u0007`;
}

// ── Install dependencies ──────────────────────────────────────────────────────

async function installDeps(dir, type, spinner) {
  const run = (cmd, args, opts = {}) =>
    execa(cmd, args, { cwd: dir, reject: false, timeout: 300_000, ...opts });

  spinner.text = 'Installing dependencies...';

  // JS/TS
  if (type.startsWith('web') || type.startsWith('node') || type.startsWith('bot-discord') || type.startsWith('bot-telegram') || type.startsWith('bot-slack') || type === 'electron' || type === 'react-native') {
    // Use npm, yarn, or pnpm depending on lockfile
    const useYarn = await fs.pathExists(path.join(dir, 'yarn.lock'));
    const usePnpm = await fs.pathExists(path.join(dir, 'pnpm-lock.yaml'));
    const pm = usePnpm ? 'pnpm' : useYarn ? 'yarn' : 'npm';
    const { exitCode, stderr } = await run(pm, ['install'], { shell: false });
    if (exitCode !== 0) return { ok: false, error: stderr };
    return { ok: true, pm };
  }

  // Python
  if (type.startsWith('python') || type.startsWith('bot-discord-py') || type.startsWith('bot-telegram-py') || type === 'web-server-py') {
    const hasPip = await run('pip', ['--version']);
    if (hasPip.exitCode !== 0) return { ok: false, error: 'pip not found' };
    if (await fs.pathExists(path.join(dir, 'requirements.txt'))) {
      const { exitCode, stderr } = await run('pip', ['install', '-r', 'requirements.txt', '--break-system-packages']);
      if (exitCode !== 0) return { ok: false, error: stderr };
    } else if (await fs.pathExists(path.join(dir, 'pyproject.toml'))) {
      const { exitCode, stderr } = await run('pip', ['install', '-e', '.', '--break-system-packages']);
      if (exitCode !== 0) return { ok: false, error: stderr };
    }
    return { ok: true, pm: 'pip' };
  }

  // Go
  if (type === 'go-generic') {
    const { exitCode, stderr } = await run('go', ['mod', 'download']);
    if (exitCode !== 0) return { ok: false, error: stderr };
    return { ok: true, pm: 'go' };
  }

  // Rust
  if (type === 'rust-generic') {
    // cargo build handles deps automatically
    return { ok: true, pm: 'cargo' };
  }

  return { ok: true, pm: null };
}

// ── Lint ──────────────────────────────────────────────────────────────────────

async function lint(dir, type) {
  const run = (cmd, args) =>
    execa(cmd, args, { cwd: dir, reject: false, timeout: 60_000 });

  const results = [];

  if (type.startsWith('web') || type.startsWith('node') || type.startsWith('bot-discord') || type.startsWith('bot-slack') || type.startsWith('bot-telegram') || type === 'electron' || type === 'react-native') {
    const pkgRaw = await fs.readFile(path.join(dir, 'package.json'), 'utf8').catch(() => '{}');
    const pkg    = JSON.parse(pkgRaw);
    if (pkg.scripts?.lint) {
      const { stdout, stderr, exitCode } = await run('npm', ['run', 'lint']);
      results.push({ tool: 'eslint (npm run lint)', ok: exitCode === 0, output: (stdout + stderr).trim().slice(0, 2000) });
    } else {
      // Try eslint directly
      const { stdout, stderr, exitCode } = await run('npx', ['--yes', 'eslint', '.', '--ext', '.js,.ts,.jsx,.tsx', '--max-warnings', '0']);
      results.push({ tool: 'eslint', ok: exitCode === 0, output: (stdout + stderr).trim().slice(0, 2000) });
    }
  }

  if (type.startsWith('python') || type === 'web-server-py') {
    const { stdout, stderr, exitCode } = await run('python', ['-m', 'pylint', '--errors-only', '.']);
    results.push({ tool: 'pylint', ok: exitCode === 0, output: (stdout + stderr).trim().slice(0, 2000) });
  }

  if (type === 'rust-generic') {
    const { stdout, stderr, exitCode } = await run('cargo', ['clippy', '--', '-D', 'warnings']);
    results.push({ tool: 'clippy', ok: exitCode === 0, output: (stdout + stderr).trim().slice(0, 2000) });
  }

  if (type === 'go-generic') {
    const { stdout, stderr, exitCode } = await run('go', ['vet', './...']);
    results.push({ tool: 'go vet', ok: exitCode === 0, output: (stdout + stderr).trim().slice(0, 2000) });
  }

  return results;
}

// ── Run tests ─────────────────────────────────────────────────────────────────

async function runTests(dir, type) {
  const run = (cmd, args) =>
    execa(cmd, args, { cwd: dir, reject: false, timeout: 120_000 });

  if (type.startsWith('web') || type.startsWith('node') || type.startsWith('bot')) {
    const pkgRaw = await fs.readFile(path.join(dir, 'package.json'), 'utf8').catch(() => '{}');
    const pkg    = JSON.parse(pkgRaw);
    if (!pkg.scripts?.test || pkg.scripts.test === 'echo \\"Error: no test specified\\"') return null;
    const { stdout, stderr, exitCode } = await run('npm', ['test', '--', '--passWithNoTests']);
    return { ok: exitCode === 0, output: (stdout + stderr).trim().slice(0, 2000) };
  }

  if (type.startsWith('python')) {
    const { stdout, stderr, exitCode } = await run('python', ['-m', 'pytest', '--tb=short', '-q']);
    return { ok: exitCode === 0, output: (stdout + stderr).trim().slice(0, 2000) };
  }

  if (type === 'rust-generic') {
    const { stdout, stderr, exitCode } = await run('cargo', ['test']);
    return { ok: exitCode === 0, output: (stdout + stderr).trim().slice(0, 2000) };
  }

  if (type === 'go-generic') {
    const { stdout, stderr, exitCode } = await run('go', ['test', './...']);
    return { ok: exitCode === 0, output: (stdout + stderr).trim().slice(0, 2000) };
  }

  return null;
}

// ── Main Executor class ───────────────────────────────────────────────────────

export class ExecutorAgent {
  constructor({ dir } = {}) {
    this.dir    = dir || process.cwd();
    this._proc  = null; // running child process (for cleanup)
  }

  // Called by orchestrator when Coder signals task complete
  async run() {
    const spinner = ora('').start();

    console.log(chalk.bold.yellow('\n\n  🚀 [Executor] Task marked complete.'));
    console.log('');

    // ── Detect project type ─────────────────────────────────────────────
    spinner.text = 'Detecting project type...';
    const type   = await detectProjectType(this.dir);
    spinner.succeed(chalk.dim(`  Project type: ${type}`));

    if (type === 'unknown') {
      console.log(chalk.yellow('  ⚠ Could not detect project type. Skipping install and run.'));
      return { ok: false, reason: 'unknown project type' };
    }

    // ── Install dependencies ────────────────────────────────────────────
    spinner.start('Installing dependencies...');
    const install = await installDeps(this.dir, type, spinner);
    if (!install.ok) {
      spinner.fail(chalk.red(`  Install failed: ${install.error?.slice(0, 200)}`));
      return { ok: false, reason: `install failed: ${install.error}` };
    }
    spinner.succeed(chalk.green(`  Dependencies installed${install.pm ? ` (${install.pm})` : ''}`));

    // ── Lint ────────────────────────────────────────────────────────────
    spinner.start('Linting...');
    const lintResults = await lint(this.dir, type);
    for (const r of lintResults) {
      if (r.ok) {
        spinner.succeed(chalk.green(`  Lint passed (${r.tool})`));
      } else {
        spinner.fail(chalk.yellow(`  Lint warnings (${r.tool}):`));
        console.log(chalk.dim(r.output));
      }
    }

    // ── Tests ───────────────────────────────────────────────────────────
    spinner.start('Running tests...');
    const testResult = await runTests(this.dir, type);
    if (testResult) {
      if (testResult.ok) {
        spinner.succeed(chalk.green('  Tests passed'));
      } else {
        spinner.fail(chalk.red('  Tests failed:'));
        console.log(chalk.dim(testResult.output));
        return { ok: false, reason: 'tests failed', lintResults, testResult };
      }
    } else {
      spinner.info(chalk.dim('  No tests found — skipping'));
    }

    // ── Run / preview ───────────────────────────────────────────────────
    const runResult = await this._runProject(type, spinner);

    return {
      ok:          runResult.ok,
      type,
      lintResults,
      testResult,
      ...runResult,
    };
  }

  async _runProject(type, spinner) {
    const dir = this.dir;
    const run = (cmd, args, opts = {}) =>
      execa(cmd, args, { cwd: dir, reject: false, timeout: 30_000, ...opts });

    // ── Web servers / frontends — start dev server and show URL ────────
    if (['web-framework', 'web-vite', 'web-frontend', 'web-server', 'node-generic'].includes(type)) {
      const port     = await findFreePort(3000);
      const pkgRaw   = await fs.readFile(path.join(dir, 'package.json'), 'utf8').catch(() => '{}');
      const pkg      = JSON.parse(pkgRaw);
      const hasStart = pkg.scripts?.start;
      const hasDev   = pkg.scripts?.dev;
      const script   = hasDev ? 'dev' : hasStart ? 'start' : null;

      if (!script) {
        spinner.info(chalk.dim('  No start/dev script found — skipping preview'));
        return { ok: true };
      }

      spinner.start(`Starting dev server on port ${port}...`);

      // Start in background, don't await — it runs forever
      const proc = execa('npm', ['run', script], {
        cwd: dir, env: { ...process.env, PORT: String(port) },
        reject: false, shell: false,
      });
      this._proc = proc;

      // Wait up to 10s for server to start listening
      const started = await new Promise((resolve) => {
        let resolved = false;
        const check = setInterval(async () => {
          const s = net.createConnection(port, '127.0.0.1');
          s.on('connect', () => { s.destroy(); clearInterval(check); if (!resolved) { resolved = true; resolve(true); } });
          s.on('error',   () => { s.destroy(); });
        }, 500);
        setTimeout(() => { clearInterval(check); if (!resolved) { resolved = true; resolve(false); } }, 10_000);
      });

      spinner.stop();

      if (started) {
        const url = `http://localhost:${port}`;
        console.log('');
        console.log(chalk.bold.green(`  ✔ Server running at: `) + chalk.bold.cyan(hyperlink(url, url)));
        console.log(chalk.dim('  Press Ctrl+C to stop the server.\n'));

        // Wait for the process to end (user kills it)
        await proc.catch(() => {});
      } else {
        console.log(chalk.yellow(`  ⚠ Server may not have started on port ${port}. Check logs above.`));
      }

      return { ok: true, url: `http://localhost:${port}` };
    }

    // ── Python web servers ──────────────────────────────────────────────
    if (type === 'web-server-py') {
      const port = await findFreePort(8000);
      spinner.start(`Starting Python server on port ${port}...`);

      // Detect entry point
      const candidates = ['main.py', 'app.py', 'server.py', 'run.py', 'manage.py'];
      let entry = null;
      for (const c of candidates) {
        if (await fs.pathExists(path.join(dir, c))) { entry = c; break; }
      }

      if (!entry) {
        spinner.info(chalk.dim('  No Python entry point found — skipping preview'));
        return { ok: true };
      }

      const proc = execa('python', [entry], {
        cwd: dir, env: { ...process.env, PORT: String(port) },
        reject: false,
      });
      this._proc = proc;

      await new Promise(r => setTimeout(r, 3000)); // give it 3s to start
      spinner.stop();

      const url = `http://localhost:${port}`;
      console.log(chalk.bold.green(`  ✔ Server running at: `) + chalk.bold.cyan(hyperlink(url, url)));
      console.log(chalk.dim('  Press Ctrl+C to stop.\n'));
      await proc.catch(() => {});

      return { ok: true, url };
    }

    // ── Bots — start and watch for connected confirmation ───────────────
    if (type.startsWith('bot')) {
      spinner.start('Starting bot...');

      const pkgRaw = await fs.readFile(path.join(dir, 'package.json'), 'utf8').catch(() => '{}');
      const pkg    = JSON.parse(pkgRaw);

      let cmd = ['node', ['index.js']];
      if (pkg.scripts?.start) cmd = ['npm', ['run', 'start']];
      if (type === 'bot-discord-py' || type === 'bot-telegram-py') cmd = ['python', ['bot.py']];

      const proc = execa(cmd[0], cmd[1], { cwd: dir, reject: false });
      this._proc = proc;

      // Watch stdout for success patterns
      const connected = await new Promise((resolve) => {
        let resolved = false;
        const onData = (data) => {
          const str = data.toString();
          if (/logged in|ready|connected|started|listening/i.test(str)) {
            if (!resolved) { resolved = true; resolve(true); }
          }
        };
        proc.stdout?.on('data', onData);
        proc.stderr?.on('data', onData);
        setTimeout(() => { if (!resolved) { resolved = true; resolve(false); } }, 8_000);
      });

      spinner.stop();
      if (connected) {
        console.log(chalk.bold.green(`  ✔ Bot is running and connected.`));
        console.log(chalk.dim('  Press Ctrl+C to stop.\n'));
      } else {
        console.log(chalk.yellow(`  ⚠ Bot started but connection not confirmed. Check logs.`));
      }

      await proc.catch(() => {});
      return { ok: true };
    }

    // ── Android APK ─────────────────────────────────────────────────────
    if (type === 'android') {
      spinner.start('Building Android APK (debug)...');
      const gradlew = await fs.pathExists(path.join(dir, 'gradlew')) ? './gradlew' : 'gradle';
      const { stdout, stderr, exitCode } = await execa(gradlew, ['assembleDebug'], {
        cwd: dir, reject: false, timeout: 300_000,
      });
      spinner.stop();

      if (exitCode === 0) {
        // Find the APK
        const apkPaths = [];
        const walk = async (d) => {
          const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
          for (const e of entries) {
            if (e.name === 'node_modules' || e.name === '.git') continue;
            if (e.isDirectory()) await walk(path.join(d, e.name));
            else if (e.name.endsWith('.apk')) apkPaths.push(path.join(d, e.name));
          }
        };
        await walk(dir);
        const apk = apkPaths[0];
        if (apk) {
          console.log(chalk.bold.green(`  ✔ APK built: `) + chalk.cyan(path.relative(dir, apk)));
        } else {
          console.log(chalk.green('  ✔ Build succeeded.'));
        }
        return { ok: true };
      } else {
        console.log(chalk.red('  ✖ Build failed:'));
        console.log(chalk.dim((stdout + stderr).slice(0, 1000)));
        return { ok: false, reason: 'gradle build failed' };
      }
    }

    // ── Rust / Go — build ────────────────────────────────────────────────
    if (type === 'rust-generic') {
      spinner.start('Building Rust binary...');
      const { exitCode, stderr } = await execa('cargo', ['build', '--release'], { cwd: dir, reject: false, timeout: 300_000 });
      spinner.stop();
      if (exitCode === 0) {
        console.log(chalk.green('  ✔ Rust build succeeded (target/release/)'));
        return { ok: true };
      }
      console.log(chalk.red('  ✖ Rust build failed:'));
      console.log(chalk.dim(stderr.slice(0, 1000)));
      return { ok: false, reason: 'cargo build failed' };
    }

    if (type === 'go-generic') {
      spinner.start('Building Go binary...');
      const { exitCode, stderr } = await execa('go', ['build', './...'], { cwd: dir, reject: false, timeout: 120_000 });
      spinner.stop();
      if (exitCode === 0) {
        console.log(chalk.green('  ✔ Go build succeeded'));
        return { ok: true };
      }
      console.log(chalk.red('  ✖ Go build failed:'));
      console.log(chalk.dim(stderr.slice(0, 1000)));
      return { ok: false, reason: 'go build failed' };
    }

    // ── Docker ───────────────────────────────────────────────────────────
    if (type === 'docker') {
      spinner.start('Starting Docker Compose...');
      const { exitCode, stderr } = await execa('docker', ['compose', 'up', '-d'], { cwd: dir, reject: false, timeout: 120_000 });
      spinner.stop();
      if (exitCode === 0) {
        console.log(chalk.green('  ✔ Docker Compose started'));
        return { ok: true };
      }
      console.log(chalk.red('  ✖ Docker Compose failed:'));
      console.log(chalk.dim(stderr.slice(0, 1000)));
      return { ok: false, reason: 'docker compose failed' };
    }

    spinner.info(chalk.dim('  No run strategy for this project type — skipping preview'));
    return { ok: true };
  }

  cleanup() {
    if (this._proc) {
      this._proc.kill('SIGTERM');
      this._proc = null;
    }
  }
}

