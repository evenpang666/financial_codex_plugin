# 知衡 · Codex Financial Agent

独立 Codex 插件：A股、港股、美股研究，持仓管理，双时点日报，策略回测，XGBoost / Elastic Net 训练。由 `../financial_agent_windows` 的金融引擎迁移；运行和分发均不依赖原目录、DSH 或 DeepSeek Key。

## 开始使用

需要 Node.js >=22.13、Python >=3.10；网页自然语言研究需要可运行且已登录的 Codex CLI。

```powershell
npm ci --ignore-scripts
npm run setup
codex login
npm start
```

Windows 也可以双击 `start.bat`；macOS/Linux 运行 `sh start.sh`。已有环境会复用。`npm run dev` 不自动打开浏览器，`npm stop` 停止工作台。默认端口3205，冲突自动选空闲端口，以终端输出为准。

插件内默认使用 `gpt-6-sol`，无须单独配置模型 API Key。网页研究及定时日报复核通过 `codex exec --sandbox read-only --model gpt-6-sol` 调用用户现有 Codex 登录；可用 `FINANCE_CODEX_MODEL` 覆盖，不读取、复制或展示认证文件。

## 安装成 Codex 插件

仓库包含 `.codex-plugin/plugin.json`、`.mcp.json`、10个 `skills/*/SKILL.md` 以及标准本地 marketplace 清单。

```powershell
npm run pack:plugin
codex plugin marketplace add ./dist/financial-agent
codex plugin add financial-agent@zhiheng-local
```

也可在 Codex 插件目录选择 **知衡本地插件 → financial-agent** 安装。安装后新建聊天并启用插件。客户端会将插件复制到自己的缓存；需要在**实际安装目录**运行 `npm run setup` 准备 Python 环境，或将 `FINANCE_PYTHON` 配置为本项目 `.venv` 的绝对路径。若客户端复制过程未保留 node_modules，在安装目录运行 `npm ci --ignore-scripts`。

当前 Codex CLI 0.166 alpha 在全局插件自动加载时未展开 `.mcp.json` 中的 `${PLUGIN_ROOT}`。若运行时出现 financial MCP 启动错误，在安装目录执行 `codex mcp add financial -- node <安装目录的绝对路径>/scripts/mcp-server.mjs` 注册绝对路径；本机全局安装已完成此配置。

