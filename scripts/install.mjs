import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureNodeDependencies, ensurePython, run } from '../lib/setup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/install.mjs --cli | --app\n--cli: 准备依赖、打包并通过 Codex CLI 安装插件\n--app: 准备干净的本地 marketplace，随后在 Codex App 中点击安装');
} else if (args.length !== 1 || !['--cli', '--app'].includes(args[0])) {
  console.error('请指定 --cli 或 --app。查看帮助：node scripts/install.mjs --help');
  process.exitCode = 1;
} else {
  try {
    const env = process.env;
    let codex = env.FINANCE_CODEX_BIN || 'codex', prefix = [];
    // npm's Windows .cmd shim cannot be spawned directly without a shell.
    // Run its JavaScript entry with Node instead, including paths with spaces.
    if (process.platform === 'win32' && !codex.toLowerCase().endsWith('.exe')) {
      const directories = env.FINANCE_CODEX_BIN ? [dirname(env.FINANCE_CODEX_BIN)] : (env.PATH || '').split(delimiter);
      const entry = directories.map(directory => join(directory, 'node_modules/@openai/codex/bin/codex.js')).find(existsSync);
      if (entry) { codex = process.execPath; prefix = [entry]; }
    }
    if (args[0] === '--cli') {
      try { await run(codex, [...prefix, 'plugin', 'add', '--help'], {root, env}); }
      catch (error) { throw Error(`Codex CLI 不可用或尚不支持 plugin add。请更新 Codex CLI，或设置 FINANCE_CODEX_BIN。${error.message}`); }
    }
    await ensureNodeDependencies(root);
    const python = await ensurePython(root);
    await run(python, [join(root, 'scripts/package_plugin.py')], {root, env: {...env, PYTHONUTF8: '1'}});
    const marketplace = join(root, 'dist/financial-agent');
    if (args[0] === '--cli') {
      await run(codex, [...prefix, 'plugin', 'marketplace', 'add', marketplace], {root, env});
      await run(codex, [...prefix, 'plugin', 'add', 'financial-agent@zhiheng-local'], {root, env});
      console.log('知衡插件已通过 Codex CLI 安装。请新建聊天并启用插件。');
    } else {
      console.log(`本地 marketplace 已准备：${marketplace}`);
      console.log('在 Codex App 中将上述目录作为项目打开，重启或刷新插件列表，选择“知衡本地插件 → 知衡 Financial Agent”并点击安装。安装后新建聊天。');
    }
    console.log('安装副本首次加载时会在后台用本地 uv 准备 Python 环境，无需进入插件缓存运行 setup。');
  } catch (error) {
    console.error('[知衡插件安装失败]', error.message);
    process.exitCode = 1;
  }
}
