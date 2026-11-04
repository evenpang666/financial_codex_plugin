import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { join, resolve, dirname } from 'node:path';
import { stopWorkspace, workspaceRoots } from '../scripts/stop.mjs';

const execute = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
async function until(action) {
  const deadline = Date.now() + 5000;
  while (!await action()) {
    if (Date.now() > deadline) throw Error('service did not stop');
    await pause(50);
  }
}
async function fixture(t) {
  const base = resolve('.test-tmp');
  await mkdir(base, {recursive: true});
  const root = await mkdtemp(join(base, 'stop-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), base);
    await rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
  });
  return root;
}
async function stateFile(root, state) {
  await mkdir(join(root, '.runtime'), {recursive: true});
  const file = join(root, '.runtime/web.json');
  await writeFile(file, JSON.stringify(state));
  return file;
}
async function service(t, root, {name = 'codex-financial', instanceId = 'test-instance'} = {}) {
  const workerCode = `import {createServer} from 'node:http';
    const server=createServer((req,res)=>res.end('worker'));
    server.listen(0,'127.0.0.1',()=>process.send({pid:process.pid,port:server.address().port}));`;
  const code = `import {createServer} from 'node:http'; import {spawn} from 'node:child_process';
    const child=spawn(process.execPath,['--input-type=module','-e',${JSON.stringify(workerCode)}],{windowsHide:true,stdio:['ignore','ignore','inherit','ipc']});
    const worker=await new Promise(resolve=>child.once('message',resolve));
    const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(${JSON.stringify({name, instanceId})}));});
    server.listen(0,'127.0.0.1',()=>process.send({pid:process.pid,url:'http://127.0.0.1:'+server.address().port,worker}));
    process.on('SIGTERM',()=>{child.kill();server.close(()=>process.exit(0));});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  let errors = ''; child.stderr.on('data', chunk => { errors += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32') await execute('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true}).catch(() => {});
      else child.kill('SIGTERM');
      await until(() => child.exitCode !== null || child.signalCode !== null);
    }
  });
  const ready = await Promise.race([
    once(child, 'message').then(([message]) => message),
    once(child, 'exit').then(() => { throw Error('fixture exited: ' + errors); })
  ]);
  await stateFile(root, {...ready, name: 'codex-financial', instanceId: 'test-instance'});
  return ready;
}

test('stopping an unused copy creates no runtime files', async t => {
  const root = await fixture(t);
  assert.equal(await stopWorkspace(root), 'idle');
  await assert.rejects(access(join(root, '.runtime')), {code: 'ENOENT'});
});

test('stale state and abandoned startup locks are cleaned; data and logs survive repeated cleanup', async t => {
  const root = await fixture(t);
  const child = spawn(process.execPath, ['-e', ''], {windowsHide: true});
  await once(child, 'exit');
  const file = await stateFile(root, {pid: child.pid, url: 'http://127.0.0.1:1', instanceId: 'old'});
  await writeFile(join(root, '.runtime/web.lock'), JSON.stringify({pid: child.pid, token: 'abandoned'}));
  await mkdir(join(root, 'data'));
  await writeFile(join(root, 'data/portfolio.json'), 'saved portfolio');
  await writeFile(join(root, '.runtime/workspace.log'), 'saved log');
  assert.equal(await stopWorkspace(root), 'cleaned');
  assert.equal(await stopWorkspace(root), 'idle');
  await assert.rejects(access(file), {code: 'ENOENT'});
  await assert.rejects(access(join(root, '.runtime/web.lock')), {code: 'ENOENT'});
  assert.equal(await readFile(join(root, 'data/portfolio.json'), 'utf8'), 'saved portfolio');
  assert.equal(await readFile(join(root, '.runtime/workspace.log'), 'utf8'), 'saved log');
});

test('confirmed service and its child stop and release their ports', {timeout: 20000}, async t => {
  const root = await fixture(t);
  const state = await service(t, root);
  assert.equal((await fetch(state.url)).status, 200);
  assert.equal((await fetch('http://127.0.0.1:' + state.worker.port)).status, 200);
  assert.equal(await stopWorkspace(root), 'stopped');
  await until(() => !alive(state.worker.pid));
  for (const port of [new URL(state.url).port, state.worker.port]) {
    await assert.rejects(fetch('http://127.0.0.1:' + port, {signal: AbortSignal.timeout(1000)}));
  }
  await assert.rejects(access(join(root, '.runtime/web.json')), {code: 'ENOENT'});
  await assert.rejects(access(join(root, '.runtime/web.lock')), {code: 'ENOENT'});
});

for (const options of [{name: 'another-service'}, {instanceId: 'another-instance'}]) {
  test('refuses to stop an unrelated or replaced service: ' + JSON.stringify(options), async t => {
    const root = await fixture(t);
    const state = await service(t, root, options);
    const original = await readFile(join(root, '.runtime/web.json'), 'utf8');
    await assert.rejects(stopWorkspace(root), /无法确认工作台身份/);
    assert.equal(alive(state.pid), true);
    assert.equal((await fetch(state.url)).status, 200);
    assert.equal(await readFile(join(root, '.runtime/web.json'), 'utf8'), original);
  });
}

test('all-copy discovery includes distribution and installed versions without touching other plugins', async t => {
  const root = await fixture(t), codexHome = join(root, 'codex-home');
  const cache = join(codexHome, 'plugins/cache');
  const versions = [join(cache, 'zhiheng-local/financial-agent/1.0.0'), join(cache, 'zhiheng-local/financial-agent/1.1.1'), join(cache, 'another-source/financial-agent/local')];
  for (const path of [...versions, join(cache, 'other/another-plugin/1.0.0')]) await mkdir(path, {recursive: true});
  assert.deepEqual(await workspaceRoots(root, {codexHome}), [root]);
  assert.deepEqual(new Set(await workspaceRoots(root, {all: true, codexHome})), new Set([root, join(root, 'dist/financial-agent'), ...versions]));
});
