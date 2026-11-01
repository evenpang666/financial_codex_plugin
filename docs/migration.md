# Codex迁移与验收

源：同级 financial_agent_windows（读取源代码迁移，未改动原项目）。目标：当前独立仓库。

## 迁移对应关系

| 源组件 | 当前实现 | 验证 |
| --- | --- | --- |
| DSH tools.register 21工具 | engine/tools.mjs → scripts/mcp-server.mjs | MCP实际握手、工具枚举、参数校验、真实Python调用 |
| DSH skills.register 8技能 | skills/8个原技能 + us-share-research + financial-workspace | manifest/技能目录校验 |
| DSH Agent/默认模型/凭据 | 插件直接用当前Codex；网页lib/agent.mjs调用Codex CLI | CLI命令结构与事件处理测试；真实用户登录研究单独验收 |
| A/HK AKShare数据引擎 | scripts/stock_data_server.py | 原金融功能回归测试 |
| 持仓导入/预览/编辑/删除/三方案复核 | lib/portfolio.mjs + portfolio_research.py + 原HTTP接口 | 原测试及新增美股碎股/代码测试 |
| 日报/快照/反思/归档/网页SSE | 原Python报告服务 + lib/server.mjs + scheduler.mjs | 日报归档/取消/失败保护/时区测试 |
| 原A股数据准备/质量校验/8策略/2模型/训练/回测/checkpoint/部署 | 原factor_*、strategy_*、intraday_ranking.py | 原计算引擎测试保留 |
| 原A股周训练/可选Webhook | factor_scheduler.py / daily_push.py | 原单元测试保留，未发送外部消息 |
| DSH启动注册/升级脚本 | 独立launch/setup/start脚本与插件清单 | 本机工作台启动、浏览器页面检查 |
| 新增美股数据 | us_market.py | 假期/DST/提前收市/复权/SEC URL/数据源隔离测试；Yahoo真实取数 |
| 新增美股日线训练回测 | us_strategy.py | 因果特征、下一交易日执行、成本、checkpoint哈希、训练区间隔离测试；真实AAPL/MSFT训练与样本外回测 |

删除的旧宿主测试仅针对已移除的DSH安装、版本和注册机制。金融计算测试保留；DSH Agent测试由Codex桥接测试替代。修复了原空持仓在默认未训练模型时提前报错的问题。

## 本次实际验证（2026-10-31至2026-11-01）

- Node测试32项全部通过；最终Python测试230项中229项通过、1项跳过，无失败。分发包在独立目录解压并创建不继承系统包的Python虚拟环境后，曾通过迁移时229项Python测试；新增1项验证Yahoo日线限流时的缓存回退。
- ZIP完整性检查通过；分发包不含用户数据、凭据、开发虚拟环境和运行缓存。
- Playwright使用本机Edge检查研究、日报、回测页面，以及美股切换和模型训练表单。
- Yahoo真实查询：AAPL搜索、2026-10-26至2026-10-30日线、2026-10-30报价与季度报表；US筛选池275条。新闻接口当时返回空列表，不能据此声称没有市场事件。
- AAPL/MSFT真实Elastic Net训练：2025年区间；模型冻结后回测2026-01-02至2026-10-30，209个交易日、245条模拟往返交易。测试产物在.test-tmp，不进入用户正式模型菜单。此记录仅验证执行链路，不构成策略有效性证明。
- SEC_USER_AGENT未配置：SEC真实网络披露请求未验收；SEC字段、日期筛选及链接构建使用固定数据测试。
- 截至迁移初验时尚未运行真实账户Codex研究回合或注册全局插件；后续验收见下一节。插件未发布公共商店。

## 全局安装和真实Codex调用（2026-11-01）

- 已注册 `zhiheng-local` 本地marketplace，并将 `financial-agent@zhiheng-local` 1.0.0 安装到 Codex 全局插件缓存；安装副本的独立Python环境已完成依赖安装，清单检查通过。
- 使用已登录的真实 Codex CLI 和全局安装副本调用金融MCP。A股600519回合调用 `stock_search`、`get_quote_snapshot`、`get_ohlcv`，返回贵州茅台人民币报价及2026-10-26至30日日线。
- 美股AAPL回合调用同三个工具，返回344.63 USD、供应商报价时间2026-10-30 16:00:01纽约时间及2026-10-26至30日五根不复权日线。Yahoo请求在Codex工具进程内遭限流；这些美股结果来自同日直接取得的真实Yahoo数据的24小时缓存，来源中标注了缓存获取时间，不宣称为实时刷新。
- 实际调用中修正了HTTP查询解析丢弃空 `adjust` 导致不复权请求落到前复权的缺陷。未执行交易。

## 保持明确的原有限制

港股HKEX公告与港股量化执行原本未接入，工具继续明确报缺失。A股行情、分钟线和公司行为质量依赖上游数据源；不以合成数据伪装实测。美股日线模型和A股盘中模型分开存储、选择与验证。美股样本筛选不是历史全市场数据库。

## 参考规范

- [OpenAI插件打包](https://developers.openai.com/plugins/build/plugins)
- [本地stdio服务器与PLUGIN_ROOT](https://developers.openai.com/plugins/deploy/desktop-only)
- [Codex非交互执行](https://learn.chatgpt.com/docs/non-interactive-mode)
- [yfinance日线参数](https://ranaroussi.github.io/yfinance/reference/yfinance.price_history.html)
- [SEC EDGAR API](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
