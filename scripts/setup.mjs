import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const python = process.env.FINANCE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
function run(command, args) {
  const result = spawnSync(command, args, {cwd: root, stdio: 'inherit', windowsHide: true});
  if (result.error || result.status !== 0) throw result.error || Error(`${command} failed (${result.status})`);
}
run(python, ['-m', 'venv', '.venv']);
run(join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'), ['-m', 'pip', 'install', '-r', 'requirements.txt']);
console.log('Python 数据环境已就绪。首次使用网页研究功能前请运行 codex login。插件内研究直接使用当前 Codex 会话。');
