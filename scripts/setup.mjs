import { fileURLToPath } from 'node:url';
import { ensureNodeDependencies, ensurePython } from '../lib/setup.mjs';
import { writeMcpConfig } from '../lib/mcp-config.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  await ensureNodeDependencies(root);
  await writeMcpConfig(root);
  const python = await ensurePython(root, {force: true});
  console.log(`Python 数据环境已就绪：${python}`);
  console.log('首次使用网页研究功能前请运行 codex login。插件内研究直接使用当前 Codex 会话。');
} catch (error) {
  console.error('[知衡安装失败]', error.message);
  process.exitCode = 1;
}
