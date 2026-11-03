import { fileURLToPath } from 'node:url';
import { ensureNodeDependencies } from '../lib/setup.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  await ensureNodeDependencies(root);
  await import('./mcp-server.mjs');
} catch (error) {
  console.error('[知衡 MCP 启动失败]', error.message);
  process.exitCode = 1;
}
