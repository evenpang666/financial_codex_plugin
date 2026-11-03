<p align="center">
  <img src="web/icon.svg" width="76" height="76" alt="知衡图标">
</p>
<h1 align="center">知衡 · Financial Agent</h1>
<p align="center">让研究更从容，让判断有依据。</p>
<p align="center">面向 Codex 的本地金融研究插件 · A 股 / 港股 / 美股</p>
<p align="center">
  <a href="#功能特色">功能特色</a> · <a href="#插件安装">插件安装</a> · <a href="#快速使用">快速使用</a> · <a href="#问题解决">问题解决</a> · <a href="docs/README.md">完整文档</a>
</p>

## 功能特色

| 能力 | 你可以做什么 |
| --- | --- |
| **三市场研究** | 查询 A 股、港股与美股行情、财务、估值及可得公告，结合来源与数据时点展开分析 |
| **双时点日报** | 开盘前梳理市场，收盘前对照复盘；支持手动报告、历史归档和图表阅读 |
| **持仓工作台** | 独立页面管理持仓、查看仓内行情、分析仓位，回测与部署当前持仓股票池 |
| **策略实验室** | 比较 8 种经典策略，训练 XGBoost / Elastic Net，查看净值、回撤与交易记录 |
| **本地工作台** | 复用 Codex 登录，插件加载时自动启动网页；研究数据保存在本机 |

![知衡 Codex 工作台：三市场研究、日报与策略实验室](docs/assets/codex-workspace-home.png)

<sub>当前版本界面，截图使用空任务、空归档状态。</sub>

## 插件安装

准备 **Node.js ≥ 22.13、Python ≥ 3.10 和 Codex CLI**，在仓库根目录运行：

```powershell
npm ci --ignore-scripts
npm run setup
npm run pack:plugin
codex plugin marketplace add ./dist/financial-agent
codex plugin add financial-agent@zhiheng-local
```

安装后新建聊天并启用插件。Codex 会创建独立安装副本，首次使用需在**实际安装目录**运行 `npm run setup`；也可指定已有 Python 环境，见[安装与更新指南](docs/getting-started.md)。

## 快速使用

在 Codex 中直接提出研究需求：

```text
用知衡研究 AAPL，核对行情、财报和 SEC 披露，注明来源与数据时点。
比较我保存的港股持仓，列出证据差异和主要风险。
打开知衡工作台，查看日报和历史回测。
```

网页研究使用已有 Codex 登录。在仓库根目录也可独立启动：

```powershell
codex login
npm start
```

打开[研究工作台](http://127.0.0.1:3205)、[日报](http://127.0.0.1:3205/reports)、[我的持仓](http://127.0.0.1:3205/portfolio)或[策略实验室](http://127.0.0.1:3205/backtests)。端口占用时，以启动输出或插件返回的地址为准。

持仓页按市场读取已保存股票，支持行情刷新、持仓分析和持仓池回测／部署。策略任务启动时固定持仓名单，结果保留该次名单与时间；仅以代码构建股票池，不还原实际持股数量或历史仓位。持仓池记录与自定义股票池分别归档，原策略实验室继续用于自定义回测和模型训练。

## 问题解决

| 问题 | 处理方式 |
| --- | --- |
| 日报打不开 | 请 Codex“打开知衡工作台”获取实际地址，或在运行目录执行 `npm start`；见[服务启动排查](docs/troubleshooting.md#日报或工作台打不开) |
| Python 依赖缺失 | 在实际安装目录运行 `npm run setup`，见[运行环境](docs/getting-started.md#准备运行环境) |
| 网页研究失败 | 确认 `codex login` 已完成，查看网页任务错误，见[研究失败排查](docs/troubleshooting.md#网页研究或日报复核失败) |
| MCP 启动报错 | 检查 Node 路径与插件路径展开，见[MCP 排查](docs/troubleshooting.md#mcp-无法启动) |

安装、配置、数据口径和开发细节统一收录于[完整文档](docs/README.md)。本项目用于研究，不连接券商、不执行交易。

---

[MIT License](LICENSE) · Copyright © 2026 **Yiwen Pang**
