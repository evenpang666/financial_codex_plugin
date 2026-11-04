import { readFile, readdir, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspace, withWorkspaceLock } from '../lib/workspace.mjs';

const execute = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = fileURLToPath(new URL('../', import.meta.url));

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function readOptional(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function directories(path) {
  try { return (await readdir(path, {withFileTypes: true})).filter(entry => entry.isDirectory()).map(entry => join(path, entry.name)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export async function workspaceRoots(base, {all = false, codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')} = {}) {
  const roots = [resolve(base)];
  if (all) {
    roots.push(join(resolve(base), 'dist', 'financial-agent'));
    for (const marketplace of await directories(join(codexHome, 'plugins', 'cache'))) {
      roots.push(...await directories(join(marketplace, 'financial-agent')));
    }
  }
  return [...new Set(roots)];
}

export async function stopWorkspace(directory) {
  const stateFile = join(directory, '.runtime', 'web.json');
  const lockFile = join(directory, '.runtime', 'web.lock');
  // Do not create runtime directories in copies that have never been started.
  if (await readOptional(stateFile) === null && await readOptional(lockFile) === null) return 'idle';
  return withWorkspaceLock(directory, async () => {
    const original = await readOptional(stateFile);
    if (original === null) return 'cleaned';
    let state;
    try { state = JSON.parse(original); }
    catch { throw Error('运行状态文件损坏，无法核实服务身份，请检查 ' + stateFile); }
    if (!Number.isInteger(state.pid) || state.pid <= 0 || state.pid === process.pid) {
      throw Error('运行状态中的 PID 无效，未终止任何进程。');
    }
    const running = alive(state.pid);
    if (running) {
      const current = await findWorkspace(directory);
      if (!current || current.pid !== state.pid || current.instanceId !== state.instanceId) {
        throw Error('无法确认工作台身份，未终止进程；请检查 ' + stateFile);
      }
      if (process.platform === 'win32') {
        // SIGTERM alone forcibly exits Node on Windows and can leave descendants.
        try { await execute('taskkill.exe', ['/PID', String(state.pid), '/T', '/F'], {windowsHide: true, timeout: 15000}); }
        catch (error) { if (alive(state.pid)) throw error; }
      } else {
        try { process.kill(state.pid, 'SIGTERM'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      const deadline = Date.now() + 8000;
      while (alive(state.pid) && Date.now() < deadline) await pause(100);
      if (alive(state.pid)) throw Error('服务尚未退出，保留运行状态供重试。');
      // Verify that the original HTTP instance has stopped before removing state.
      let status;
      try {
        const response = await fetch(state.url + '/api/status', {signal: AbortSignal.timeout(2000)});
        status = await response.json();
      } catch (error) {
        if (!['ECONNREFUSED', 'ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      }
      if (status?.name === 'codex-financial' && status.instanceId === state.instanceId) {
        throw Error('原工作台仍在响应，保留运行状态供检查。');
      }
    }
    // Preserve a new instance's state if another launcher has replaced this file.
    if (await readOptional(stateFile) === original) await unlink(stateFile);
    return running ? 'stopped' : 'cleaned';
  }, 5000);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('用法：node scripts/stop.mjs [--all]\n默认停止当前副本；--all 同时检查分发目录与 Codex 插件缓存。\n停止服务及子进程，清理失效的运行状态和启动锁；保留研究数据与日志。');
    return;
  }
  if (args.some(arg => arg !== '--all' && arg !== '--no-open')) throw Error('未知参数；请使用 --help 查看用法。');
  const counts = {stopped: 0, cleaned: 0, idle: 0};
  for (const directory of await workspaceRoots(root, {all: args.includes('--all')})) {
    try {
      const result = await stopWorkspace(directory);
      counts[result]++;
      if (result !== 'idle') console.log(`${result === 'stopped' ? '已停止知衡服务及清理运行状态' : '已清理失效的运行状态'}：${directory}`);
    } catch (error) {
      console.error(`清理失败：${directory}\n${error.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`停止 ${counts.stopped} 个服务，清理 ${counts.cleaned} 处残留状态。研究数据与日志已保留。`);
  if (!counts.stopped && !counts.cleaned && !process.exitCode) console.log('未发现运行中的知衡服务或残留状态。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
