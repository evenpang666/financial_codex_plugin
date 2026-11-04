import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { ensurePython, ensureNodeDependencies, uvPath, uvEnvironment, withSetupLock } from '../lib/setup.mjs';
import { pythonPath } from '../lib/workers.mjs';
import { absoluteMcpConfig, installedRoot, portableMcpConfig, writeMcpConfig } from '../lib/mcp-config.mjs';

async function fixture(t) {
  await mkdir('.test-tmp', {recursive: true});
  const root = await mkdtemp(join(process.cwd(), '.test-tmp/install with spaces-'));
  await writeFile(join(root, 'requirements.txt'), 'requests>=2.31\n');
  await writeFile(join(root, 'uv.toml'), 'link-mode = "copy"\n');
  t.after(() => rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 100}));
  return root;
}

function uvStub(root, calls, fail = false) {
  return async (command, args, options) => {
    calls.push({command, args, options});
    if (args[0] === 'venv') {
      const python = join(args.at(-1), process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      await mkdir(dirname(python), {recursive: true});
      await writeFile(python, 'fixture');
    }
    if (fail && args[0] === 'pip') throw Error('network unavailable');
  };
}

test('uv prepares an isolated environment once across concurrent chats, then refreshes changed requirements', async t => {
  const root = await fixture(t), calls = [];
  const env = {FINANCE_UV: join(root, 'local uv'), UV_CONFIG_FILE: join(root, 'custom uv.toml'), UV_INDEX_URL: 'https://example.test/simple'};
  const options = {env, execute: uvStub(root, calls)};
  const paths = await Promise.all(Array.from({length: 4}, () => ensurePython(root, options)));
  assert.equal(new Set(paths).size, 1);
  assert.equal(calls.filter(call => call.args[0] === 'pip').length, 1);
  assert.equal(calls.filter(call => call.args[0] === 'venv').length, 1);
  assert.equal(pythonPath(root, {}), paths[0]);
  const install = calls.find(call => call.args[0] === 'pip');
  assert.equal(install.command, env.FINANCE_UV);
  assert.equal(install.options.env.UV_CONFIG_FILE, env.UV_CONFIG_FILE);
  assert.equal(install.options.env.UV_INDEX_URL, env.UV_INDEX_URL);
  assert.equal(install.options.env.UV_PYTHON_INSTALL_DIR, join(root, '.runtime/python'));
  assert.ok(!install.args.includes('--system'));
  await ensurePython(root, options);
  assert.equal(calls.filter(call => call.args[0] === 'pip').length, 1);
  await writeFile(join(root, 'requirements.txt'), 'requests>=2.32\n');
  await ensurePython(root, options);
  assert.equal(calls.filter(call => call.args[0] === 'pip').length, 2);
});

test('failed uv installation publishes no state and can be retried', async t => {
  const root = await fixture(t), calls = [], env = {FINANCE_UV: 'uv'};
  await assert.rejects(ensurePython(root, {env, execute: uvStub(root, calls, true)}), /network unavailable/);
  await assert.rejects(access(join(root, '.runtime/python.json')), {code: 'ENOENT'});
  await assert.rejects(access(join(root, '.runtime/python-setup.lock')), {code: 'ENOENT'});
  await ensurePython(root, {env, execute: uvStub(root, calls)});
  await access(join(root, '.runtime/python.json'));
});

test('an explicit Python environment is validated without uv or dependency writes', async t => {
  const root = await fixture(t), calls = [];
  const path = join(root, 'external python');
  assert.equal(await ensurePython(root, {env: {FINANCE_PYTHON: path}, execute: async (...args) => calls.push(args)}), path);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], path);
  assert.equal(calls[0][1][0], '-c');
  await assert.rejects(access(join(root, '.runtime')), {code: 'ENOENT'});
});

test('an environment copied to another installation is prepared again', async t => {
  const source = await fixture(t), target = await fixture(t), calls = [];
  await ensurePython(source, {env: {FINANCE_UV: 'uv'}, execute: uvStub(source, calls)});
  await cp(join(source, '.runtime'), join(target, '.runtime'), {recursive: true});
  await ensurePython(target, {env: {FINANCE_UV: 'uv'}, execute: uvStub(target, calls)});
  assert.equal(calls.filter(call => call.args[0] === 'pip').length, 2);
});

