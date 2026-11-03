import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { findWorkspace, ensureWorkspace, withWorkspaceLock } from '../lib/workspace.mjs';
import { pythonPath } from '../lib/workers.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sessions = new Map();
async function until(action) {
  const deadline = Date.now() + 15000;
  do { const value = await action(); if (value) return value; await pause(100); } while (Date.now() < deadline);
  throw Error('service did not reach the expected state');
}
async function fixture(t) {
  await mkdir('.test-tmp', {recursive: true});
  const root = await mkdtemp(join(process.cwd(), '.test-tmp/workspace-'));
  const clients = new Set(); sessions.set(root, clients);
  await Promise.all(['lib', 'scripts', 'engine', 'web'].map(name => cp(name, join(root, name), {recursive: true})));
  await mkdir(join(root, 'config'));
  await writeFile(join(root, 'config/daily-push.json'), JSON.stringify({enabled: false}));
  const env = {...process.env, FINANCE_PORT: '0', FINANCE_LAN: '0', FINANCE_WEB_AUTOSTART: '1', FINANCE_PYTHON: pythonPath(process.cwd())};
  t.after(async () => {
    await Promise.all([...clients].map(client => client.close()));
    sessions.delete(root);
    const state = await findWorkspace(root);
    if (state) { process.kill(state.pid, 'SIGTERM'); await until(async () => !await findWorkspace(root)); }
    await rm(root, {recursive: true, force: true, maxRetries: 20, retryDelay: 100});
  });
  return {root, env};
}
async function connect(t, root, env, args = []) {
  const transport = new StdioClientTransport({command: process.execPath, args: [join(root, 'scripts/mcp-server.mjs'), ...args], cwd: root, env, stderr: 'pipe'});
  const client = new Client({name: 'workspace-test', version: '1.0.0'});
  sessions.get(root).add(client);
  await client.connect(transport);
  return client;
}
function command(root, env, script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, script), '--no-open'], {cwd: root, env, windowsHide: true, stdio: 'pipe'});
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output) : reject(Error(output)));
  });
}

test('MCP loads the website without a tool call, shares it across chats and survives chat closure', {timeout: 90000}, async t => {
  const {root, env} = await fixture(t);
  const clients = await Promise.all([connect(t, root, env), connect(t, root, env)]);
  assert.equal((await clients[0].listTools()).tools.length, 32);
  const first = await until(() => findWorkspace(root));
  assert.equal((await fetch(first.url + '/reports')).status, 200);
  const reports = await fetch(first.url + '/api/reports');
  assert.equal(reports.status, 200); await reports.json();
  for (const client of clients) {
    const result = await client.callTool({name: 'open_financial_workspace', arguments: {}});
    assert.equal(JSON.parse(result.content[0].text).url, first.url);
  }
  assert.match(await command(root, env, 'scripts/launch.mjs'), /知衡已运行/);
  assert.deepEqual(await findWorkspace(root), first);
  await Promise.all(clients.map(client => client.close()));
  assert.equal((await fetch(first.url + '/reports')).status, 200);
  // A stopped or crashed service is recreated instead of trusting stale state.
  await command(root, env, 'scripts/stop.mjs');
  await until(async () => !await findWorkspace(root));
  const second = await ensureWorkspace(root, env);
  assert.notEqual(second.instanceId, first.instanceId);
  assert.equal((await fetch(second.url + '/reports')).status, 200);
});

test('tools-only MCP leaves the web service stopped', {timeout: 30000}, async t => {
  const {root, env} = await fixture(t);
  const client = await connect(t, root, env, ['--tools-only']);
  assert.equal((await client.listTools()).tools.length, 21);
  assert.equal(await findWorkspace(root), null);
  await assert.rejects(readFile(join(root, '.runtime/web.json')), {code: 'ENOENT'});
});

test('web startup failure is reported without breaking MCP discovery', {timeout: 30000}, async t => {
  const {root, env} = await fixture(t);
  env.FINANCE_PYTHON = join(root, 'missing-python');
  const client = await connect(t, root, env);
  assert.equal((await client.listTools()).tools.length, 32);
  const result = await client.callTool({name: 'open_financial_workspace', arguments: {}});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /workspace\.log/);
  assert.equal(await findWorkspace(root), null);
});

test('concurrent launch locks serialize and recover an abandoned lock', async t => {
  const {root} = await fixture(t);
  await mkdir(join(root, '.runtime'));
  await writeFile(join(root, '.runtime/web.lock'), JSON.stringify({pid: 0, token: 'abandoned'}));
  let active = 0, maximum = 0;
  await Promise.all(Array.from({length: 4}, () => withWorkspaceLock(root, async () => {
    maximum = Math.max(maximum, ++active); await pause(20); active--;
  })));
  assert.equal(maximum, 1);
  await assert.rejects(readFile(join(root, '.runtime/web.lock')), {code: 'ENOENT'});
});