`npm run pack:plugin` 生成 `dist/financial-agent-1.0.0.zip`、SHA256及可直接安装的干净目录 `dist/financial-agent/`。ZIP包含 Node运行依赖、源码和配置样例，不包含用户数据、凭据、Python虚拟环境。解压后也可直接在解压目录执行 `codex plugin marketplace add .`，并按上面的准备步骤使用。插件采用官方支持的 [Codex兼容布局](https://developers.openai.com/plugins/build/plugins) 与 [本地stdio MCP](https://developers.openai.com/plugins/deploy/desktop-only)，并非已发布到公共商店。

## 功能与入口

| 功能 | 插件 / 网页入口 |
| --- | --- |
| 个股搜索、行情、日线、技术指标、估值、财报、公告、同行、综合分析 | 原21个研究工具全部保留；`/` |
| 新闻、市场全景、样本宽度、候选排序、长短期研究 | `get_market_*`、`get_candidate_ranking`、`analyze_stock` |
| 持仓读取、替换、文本识别、预览、编辑、删除、三方案复核 | `get_saved_portfolio` / `set_portfolio` / `update_portfolio_holding` / `delete_portfolio_holding` / `get_portfolio_position_review`；`/reports` |
| 定时上午/下午日报、独立手动报告、快照、盘中对照反思、归档与实时刷新 | `get_daily_research_report` 获取时段证据；`start_financial_job(kind=daily)`按当前时刻生成手动报告并归档 |
| 调度 | `get_report_schedule` / `set_report_schedule`；持续运行工作台 |
| 8种经典策略、2种模型、超参数、checkpoint、样本外回测、交易明细和净值图 | `get_strategy_checkpoints` / `start_financial_job`；`/backtests` |
| 原A股全市场盘中策略部署、历史数据准备、质量审计、因子周训练 | 日报策略工具；`scripts/intraday_ranking.py`、`factor_data_prep.py`、`factor_scheduler.py` |
| 任务记录、进度、取消 | `get_financial_jobs` / `cancel_financial_job`；网页任务卡 |
| 可选Webhook与独立日报守护 | 保留`scripts/daily_push.py`，配置后显式运行；默认不发送外部消息 |

A/HK 使用显式市场与数字代码；美股必须 `market=us`，代码如 `AAPL`、`MSFT`、`BRK.B`（规范化为`BRK-B`）。美股持仓支持碎股。使用示例：

- “用知衡研究 AAPL，注明美股美元报价、纽约时间、财报期与缺失证据。”
- “比较我保存的美股持仓，使用 momentum 日线策略，不执行交易。”
- “用美股 AAPL/MSFT 训练 Elastic Net，再选训练结束之后的区间回测。”

## 美股口径

行情与报表来自 Yahoo Finance/yfinance，披露来自 SEC EDGAR，交易日来自 XNYS 日历，覆盖节假日、夏令时与提前收市。报价保留供应商时间；报表币种与报价USD分开。搜索、报价和日线遇到上游限流时，可回退到24小时内同参数取得的数据，返回来源中明确标注缓存时间；无可用缓存时明确报错。

```powershell
$env:SEC_USER_AGENT = 'YourName contact@example.com'
npm start
```

这是 SEC 要求的访问者标识，不是API Key。未配置或限流时公告工具返回可解释错误。A股公告仍使用巨潮；原有港股HKEX公告和港股量化执行未接入的边界保持明确，不伪造数据。

网页策略部署、训练与回测支持 A股、港股、美股，默认日线，可选周线、月线。信号在完整K线收盘后形成，下一根K线执行；A股日线按 T+1 延后一日退出。模型 checkpoint 按市场和周期隔离，回测必须晚于训练标签截止日。新网页引擎使用固定用户股票池（1–50只）、单边手续费5bps和滑点5bps；旧盘中引擎及归档保留供历史核对。美股 `qfq` / `split_dividend` 对应 Yahoo 的拆股分红调整，拒绝 `hfq`。

美股回测是**复权总回报单位模拟**，不代表当日实际美元成交价；固定用户股票池有幸存者选择偏差，未模拟盘口、融资和完整停牌成交约束。活跃/涨跌榜候选是有界样本，不能视为全美股全集。不可把跨市场币种直接相加为账户价值。

## 数据、调度与环境

所有研究数据保存在**运行副本**的 `data/`，设置在 `config/*.json`。原项目历史数据和凭据没有自动复制；更新/重装插件前备份这两个目录，升级后恢复。代码包不携带个人持仓或历史报告。

默认A股北京时间09:20/14:30；可启用港股和美股，美股按纽约09:20/15:30，提前收市日默认调整为收市前30分钟。配置显式自定义时间时尊重自定义值。调度需要进程持续运行；不是操作系统后台服务，不会在电脑关机时执行。

可选环境变量见 `.env.example`（需要导出，不会自动加载文件）。`FINANCE_CODEX_BIN` 指定Codex可执行文件，`FINANCE_CODEX_MODEL`覆盖模型，`FINANCE_PYTHON`指定Python。默认仅监听本机；设置`FINANCE_LAN=1`后启用原物理以太网局域网入口。

## 验证与交付

```powershell
npm run check
npm test
npm run test:python
npm run pack:plugin
```

详细迁移清单、测试范围和已知边界见 [迁移验收](docs/migration.md)。旧计算方法说明保留于docs，启动安装以本README为准。MIT许可证沿用原项目；无券商接口，不执行交易。
