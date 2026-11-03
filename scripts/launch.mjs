import { createRuntime, root } from '../lib/runtime.mjs';
import { findWorkspace, withWorkspaceLock } from '../lib/workspace.mjs';
import { writeFile, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const stateFile = join(root, '.runtime/web.json');
let runtime, closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (runtime) {
    await runtime.close();
    const state = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}'));
    if (state.instanceId === runtime.site.instanceId) await unlink(stateFile).catch(() => {});
  }
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);

try {
  const state = await withWorkspaceLock(root, async () => {
    const existing = await findWorkspace(root);
    if (existing) return existing;
    runtime = await createRuntime({web: true});
    const state = {pid: process.pid, url: runtime.url, name: 'codex-financial', instanceId: runtime.site.instanceId};
    const temporary = stateFile + '.' + state.instanceId + '.tmp';
    await writeFile(temporary, JSON.stringify(state));
    await rename(temporary, stateFile);
    return state;
  });
  console.log(`${runtime ? '知衡 Codex 工作台' : '知衡已运行'}：${state.url}`);
  if (!process.argv.includes('--no-open')) {
    const [cmd, args] = process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', state.url]] : process.platform === 'darwin' ? ['open', [state.url]] : ['xdg-open', [state.url]];
    const child = spawn(cmd, args, {windowsHide: true, stdio: 'ignore'});
    child.on('error', () => {}); child.unref();
  }
} catch (error) {
  console.error('[知衡工作台启动失败]', error.message);
  if (runtime) await runtime.close();
  process.exit(1);
}
