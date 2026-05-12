import { getApi } from '../lib/api.js';
import { resilientCall, formatError } from '../lib/api-resilience.js';
import { quota } from '../lib/quota-manager.js';
import { getSetting } from '../lib/settings.js';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';

// Diagram types and their Mermaid keywords
const DIAGRAM_TYPES = {
  flowchart:  'flowchart TD',
  sequence:   'sequenceDiagram',
  class:      'classDiagram',
  er:         'erDiagram',
  gantt:      'gantt',
  pie:        'pie',
  mindmap:    'mindmap',
  timeline:   'timeline',
  gitgraph:   'gitGraph',
  state:      'stateDiagram-v2',
};

const SYSTEM_PROMPT = `You are a Mermaid diagram expert. Given a description, output ONLY valid Mermaid diagram syntax with no explanation, no markdown code fences, no preamble. Just raw Mermaid syntax starting with the diagram type keyword.`;

export async function diagramAction(description, options = {}) {
  if (!description) {
    console.error(chalk.red('  ✖ Provide a description. Usage: pollinations diagram <description>'));
    console.log(chalk.dim(`  Types: ${Object.keys(DIAGRAM_TYPES).join(', ')}`));
    return;
  }

  if (!quota.check()) return;

  const diagramType = options.type || 'flowchart';
  if (options.type && !DIAGRAM_TYPES[diagramType]) {
    console.error(chalk.red(`  ✖ Unknown diagram type: '${diagramType}'`));
    console.log(chalk.dim(`  Valid types: ${Object.keys(DIAGRAM_TYPES).join(', ')}`));
    return;
  }

  const model   = options.model || getSetting('defaults.text.model');
  const format  = options.format || 'mmd';
  const out     = options.output || `diagram_${Date.now()}.${format}`;

  const SUPPORTED_FORMATS = new Set(['mmd', 'svg', 'md']);
  if (!SUPPORTED_FORMATS.has(format)) {
    console.error(chalk.red(`  ✖ Unsupported format: ${format}. Use mmd, svg, or md.`));
    return;
  }

  // ── Step 1: Generate Mermaid syntax via text model ────────────────────────
  const genSpinner = ora(`Generating ${diagramType} diagram...`).start();
  const api        = getApi(options.key);

  let mermaidSyntax;

  try {
    const res = await resilientCall(
      (apiClient, m) => apiClient.post('/v1/chat/completions', {
        model: m,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: `Create a ${diagramType} diagram for: ${description}. Start with "${DIAGRAM_TYPES[diagramType]}"` },
        ],
      }),
      api,
      model,
      { type: 'text' }
    );

    mermaidSyntax = res.data.choices[0].message.content.trim();

    // Strip any accidental code fences the model added
    mermaidSyntax = mermaidSyntax
      .replace(/^```mermaid\n?/i, '')
      .replace(/^```\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    genSpinner.succeed(chalk.dim('  Mermaid syntax generated.'));
    quota.increment();

  } catch (err) {
    genSpinner.fail(chalk.red('Diagram generation failed.'));
    console.log(chalk.red(`  ${formatError(err)}`));
    return;
  }

  // ── Step 2: Save output ───────────────────────────────────────────────────
  if (format === 'mmd') {
    await fs.writeFile(out, mermaidSyntax);
    console.log(chalk.green(`  ✔ Mermaid file saved: ${out}`));
    console.log(chalk.dim(`  Render at: https://mermaid.live\n`));

  } else if (format === 'md') {
    const md = `# Diagram\n\n\`\`\`mermaid\n${mermaidSyntax}\n\`\`\`\n`;
    await fs.writeFile(out, md);
    console.log(chalk.green(`  ✔ Markdown file saved: ${out}\n`));

  } else if (format === 'svg') {
    // Render to SVG using mermaid-js/mermaid CLI if installed, else fallback to .mmd
    try {
      const { execSync } = await import('child_process');
      const tmpMmd = `${out}.tmp.mmd`;
      await fs.writeFile(tmpMmd, mermaidSyntax);
      execSync(`npx --yes @mermaid-js/mermaid-cli -i ${tmpMmd} -o ${out}`, { stdio: 'pipe' });
      await fs.remove(tmpMmd);
      console.log(chalk.green(`  ✔ SVG saved: ${out}\n`));
    } catch {
      // Fallback — save as .mmd and tell the user
      const fallback = out.slice(0, -path.extname(out).length) + '.mmd';
      await fs.writeFile(fallback, mermaidSyntax);
      console.log(chalk.yellow(`  ⚠ SVG render requires @mermaid-js/mermaid-cli.`));
      console.log(chalk.dim(`  Install: npm install -g @mermaid-js/mermaid-cli`));
      console.log(chalk.dim(`  Saved as Mermaid syntax instead: ${fallback}\n`));
    }
  }

  // Print syntax to console if --print
  if (options.print) {
    console.log(chalk.bold.cyan('\n  Mermaid syntax:\n'));
    console.log(chalk.dim(mermaidSyntax));
    console.log('');
  }
}

