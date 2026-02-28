import Conf from 'conf';
import path from 'path';
import os from 'os';

export const config = new Conf({
  projectName: 'pollinations',
  cwd: path.join(os.homedir(), '.pollinations')
});
