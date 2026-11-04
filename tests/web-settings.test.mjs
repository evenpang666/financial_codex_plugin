import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createWebSettings } from '../lib/settings.mjs';
import { createFinanceServer, listen } from '../lib/server.mjs';
import { runInNewContext } from 'node:vm';

async function directory(t, cleanup = true) {
  await mkdir('.test-tmp', {recursive: true});
  const root = await mkdtemp(join(process.cwd(), '.test-tmp/settings-'));
  if (cleanup) t.after(() => rm(root, {recursive: true, force: true}));
  return root;
}

test('settings default to Sol/high, serialize concurrent updates and persist across restart', async t => {
  const root = await directory(t), settings = await createWebSettings(root, {});
  assert.deepEqual(settings.get(), {model:'gpt-6-sol', reasoningEffort:'high'});
  await Promise.all([
    settings.update({model:'gpt-6-astra', reasoningEffort:'max'}),
    settings.update({model:'gpt-6-luna', reasoningEffort:'low'}),
  ]);
  assert.deepEqual((await createWebSettings(root, {})).get(), {model:'gpt-6-luna', reasoningEffort:'low'});
  assert.throws(() => settings.update({model:'unknown', reasoningEffort:'high'}), /有效/);
  assert.throws(() => settings.update({model:'gpt-6-sol', reasoningEffort:'invalid'}), /有效/);
  assert.throws(() => settings.update({model:'gpt-6-sol', reasoningEffort:'high', injected:true}), /有效/);
  assert.deepEqual(settings.get(), {model:'gpt-6-luna', reasoningEffort:'low'});
});

test('environment overrides initialize settings, while saved preferences take precedence', async t => {
  const root = await directory(t), env = {FINANCE_CODEX_MODEL:'custom-model', FINANCE_CODEX_REASONING_EFFORT:'medium'};
  const settings = await createWebSettings(root, env);
  assert.deepEqual(settings.get(), {model:'custom-model', reasoningEffort:'medium'});
  assert.ok(settings.describe().models.some(row => row.id === 'custom-model'));
  await settings.update({model:'gpt-6-sol', reasoningEffort:'high'});
  assert.deepEqual((await createWebSettings(root, env)).get(), {model:'gpt-6-sol', reasoningEffort:'high'});
});

test('settings API serves assets, rejects foreign origins, and applies selections to subsequent Codex calls', async t => {
  const root = await directory(t, false), calls = [];
  await mkdir(join(root, 'web'));
  for (const file of ['settings.html','settings.js','settings.css','theme.js','theme.css']) await copyFile(new URL('../web/' + file, import.meta.url), join(root, 'web', file));
  const site = await createFinanceServer({root, network:null, env:{}, research: async (_prompt, options) => { calls.push(options); return {text:'完成'}; }});
  const port = await listen(site.server, 0), base = `http://127.0.0.1:${port}`;
  t.after(async () => { await site.close(); await rm(root, {recursive:true, force:true}); });
  for (const path of ['/settings','/settings/','/settings.js','/settings.css','/theme.js','/theme.css']) assert.equal((await fetch(base + path)).status, 200, path);
  const initial = await (await fetch(base + '/api/settings')).json();
  assert.equal(initial.model, 'gpt-6-sol'); assert.equal(initial.reasoningEffort, 'high');
  const request = {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({model:'gpt-6-luna', reasoningEffort:'low'})};
  assert.equal((await fetch(base + '/api/settings', {...request, headers:{...request.headers, Origin:'http://foreign.example'}})).status, 403);
  assert.equal((await fetch(base + '/api/settings', {...request, body:JSON.stringify({model:'unknown', reasoningEffort:'high'})})).status, 400);
  assert.equal((await fetch(base + '/api/settings', request)).status, 200);
  const status = await (await fetch(base + '/api/status')).json();
  assert.equal(status.model, 'gpt-6-luna'); assert.equal(status.reasoningEffort, 'low');
  const job = site.startJob({kind:'research', prompt:'研究贵州茅台'});
  for (let i = 0; i < 100 && job.status === 'running'; i++) await new Promise(done => setTimeout(done, 10));
  assert.equal(job.status, 'completed');
  assert.equal(calls[0].model, 'gpt-6-luna'); assert.equal(calls[0].reasoningEffort, 'low');
  assert.deepEqual((await createWebSettings(root, {})).get(), {model:'gpt-6-luna', reasoningEffort:'low'});
});

test('theme defaults to dark, restores saved light and follows changes from other tabs', async () => {
  const source = await readFile(new URL('../web/theme.js', import.meta.url), 'utf8');
  for (const stored of [null, 'light', 'invalid']) {
    const listeners = {}, writes = [], document = {documentElement:{dataset:{}}};
    const window = {addEventListener: (name, fn) => { listeners[name] = fn; }};
    runInNewContext(source, {window, document, localStorage:{getItem:()=>stored, setItem:(key,value)=>writes.push([key,value])}});
    assert.equal(window.financeTheme.get(), stored === 'light' ? 'light' : 'dark');
    window.financeTheme.set('light');
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.deepEqual(writes, [['zhiheng-theme','light']]);
    listeners.storage({key:'zhiheng-theme', newValue:'dark'});
    assert.equal(window.financeTheme.get(), 'dark');
    listeners.storage({key:null, newValue:null});
    assert.equal(window.financeTheme.get(), 'dark');
  }
  const document = {documentElement:{dataset:{}}};
  runInNewContext(source, {document, window:{addEventListener(){}}, localStorage:{getItem(){throw Error('denied');}}});
  assert.equal(document.documentElement.dataset.theme, 'dark');
});
