import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { installedRoot, pluginMetadata, portableMcpConfig, repairMcpConfigs, writeMcpConfig } from '../lib/mcp-config.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
try {
  const args = process.argv.slice(2);
  let root = source, mode = 'local';
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--root' && args[index + 1]) root = resolve(args[++index]);
    else if (['--all', '--for-install', '--print-portable'].includes(args[index])) mode = args[index];
    else throw Error('Usage: configure-mcp.mjs [--root <插件目录>] [--all | --for-install | --print-portable]');
  }
  if (mode === '--print-portable') console.log(JSON.stringify(portableMcpConfig(await pluginMetadata(root)), null, 2));
  else {
    const files = mode === '--all' ? await repairMcpConfigs(root) : [await writeMcpConfig(root, {
      launchRoot: mode === '--for-install' ? installedRoot(await pluginMetadata(root)) : root,
      backup: mode !== '--for-install'
    })];
    for (const file of files) console.log(`MCP 绝对路径已配置：${file}`);
  }
} catch (error) {
  console.error('[知衡 MCP 配置失败]', error.message);
  process.exitCode = 1;
}
