import fs from 'fs-extra';
import { execa } from 'execa';
import path from 'path';
import { imageAction } from '../../commands/image.js';

export class ToolManager {
  constructor() {
    this.tools = {
      read_file: async ({ filePath }) => {
        const fullPath = path.resolve(process.cwd(), filePath);
        return await fs.readFile(fullPath, 'utf8');
      },
      write_file: async ({ filePath, content }) => {
        const fullPath = path.resolve(process.cwd(), filePath);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, content);
        return `Successfully wrote to ${fullPath}`; // Changed to return full path to enforce strict verification
      },
            move_file: async ({ oldPath, newPath }) => {
        const sourcePath = path.resolve(process.cwd(), oldPath);
        const destPath = path.resolve(process.cwd(), newPath);
        await fs.ensureDir(path.dirname(destPath));
        await fs.move(sourcePath, destPath, { overwrite: true });
        return `Successfully moved/renamed ${oldPath} to ${newPath}`;
      },

      list_files: async ({ dirPath = '.' }) => {
        const fullPath = path.resolve(process.cwd(), dirPath);
        const files = await fs.readdir(fullPath);
        return files.join('\n');
      },
      shell_exec: async ({ command }) => {
        const { stdout, stderr } = await execa(command, { shell: true, reject: false });
        return stdout || stderr;
      },
      generate_image: async ({ prompt, fileName }) => {
        // 1. If no fileName is provided, create a timestamped one
        const name = fileName || `asset_${Date.now()}.png`;
        
        // 2. FORCE resolve the path relative to where Pollina is actually working
        // This ensures if she says "bee-website/hero.png", it goes exactly there.
        const fullPath = path.resolve(process.cwd(), name);
        
        // 3. Ensure the directory exists so imageAction doesn't crash
        await fs.ensureDir(path.dirname(fullPath));

        // 4. Pass the FULL ABSOLUTE PATH to imageAction
        await imageAction(prompt, { 
          output: fullPath, // Now it has the full directory context
          model: 'flux', 
          width: 1024, 
          height: 1024 
        });

        return `Image asset generated and saved successfully at: ${fullPath}`;
      },
      delete_file: async ({ filePath }) => {
        const fullPath = path.resolve(process.cwd(), filePath);
        await fs.remove(fullPath);
        return `Deleted ${fullPath}`;
      }
    };
  }

  getToolDefinitions() {
    return [
      {
        name: "read_file",
        description: "Read the content of a file",
        parameters: { filePath: "string" }
      },
      {
        name: "write_file",
        description: "Write or create a file with content",
        parameters: { filePath: "string", content: "string" }
      },
      {
        name: "list_files",
        description: "List files in a directory",
        parameters: { dirPath: "string" }
      },
      {
        name: "shell_exec",
        description: "Execute a shell command",
        parameters: { command: "string" }
      },
      {
        name: "generate_image",
        description: "Generate a visual asset for the project",
        parameters: { prompt: "string", fileName: "string" }
      }
    ];
  }

  async call(name, args) {
    if (!this.tools[name]) throw new Error(`Tool ${name} not found`);
    return await this.tools[name](args);
  }
}
