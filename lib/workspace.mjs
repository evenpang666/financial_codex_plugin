import { readFile, mkdir, open, unlink, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};

export async function findWorkspace(root) {
  try {
    const state = JSON.parse(await readFile(join(root, '.runtime/web.json'), 'utf8'));
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(state.url) || !alive(state.pid)) return null;
    const response = await fetch(state.url + '/api/status', {signal: AbortSignal.timeout(2000)});
    if (!response.ok) return null;
    const status = await response.json();
    if (status.name !== 'codex-financial' || (state.instanceId && status.instanceId !== state.instanceId)) return null;
    return state;
  } catch { return null; }
}

// Both MCP sessions and the manual launcher must serialize service creation.
export async function withWorkspaceLock(root, action, timeout = 75000) {
  const directory = join(root, '.runtime'), path = join(directory, 'web.lock');
  await mkdir(directory, {recursive: true});
  const token = randomUUID(), deadline = Date.now() + timeout;
  for (;;) {
    let handle;
    try { handle = await open(path, 'wx'); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (handle) {
      try {
        await handle.writeFile(JSON.stringify({pid: process.pid, token}));
        return await action();
      } finally {
        await handle.close();
        const owner = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
        if (owner.token === token) await unlink(path).catch(() => {});
      }
    }
    try {
      const text = await readFile(path, 'utf8');
      let owner;
      try { owner = JSON.parse(text); } catch {}
      const abandoned = owner ? !alive(owner.pid) : Date.now() - (await stat(path)).mtimeMs > timeout;
      if (abandoned && await readFile(path, 'utf8') === text) await unlink(path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (Date.now() >= deadline) throw Error('工作台启动锁等待超时，请检查 .runtime/workspace.log。');
    await pause(100);
  }
}

export async function ensureWorkspace(root, env = process.env) {
  const existing = await findWorkspace(root);
  if (existing) return existing;
  const directory = join(root, '.runtime');
  await mkdir(directory, {recursive: true});
  const log = await open(join(directory, 'workspace.log'), 'a');
  let child, failed;
  try {
    child = spawn(process.execPath, [join(root, 'scripts/launch.mjs'), '--no-open'], {
      cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd]
    });
    child.on('error', error => { failed = error; });
    child.on('exit', code => { if (code !== 0) failed = Error(`工作台启动进程退出 (${code})。`); });
    child.unref();
  } finally { await log.close(); }
  const deadline = Date.now() + 75000;
  do {
    const state = await findWorkspace(root);
    if (state) return state;
    if (failed) throw Error(`${failed.message} 请检查 ${join(directory, 'workspace.log')}`);
    await pause(100);
  } while (Date.now() < deadline);
  throw Error(`工作台启动超时，请检查 ${join(directory, 'workspace.log')}`);
}
