import { access, readFile, mkdir, writeFile, rename, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export async function pluginMetadata(root) {
  const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  const marketplace = JSON.parse(await readFile(join(root, 'marketplace.example.json'), 'utf8'));
  if (manifest.name !== 'financial-agent' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version) || !/^[\w-]+$/.test(marketplace.name)) {
    throw Error(`不是有效的知衡插件目录：${root}`);
  }
  return {name: manifest.name, version: manifest.version, marketplace: marketplace.name};
}

export function installedRoot(metadata, env = process.env) {
  const home = resolve(env.CODEX_HOME || join(homedir(), '.codex'));
  return join(home, 'plugins/cache', metadata.marketplace, metadata.name, metadata.version);
}

export function absoluteMcpConfig(root, current = {}, node = process.execPath) {
  root = resolve(root);
  const previous = current.mcpServers?.financial || {};
  const extra = previous.args?.includes('-e') ? [] : (previous.args || []).slice(1);
  return {...current, mcpServers: {...current.mcpServers, financial: {
    ...previous, type: 'stdio', command: node,
    args: [join(root, 'scripts/mcp-bootstrap.mjs'), ...extra], cwd: root
  }}};
}

// This function is serialized into the ZIP config. It runs before any plugin
// imports, so it cannot depend on modules or on the host expanding placeholders.
function portableLaunch(metadata) {
  const {join, resolve} = require('node:path');
  const fs = require('node:fs');
  const root = join(resolve(process.env.CODEX_HOME || join(require('node:os').homedir(), '.codex')),
    'plugins/cache', metadata.marketplace, metadata.name, metadata.version);
  try {
    const manifest = JSON.parse(fs.readFileSync(join(root, '.codex-plugin/plugin.json'), 'utf8'));
    if (manifest.name !== metadata.name || manifest.version !== metadata.version) throw Error('插件目录不匹配');
    const script = join(root, 'scripts/mcp-bootstrap.mjs');
    fs.accessSync(script);
    const path = join(root, '.mcp.json');
    const config = JSON.parse(fs.readFileSync(path, 'utf8'));
    config.mcpServers.financial = {...config.mcpServers.financial, command: process.execPath, args: [script], cwd: root};
    const temporary = path + '.' + process.pid + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n');
      fs.renameSync(temporary, path);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    process.chdir(root);
    import(require('node:url').pathToFileURL(script).href).catch(error => { console.error('[知衡 MCP]', error.message); process.exitCode = 1; });
  } catch (error) {
    console.error('[知衡 MCP] 请在实际安装目录运行 npm run repair:mcp。', error.message);
    process.exitCode = 1;
  }
}

export function portableMcpConfig(metadata) {
  return {mcpServers: {financial: {type: 'stdio', command: 'node',
    args: ['--input-type=commonjs', '-e', `(${portableLaunch.toString()})(${JSON.stringify(metadata)})`]}}};
}

export async function writeMcpConfig(root, {launchRoot = root, node = process.execPath, backup = true} = {}) {
  root = resolve(root);
  await pluginMetadata(root);
  await access(join(root, 'scripts/mcp-bootstrap.mjs'));
  const file = join(root, '.mcp.json');
  const previous = await readFile(file, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; return '{}'; });
  const next = JSON.stringify(absoluteMcpConfig(launchRoot, JSON.parse(previous), node), null, 2) + '\n';
  if (previous === next) return file;
  if (backup && previous !== '{}') {
    const directory = join(root, '.runtime/mcp-backups');
    await mkdir(directory, {recursive: true});
    await writeFile(join(directory, `${Date.now()}-${randomUUID()}.json`), previous);
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, next);
  await rename(temporary, file);
  return file;
}

export async function repairMcpConfigs(root, env = process.env) {
  const metadata = await pluginMetadata(root);
  const files = [await writeMcpConfig(root)];
  const distribution = join(root, 'dist/financial-agent');
  try {
    const target = installedRoot(await pluginMetadata(distribution), env);
    files.push(await writeMcpConfig(distribution, {launchRoot: target, backup: false}));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const cache = join(installedRoot(metadata, env), '..');
  const versions = await readdir(cache, {withFileTypes: true}).catch(error => { if (error.code !== 'ENOENT') throw error; return []; });
  for (const version of versions) {
    if (!version.isDirectory()) continue;
    files.push(await writeMcpConfig(join(cache, version.name)));
  }
  return [...new Set(files)];
}
