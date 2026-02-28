import axios from 'axios';
import chalk from 'chalk';

export async function listModels() {
  try {
    const { data } = await axios.get('https://gen.pollinations.ai/v1/models');
    console.log(chalk.bold.green('\nAvailable Models:'));
    data.data.forEach(m => console.log(`- ${m.id}`));
  } catch (err) {
    console.log(chalk.red('Could not fetch models.'));
  }
}
