import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

export const pythonModules = ['akshare', 'numpy', 'pandas', 'baostock', 'sklearn', 'xgboost', 'yfinance', 'exchange_calendars', 'tzdata', 'requests'];
export const pythonProbe = `import sys; assert sys.version_info >= (3, 10), 'Python >= 3.10 required'; ${pythonModules.map(name => `import ${name}`).join('; ')}`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Installation output must never contaminate the MCP JSON-RPC stdout stream.
export function run(command, args, {root, env = process.env, capture = false} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => { if (capture) output += chunk; else process.stderr.write(chunk); });
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output) : reject(Error(`${command} 退出 (${code})`)));
  });
}

// Serialize dependency preparation across simultaneous chats and launchers.
export async function withSetupLock(root, name, action, timeout = 600000) {
  const directory = join(root, '.runtime');
  await mkdir(directory, {recursive: true});
  const path = join(directory, `${name}.lock`), token = randomUUID(), deadline = Date.now() + timeout;
  for (;;) {
    let handle;
    try { handle = await open(path, 'wx'); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (handle) {
      try { await handle.writeFile(JSON.stringify({pid: process.pid, token})); return await action(); }
      finally {
        await handle.close();
        const owner = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
        if (owner.token === token) await unlink(path).catch(() => {});
      }
    }
    try {
      const text = await readFile(path, 'utf8');
      let owner;
      try { owner = JSON.parse(text); } catch {}
      let abandoned = !owner && Date.now() - (await stat(path)).mtimeMs > timeout;
      if (owner && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
        try { process.kill(owner.pid, 0); }
        catch (error) { abandoned = error.code === 'ESRCH'; }
      } else if (owner) abandoned = true;
      if (abandoned && await readFile(path, 'utf8') === text) await unlink(path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (Date.now() >= deadline) throw Error(`依赖安装等待超时：${path}。请检查正在运行的安装进程。`);
    await pause(100);
  }
}

// Resolve user-local uv even when a GUI client has a shorter PATH than its terminal.
export function uvPath(root, env = process.env, platform = process.platform) {
  if (env.FINANCE_UV) return env.FINANCE_UV;
  const executable = platform === 'win32' ? 'uv.exe' : 'uv';
  const home = env.USERPROFILE || env.HOME || homedir();
  return [join(root, '.runtime', 'uv', executable), join(home, '.local', 'bin', executable),
    join(home, '.cargo', 'bin', executable)].find(existsSync) || executable;
}

export function uvEnvironment(root, env = process.env) {
  return {...env, UV_PYTHON_INSTALL_DIR: join(root, '.runtime', 'python'), UV_PYTHON_INSTALL_REGISTRY: '0'};
}

export async function ensureNodeDependencies(root, {env = process.env, execute = run} = {}) {
  const ready = () => ['@modelcontextprotocol/sdk', 'ajv'].every(name => existsSync(join(root, 'node_modules', name, 'package.json')));
  if (ready()) return;
  await withSetupLock(root, 'node-setup', async () => {
    if (ready()) return;
    console.error('[知衡] 正在准备本地 Node 依赖…');
    // Invoke npm via Node where possible; no shell interpolation on Windows.
    const npmCli = env.npm_execpath || [join(process.execPath, '..', 'node_modules/npm/bin/npm-cli.js'),
      join(process.execPath, '../../lib/node_modules/npm/bin/npm-cli.js')].find(existsSync);
    if (npmCli) await execute(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], {root, env});
    else if (process.platform !== 'win32') await execute('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {root, env});
    else throw Error('找不到 npm-cli.js。请在插件目录运行 npm ci --ignore-scripts，或修复 Node.js/npm 安装。');
    if (!ready()) throw Error('Node 依赖未安装完整，请运行 npm ci --ignore-scripts。');
  });
}

async function fingerprint(root) {
  const contents = await Promise.all(['requirements.txt', 'uv.toml'].map(name => readFile(join(root, name))));
  return createHash('sha256').update(Buffer.concat(contents)).update(`${resolve(root)}:${process.platform}:${process.arch}`).digest('hex');
}

async function preparedPython(root, hash) {
  try {
    const state = JSON.parse(await readFile(join(root, '.runtime/python.json'), 'utf8'));
    const path = resolve(root, state.path), local = relative(join(root, '.runtime/venvs'), path);
    if (state.fingerprint === hash && !isAbsolute(local) && !local.startsWith('..') && existsSync(path)) return path;
  } catch {}
  return null;
}

export async function ensurePython(root, {env = process.env, force = false, execute = run} = {}) {
  // An explicit environment is read-only: validate it but never install into it.
  if (env.FINANCE_PYTHON) {
    await execute(env.FINANCE_PYTHON, ['-c', pythonProbe], {root, env});
    return env.FINANCE_PYTHON;
  }
  const hash = await fingerprint(root);
  const ready = !force && await preparedPython(root, hash);
  if (ready) return ready;
  return withSetupLock(root, 'python-setup', async () => {
    const existing = !force && await preparedPython(root, hash);
    if (existing) return existing;
    const uv = uvPath(root, env), uvEnv = uvEnvironment(root, env);
    try { await execute(uv, ['--version'], {root, env: uvEnv}); }
    catch (error) { throw Error(`无法运行本地 uv：${uv}。请安装 uv 或设置 FINANCE_UV 为其绝对路径。${error.message}`); }
    const environment = join(root, '.runtime/venvs/finance');
    const python = join(environment, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    console.error('[知衡] 正在用本地 uv 准备 Python 依赖，首次安装可能需要几分钟…');
    if (!existsSync(python)) await execute(uv, ['venv', '--python', env.FINANCE_PYTHON_VERSION || '3.12', environment], {root, env: uvEnv});
    await execute(uv, ['pip', 'install', '--python', python, '-r', join(root, 'requirements.txt')], {root, env: uvEnv});
    await execute(python, ['-c', pythonProbe], {root, env: uvEnv});
    // Publish state only after every dependency imports successfully.
    const file = join(root, '.runtime/python.json'), temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({path: relative(root, python).replaceAll('\\', '/'), fingerprint: hash}, null, 2));
    await rename(temporary, file);
    return python;
  });
}
