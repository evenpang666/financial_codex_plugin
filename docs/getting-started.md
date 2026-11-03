# 安装、启动与更新

[项目首页](../README.md) · [文档导航](README.md)

## 准备运行环境

需要 Node.js ≥ 22.13、Python ≥ 3.10。网页自然语言研究和日报复核还需要可运行且已登录的 Codex CLI；插件聊天中的研究直接使用当前 Codex 会话。

在仓库根目录执行：

```powershell
npm ci --ignore-scripts
npm run setup
codex login
```

`setup` 创建当前目录的 `.venv` 并安装 `requirements.txt`。若系统 Python 命令不同，先通过 `FINANCE_PYTHON` 指定可用的解释器。Node.js 和 Python 需要事先安装；当前启动器不安装 DSH、pnpm 或模型服务。

## 安装本地插件

```powershell
npm run pack:plugin
codex plugin marketplace add ./dist/financial-agent
codex plugin add financial-agent@zhiheng-local
```

安装后新建聊天并启用 **financial-agent / 知衡**。客户端会将代码复制到自己的插件缓存；仓库中的 `.venv` 和个人数据不会随包复制。

首次使用，在 Codex 显示的实际安装目录执行：

```powershell
npm run setup
```

若客户端未保留 `node_modules`，先运行 `npm ci --ignore-scripts`。也可以在 MCP 进程环境中将 `FINANCE_PYTHON` 指向已有、装好依赖的 Python 可执行文件，例如仓库的 `.venv/Scripts/python.exe`；这是解释器路径，不是虚拟环境目录。

分发目录包含本地 marketplace 清单，可解压 ZIP 后执行 `codex plugin marketplace add .`。插件采用 `.codex-plugin/plugin.json`、`.mcp.json` 和 `skills/` 布局。路径展开故障见[MCP 排查](troubleshooting.md#mcp-无法启动)。

## 启动与停止

- Codex 加载 financial MCP 时，默认在后台启动工作台、日报页面和已配置的调度，不自动弹出浏览器。
- 同一安装目录中的多个聊天与手动启动共用一个服务。关闭聊天后，自动创建的后台服务继续运行。
- `npm start`：启动或复用当前目录的工作台并打开浏览器。
- `npm run dev`：启动或复用工作台，不打开浏览器。
- `npm stop`：停止当前运行副本的工作台。

Windows 可双击 `start.bat`；macOS/Linux 可运行 `sh start.sh`。这些入口会在依赖或虚拟环境不存在时调用安装命令；已有环境直接复用。

默认入口为 `http://127.0.0.1:3205`，日报在 `/reports`，回测在 `/backtests`。端口被占用时自动选择空闲端口，请使用启动输出或 `open_financial_workspace` 返回的实际地址。

## 环境变量

环境变量需要导出到启动进程，项目不会自动读取 `.env`。占位示例见 [`.env.example`](../.env.example)。

| 变量 | 用途 |
| --- | --- |
| `FINANCE_PYTHON` | Python 可执行文件的绝对路径 |
| `FINANCE_CODEX_BIN` | Codex CLI 可执行文件，默认 `codex` |
| `FINANCE_CODEX_MODEL` | 网页研究模型，默认 `gpt-6-sol` |
| `FINANCE_PORT` | 首选网页端口，默认 `3205` |
| `FINANCE_WEB_AUTOSTART` | 设为 `0` 时关闭 MCP 加载时的网页自动启动 |
| `FINANCE_LAN` | 设为 `1` 时尝试启用物理以太网访问 |
| `SEC_USER_AGENT` | SEC 访问者名称和联系邮箱，不是 API Key |

网页研究通过 `codex exec --sandbox read-only` 使用已有 Codex 登录。插件不需要另配模型 API Key，也不复制认证文件。`--tools-only` 模式仅提供研究工具，不自动启动网页。

## 数据与更新

数据保存在**实际运行副本**的 `data/`，配置保存在 `config/`。源码仓库、分发目录和插件安装副本各自独立；在其中一个目录生成的日报不会自动出现在其他目录。

更新或重装前，停止对应服务并备份 `data/` 与 `config/`。获取新代码后重新准备依赖、打包并按客户端支持的插件更新流程安装；确认新安装副本后恢复数据和配置。保留本地未提交修改，不使用强制重置更新。

[网页操作](web-workspace.md) · [问题排查](troubleshooting.md) · [开发与分发](development.md)
