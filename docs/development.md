# 开发、验证与分发

[文档导航](README.md) · [凭据保护](git-security.md)

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `.codex-plugin/`、`.mcp.json` | 插件与本地 stdio MCP 清单 |
| `skills/` | 10 个 Codex Skills |
| `lib/` | 运行时、网页服务、调度、持仓与 Codex 桥接 |
| `engine/` | 迁移的研究工具定义 |
| `scripts/` | 启动、数据适配、策略引擎、测试与打包脚本 |
| `requirements.txt`、`uv.toml` | Python 依赖与本地 uv 配置；运行环境不入包 |
| `web/` | 无需编译的网页静态资源 |
| `tests/` | Node 与 Python 回归测试 |
| `docs/` | 使用、方法、验收和历史文档 |
| `data-corrections/` | 可公开的固定数据修正与来源校验样例 |

项目由独立金融引擎迁移，运行和分发均不依赖同级项目、DSH 或 DeepSeek Key。迁移清单与既往实测记录见[迁移验收](migration.md)。

## 校验命令

```powershell
npm run check
npm test
npm run test:python
npm run pack:plugin
```

清单检查校验插件结构与工具；Node 测试覆盖 MCP、网页、自动启动和任务行为；Python 测试覆盖数据与计算。网络隔离环境可能无法创建或连接本机测试服务，需要在允许本机端口和子进程的环境中执行对应集成测试。

2026-11-03 自动启动修复后，44 项 Node 测试通过。Python 历史验收范围见迁移记录；测试通过不代表外部数据源永远可用或策略具有收益。

## 分发产物

`npm run pack:plugin` 生成：

- `dist/financial-agent-<版本>.zip` 与 SHA256 校验文件，版本从插件清单读取。
- `dist/financial-agent/`：可直接注册的本地 marketplace 目录。

包内包含源码、Node 依赖、插件清单、配置样例、uv 配置、LICENSE 和文档资源；不包含个人 `data/`、本地 `config/*.json`、凭据、Python 虚拟环境及运行状态。分发目录每次重建，清除旧构建残留；不要在 `dist/financial-agent/` 内保存数据或手工修改。不要将 `.env` 或 Key 放入源码、文档或样例中；Git 忽略不是内容扫描。

安装入口为 `npm run install:cli` / `npm run install:app`，详见[安装指南](getting-started.md)。MCP 从无第三方依赖的 `scripts/mcp-bootstrap.mjs` 进入；Python 配置在后台服务创建时按需执行，不阻塞 MCP 工具发现。安装回归测试覆盖并发、失败重试、目录复制、路径空格、显式解释器和两种客户端入口；跨系统流程在 CI 的 Ubuntu / Windows 矩阵中验证。

1.1.1 起，`lib/mcp-config.mjs` 统一生成 MCP 配置。源码和本机分发目录使用生成的绝对路径，`npm run setup` 会刷新源码配置；CLI 安装后读取实际 `installedPath` 再修正缓存副本。ZIP 的 `.mcp.json` 单独生成可迁移的 Node 启动代码，不直接复制源码中的机器路径。旧副本可用 `npm run repair:mcp` 修复，备份放在各自 `.runtime/mcp-backups/`。路径回归测试从无关工作目录加载带空格和中文的安装目录，验证首次写回及配置保留。

README 和截图保持相对路径，文档图片位于 `docs/assets/`。`codex-workspace-home.png` 来自当前界面的空数据演示，不含私人持仓或任务；其余旧截图随历史文档保留。

[MIT License](../LICENSE)，Copyright (c) 2026 Yiwen Pang。第三方依赖保留各自许可证。
