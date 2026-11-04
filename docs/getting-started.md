# 安装、启动与更新

[项目首页](../README.md) · [文档导航](README.md)

## 准备运行环境

| 环境 | Windows | Ubuntu |
| --- | --- | --- |
| Node.js / npm | Node.js ≥ 22.13，附带 npm；安装后重新打开终端与 App | Node.js ≥ 22.13，附带 npm |
| uv | 使用已安装的本地 uv，建议 ≥ 0.8.22 | 使用已安装的本地 uv，建议 ≥ 0.8.22 |
| Python | uv 默认选择或下载 Python 3.12 | uv 默认选择或下载 Python 3.12 |
| Codex CLI | 支持 `codex plugin add` 的版本 | 支持 `codex plugin add` 的版本 |
| Codex App | 在支持本地插件的客户端中安装 | 官方客户端提供对应平台时可用；Ubuntu 可直接使用 CLI |

本项目支持两种操作系统的依赖准备、打包、安装脚本与运行时。App 本身的发行平台由 OpenAI 决定，本项目不安装或模拟 Linux 桌面客户端。Ubuntu 若缺少 OpenMP 运行库（报 `libgomp.so.1`），先通过系统包管理器安装 `libgomp1`。

先确认：

```text
node --version
npm --version
uv --version
```

