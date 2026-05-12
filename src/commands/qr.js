import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import QRCode from 'qrcode';

// QR is generated entirely locally via the 'qrcode' npm package.
// No API call, no Pollen cost, no quota check needed.

export async function qrAction(data, options = {}) {
  if (!data) {
    console.error(chalk.red('  ✖ Provide text or a URL to encode. Usage: pollinations qr <text>'));
    return;
  }

  const out    = options.output || `qr_${Date.now()}.png`;
  const format = path.extname(out).slice(1).toLowerCase() || 'png';
  const size   = parseInt(options.size) || 300;
  const margin = parseInt(options.margin) || 2;
  const dark   = options.dark  || '#000000';
  const light  = options.light || '#ffffff';

  const SUPPORTED = new Set(['png', 'svg', 'txt']);
  if (!SUPPORTED.has(format)) {
    console.error(chalk.red(`  ✖ Unsupported format: .${format}. Use png, svg, or txt.`));
    return;
  }

  const spinner = ora('Generating QR code...').start();

  try {
    const qrOpts = {
      width:         size,
      margin,
      color: { dark, light },
      errorCorrectionLevel: options.error || 'M',
    };

    if (format === 'svg') {
      const svg = await QRCode.toString(data, { ...qrOpts, type: 'svg' });
      await fs.writeFile(out, svg);
    } else if (format === 'txt') {
      const txt = await QRCode.toString(data, { type: 'terminal', small: true });
      await fs.writeFile(out, txt);
    } else {
      await QRCode.toFile(out, data, qrOpts);
    }

    spinner.succeed(chalk.green(`  ✔ QR code saved: ${out}`));

    // Print to terminal too if --print or format is txt
    if (options.print || format === 'txt') {
      const txt = await QRCode.toString(data, { type: 'terminal', small: true });
      console.log('\n' + txt);
    }

    console.log(chalk.dim(`  Data: ${data}`));
    console.log(chalk.dim(`  Size: ${size}px · Margin: ${margin} · Error correction: ${options.error || 'M'}\n`));

  } catch (err) {
    spinner.fail(chalk.red('QR generation failed.'));
    console.log(chalk.red(`  ${err.message}`));
  }
}