test('uv discovery supports user-local Windows and Ubuntu paths and explicit overrides', async t => {
  const root = await fixture(t);
  await mkdir(join(root, '.local/bin'), {recursive: true});
  await writeFile(join(root, '.local/bin/uv.exe'), 'fixture');
  await writeFile(join(root, '.local/bin/uv'), 'fixture');
  assert.equal(uvPath('/plugin', {USERPROFILE: root}, 'win32'), join(root, '.local/bin/uv.exe'));
  assert.equal(uvPath('/plugin', {HOME: root}, 'linux'), join(root, '.local/bin/uv'));
  assert.equal(uvPath(root, {FINANCE_UV: '/custom/uv'}, 'linux'), '/custom/uv');
  assert.equal(uvEnvironment(root, {UV_OFFLINE: '1'}).UV_OFFLINE, '1');
});

test('missing Node dependencies are installed once without a shell or lifecycle scripts', async t => {
  const root = await fixture(t), calls = [];
  const execute = async (command, args) => {
    calls.push({command, args});
    for (const name of ['@modelcontextprotocol/sdk', 'ajv']) {
      const directory = join(root, 'node_modules', name);
      await mkdir(directory, {recursive: true}); await writeFile(join(directory, 'package.json'), '{}');
    }
  };
  await Promise.all(Array.from({length: 3}, () => ensureNodeDependencies(root, {env: {npm_execpath: '/local npm/npm-cli.js'}, execute})));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, process.execPath);
  assert.ok(calls[0].args.includes('--ignore-scripts'));
});

test('setup recovers an abandoned lock', async t => {
  const root = await fixture(t);
  await mkdir(join(root, '.runtime'));
  await writeFile(join(root, '.runtime/python-setup.lock'), JSON.stringify({pid: 0, token: 'abandoned'}));
  assert.equal(await withSetupLock(root, 'python-setup', () => 42), 42);
});

function command(root, env, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd: root, env, windowsHide: true, stdio: 'pipe'});
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({code, stdout, stderr}));
  });
}