未安装 uv 时，按 [uv 官方安装说明](https://docs.astral.sh/uv/getting-started/installation/) 安装。安装器会发现 PATH、用户的 `.local/bin`、`.cargo/bin` 或项目 `.runtime/uv` 中的 uv，也可以用 `FINANCE_UV` 指定绝对路径。无需安装系统 pip。

网页自然语言研究和日报复核还需要可运行且已登录的 Codex CLI（`codex login`）；插件聊天中的研究直接使用当前 Codex 会话。App 安装准备本身不要求 CLI。

## 通过 Codex CLI 安装

在 Windows PowerShell 或 Ubuntu 终端中执行：

```text
git clone https://github.com/evenpang666/financial_codex_plugin.git
cd financial_codex_plugin
npm run install:cli
```

安装器检查 CLI 的插件能力，准备 Node 和 Python 依赖，打包，然后执行 `codex plugin marketplace add <分发目录的绝对路径>` 和 `codex plugin add financial-agent@zhiheng-local`。任一步失败都会以非零状态退出；错误修复后可重新运行。

安装完成后，新建聊天并启用 **financial-agent / 知衡 Financial Agent**。不需要手工编辑 Codex 配置或进入插件缓存执行 setup。

## 通过 Codex App 安装

1. 下载或克隆本仓库，在根目录执行 `npm run install:app`。也可在 App 中打开仓库，并让 Codex 执行这条命令。
2. 安装器输出一个干净的 marketplace 目录，通常为 `<仓库>/dist/financial-agent`。在 Codex App 中将该目录作为项目打开。
3. 重启或刷新 App，在插件列表中选择本地来源 **知衡本地插件**，找到 **知衡 Financial Agent** 并点击安装。
4. 新建聊天并启用插件。安装副本首次加载时会在后台通过本地 uv 准备 Python 环境。

`install:app` 只准备目录，最终安装由 App 的安装按钮完成。它不修改个人 marketplace、不覆盖其他插件，也不需要终端调用 `codex plugin add`。若 App 没有显示本地来源，检查打开的目录内是否有 `.agents/plugins/marketplace.json`，然后重启 App。

本地 marketplace 与缓存副本的行为依据 [OpenAI 插件打包文档](https://developers.openai.com/plugins/build/plugins)。本项目保留受支持的 `.codex-plugin/plugin.json`、`.mcp.json` 和 `skills/` 兼容布局。

## 使用分发 ZIP

解压 `financial-agent-<版本>.zip` 到独立目录，不要覆盖已有运行目录。ZIP 包含 Node 依赖、uv 配置和 `.agents/plugins/marketplace.json`，不包含 Python 环境与个人数据。

- CLI：在解压目录运行 `codex plugin marketplace add .`，再运行 `codex plugin add financial-agent@zhiheng-local`。
- App：直接将解压目录作为项目打开，在本地插件列表点击安装。

这两种方式均不要求先运行 `npm run setup`；首次使用会在实际安装副本中配置 Python。首次联网准备可能需要数分钟，MCP 工具列表可先加载；若客户端工具调用超时，等依赖准备完成后重试“打开知衡工作台”。不要移动已注册的 marketplace 源目录。

## 本地 uv 与 Python 环境

`requirements.txt` 是 Python 依赖清单，项目的 `uv.toml` 将默认缓存放在当前副本的 `.uv-cache/`，使用复制方式安装依赖。安装执行 `uv venv` 和 `uv pip install --python <项目环境> -r requirements.txt`，不调用系统 pip、不安装到系统或当前激活的 conda 环境。

Python 环境位于 `.runtime/venvs/finance/`，uv 需要下载的解释器放在 `.runtime/python/`。成功导入全部依赖后，才写入 `.runtime/python.json` 供启动器、MCP 和工作台统一读取；安装失败不会写入成功标记。并发聊天通过安装锁复用同一次配置，依赖清单变化时自动重新安装。已有 `.venv` 保留，不会被安装器覆盖。

保留 uv 对本地配置的标准发现方式：项目 `uv.toml`、用户级 uv 配置，以及 `UV_CONFIG_FILE`、`UV_INDEX_URL`、`UV_CACHE_DIR` 等变量均可使用；项目设置优先于用户同名设置，环境变量可覆盖项目默认值。不内置镜像、不关闭证书校验。配置优先级见 [uv 官方文档](https://docs.astral.sh/uv/concepts/configuration-files/)。

例如，指定现有的 uv 可执行文件和配置：

```powershell
# Windows PowerShell；替换为本机真实路径
$env:FINANCE_UV = 'C:\Tools\uv\uv.exe'
$env:UV_CONFIG_FILE = 'C:\Users\you\AppData\Roaming\uv\uv.toml'
npm run setup
```

```sh
# Ubuntu；替换为本机真实路径
export FINANCE_UV="$HOME/.local/bin/uv"
export UV_CONFIG_FILE="$HOME/.config/uv/uv.toml"
npm run setup
```

`npm run setup` 可单独用于开发环境初始化或依赖修复。也可设置 `FINANCE_PYTHON` 为已装好依赖的解释器绝对路径；此时只验证，不往这个外部环境安装包。变量必须传给实际启动的进程；从图标打开 App 不一定继承终端变量，需在启动 App 前配置其环境。

离线使用需要提前准备当前系统的 Python 解释器和 uv 依赖缓存，再设置 `UV_OFFLINE=1`。没有本地解释器或缓存时，离线安装会明确失败。已准备完成的环境在常规启动时直接复用。

## 启动与停止

- Codex 加载 financial MCP 时，默认在后台启动工作台、日报页面和已配置的调度，不自动弹出浏览器。
- 同一安装目录中的多个聊天与手动启动共用一个服务。关闭聊天后，自动创建的后台服务继续运行。
- `npm start`：启动或复用当前目录的工作台并打开浏览器。
- `npm run dev`：启动或复用工作台，不打开浏览器。
- `npm stop`：停止当前运行副本的工作台。

Windows 可双击 `start.bat`；Ubuntu 可运行 `sh start.sh`。这些入口会在 Node 依赖缺失时安装依赖；Python 环境由运行时用 uv 自动准备，已有环境直接复用。

默认入口为 `http://127.0.0.1:3205`，日报在 `/reports`，回测在 `/backtests`。端口被占用时自动选择空闲端口，请使用启动输出或 `open_financial_workspace` 返回的实际地址。

## 环境变量

环境变量需要导出到启动进程，项目不会自动读取 `.env`。占位示例见 [`.env.example`](../.env.example)。

| 变量 | 用途 |
| --- | --- |
| `FINANCE_PYTHON` | Python 可执行文件的绝对路径 |
| `FINANCE_UV` | 本地 uv 可执行文件的绝对路径；默认自动发现 |
| `FINANCE_PYTHON_VERSION` | 创建 uv 环境时选择的 Python 版本，默认 `3.12`；不替换已有环境 |
| `UV_CONFIG_FILE` | 可选的本机 uv 配置文件绝对路径 |
| `UV_CACHE_DIR` / `UV_OFFLINE` | uv 缓存位置覆盖 / 离线模式 |
| `FINANCE_CODEX_BIN` | Codex CLI 可执行文件，默认 `codex` |
| `FINANCE_CODEX_MODEL` | 网页研究模型，默认 `gpt-6-sol` |
| `FINANCE_PORT` | 首选网页端口，默认 `3205` |
| `FINANCE_WEB_AUTOSTART` | 设为 `0` 时关闭 MCP 加载时的网页自动启动 |
| `FINANCE_LAN` | 默认自动识别物理以太网 IPv4 并启用局域网入口；设为 `0` 时仅限本机 |
| `SEC_USER_AGENT` | SEC 访问者名称和联系邮箱，不是 API Key |

网页研究通过 `codex exec --sandbox read-only` 使用已有 Codex 登录。插件不需要另配模型 API Key，也不复制认证文件。`--tools-only` 模式仅提供研究工具，不自动启动网页。

## 数据与更新

数据保存在**实际运行副本**的 `data/`，配置保存在 `config/`。源码仓库、分发目录和插件安装副本各自独立；在其中一个目录生成的日报不会自动出现在其他目录。

更新或重装前，停止对应服务并备份 `data/` 与 `config/`。获取新代码后重新运行 `npm run install:cli`，或运行 `npm run install:app` 后在 App 中重新安装；确认新安装副本后恢复数据和配置。保留本地未提交修改，不使用强制重置更新。不要直接修改 `dist/financial-agent/`：它是打包产物，下次打包会替换整个目录。

[网页操作](web-workspace.md) · [问题排查](troubleshooting.md) · [开发与分发](development.md)
