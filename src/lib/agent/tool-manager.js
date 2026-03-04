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
        const output = fileName || `asset_${Date.now()}.png`;
        await imageAction(prompt, { output, model: 'flux', width: 1024, height: 1024 });
        return `Image asset generated and saved as: ${output}`;
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