test('CLI installer runs marketplace/add in order; App preparation requires no Codex CLI', {timeout: 90000}, async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'scripts'));
  await mkdir(join(root, 'lib'));
  await cp('scripts/install.mjs', join(root, 'scripts/install.mjs'));
  await cp('lib/setup.mjs', join(root, 'lib/setup.mjs'));
  await cp('lib/mcp-config.mjs', join(root, 'lib/mcp-config.mjs'));
  await mkdir(join(root, '.codex-plugin'));
  await writeFile(join(root, '.codex-plugin/plugin.json'), JSON.stringify({name: 'financial-agent', version: '1.2.3'}));
  await writeFile(join(root, 'marketplace.example.json'), JSON.stringify({name: 'zhiheng-local'}));
  await writeFile(join(root, 'scripts/mcp-bootstrap.mjs'), '// fixture');
  // Stand-in package builder and Codex CLI keep this integration isolated from user configuration.
  await writeFile(join(root, 'scripts/package_plugin.py'), 'from pathlib import Path\nimport shutil\np=Path("dist/financial-agent")\np.mkdir(parents=True, exist_ok=True)\nfor name in ["scripts", ".codex-plugin"]:\n shutil.copytree(name,p/name,dirs_exist_ok=True)\nshutil.copyfile("marketplace.example.json",p/"marketplace.example.json")\n');
  await writeFile(join(root, 'plugin'), `import {appendFileSync} from 'node:fs'; import {resolve} from 'node:path'; appendFileSync('codex-calls.jsonl', JSON.stringify(process.argv.slice(2)) + '\\n'); if(process.argv.includes('--json')) console.log(JSON.stringify({installedPath:resolve('dist/financial-agent')}));`);
  for (const name of ['@modelcontextprotocol/sdk', 'ajv']) {
    const directory = join(root, 'node_modules', name);
    await mkdir(directory, {recursive: true}); await writeFile(join(directory, 'package.json'), '{}');
  }
  const env = {...process.env, FINANCE_CODEX_BIN: process.execPath, FINANCE_PYTHON: pythonPath(process.cwd()), CODEX_HOME: join(root, 'codex')};
  const cli = await command(root, env, ['scripts/install.mjs', '--cli']);
  assert.equal(cli.code, 0, cli.stderr);
  const calls = (await readFile(join(root, 'codex-calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls, [['add', '--help'], ['marketplace', 'add', join(root, 'dist/financial-agent')], ['add', 'financial-agent@zhiheng-local', '--json']]);
  assert.equal(JSON.parse(await readFile(join(root, 'dist/financial-agent/.mcp.json'), 'utf8')).mcpServers.financial.cwd, join(root, 'dist/financial-agent'));
  env.FINANCE_CODEX_BIN = join(root, 'does-not-exist.exe');
  const app = await command(root, env, ['scripts/install.mjs', '--app']);
  assert.equal(app.code, 0, app.stderr);
  assert.match(app.stdout, /Codex App/);
  assert.equal(JSON.parse(await readFile(join(root, 'dist/financial-agent/.mcp.json'), 'utf8')).mcpServers.financial.cwd,
    installedRoot({marketplace:'zhiheng-local', name:'financial-agent', version:'1.2.3'}, env));
  assert.equal((await readFile(join(root, 'codex-calls.jsonl'), 'utf8')).trim().split('\n').length, 3);
});

async function pluginFixture(t) {
  const root = await fixture(t);
  await mkdir(join(root, '.codex-plugin'));
  await mkdir(join(root, 'scripts'));
  const metadata = {name: 'financial-agent', version: '1.2.3', marketplace: 'zhiheng-local'};
  await writeFile(join(root, '.codex-plugin/plugin.json'), JSON.stringify(metadata));
  await writeFile(join(root, 'marketplace.example.json'), JSON.stringify({name: metadata.marketplace}));
  await writeFile(join(root, 'scripts/mcp-bootstrap.mjs'), 'console.log(JSON.stringify({cwd:process.cwd(),file:import.meta.url}));');
  return {root, metadata};
}

test('MCP repair writes real absolute paths, backs up original bytes, preserves unrelated settings and is idempotent', async t => {
  const {root} = await pluginFixture(t);
  const original = JSON.stringify({mcpServers: {other: {command:'keep'}, financial:{type:'stdio',command:'node',args:['${PLUGIN_ROOT}/scripts/mcp-bootstrap.mjs','--tools-only'],cwd:'${PLUGIN_ROOT}',env:{FINANCE_PORT:'3210'}}}});
  await writeFile(join(root,'.mcp.json'),original);
  await writeMcpConfig(root);
  const config = JSON.parse(await readFile(join(root,'.mcp.json'),'utf8'));
  assert.deepEqual(config.mcpServers.other,{command:'keep'});
  assert.deepEqual(config.mcpServers.financial.env,{FINANCE_PORT:'3210'});
  assert.equal(config.mcpServers.financial.command,process.execPath);
  assert.deepEqual(config.mcpServers.financial.args,[join(root,'scripts/mcp-bootstrap.mjs'),'--tools-only']);
  assert.equal(config.mcpServers.financial.cwd,root);
  assert.ok(!JSON.stringify(config).includes('${PLUGIN_ROOT}'));
  const {readdir} = await import('node:fs/promises');
  const backups=await readdir(join(root,'.runtime/mcp-backups'));
  assert.equal(backups.length,1);
  assert.equal(await readFile(join(root,'.runtime/mcp-backups',backups[0]),'utf8'),original);
  await writeMcpConfig(root);
  assert.equal((await readdir(join(root,'.runtime/mcp-backups'))).length,1);
});

test('portable ZIP launch finds the installed copy from another cwd and persists absolute paths', async t => {
  const {root,metadata} = await pluginFixture(t);
  const env = {...process.env,CODEX_HOME:join(root,'用户 cache')};
  const target=installedRoot(metadata,env);
  await mkdir(target,{recursive:true});
  for (const name of ['.codex-plugin','scripts']) await cp(join(root,name),join(target,name),{recursive:true});
  const portable=portableMcpConfig(metadata);
  await writeFile(join(target,'.mcp.json'),JSON.stringify(portable));
  assert.equal(portable.mcpServers.financial.cwd,undefined);
  assert.ok(!JSON.stringify(portable).includes('${PLUGIN_ROOT}'));
  assert.ok(!JSON.stringify(portable).includes(root));
  const launch=await command(process.cwd(),env,portable.mcpServers.financial.args);
  assert.equal(launch.code,0,launch.stderr);
  assert.equal(JSON.parse(launch.stdout).cwd,target);
  const actual=JSON.parse(await readFile(join(target,'.mcp.json'),'utf8'));
  assert.deepEqual(actual,absoluteMcpConfig(target));
});
