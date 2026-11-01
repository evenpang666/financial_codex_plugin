---
name: financial-workspace
description: 启动知衡金融工作台，管理研究任务、日报归档、调度、策略回测和模型训练；介绍或排查 Financial Agent 插件。
---

插件研究直接使用当前 Codex 会话和 financial 工具，不要求另配模型 Key。
用户需要网页时调用 open_financial_workspace，展示返回的本机 URL。网页的自然语言研究和日报复核使用已登录的 Codex CLI；缺失时提示 codex login。

原有A股/港股研究及A股盘中量化流程已保留。美股显式 market=us，用美股日线流程。
start_financial_job 返回异步任务；用 get_financial_jobs 检查状态、错误、研究结果和进度。用户要求取消时用 cancel_financial_job。任务失败不能报告完成。
日报先确认市场与时段：get_daily_research_report 获取结构化证据和快照；start_financial_job(kind=daily) 另外完成 Codex 复核及网页归档。list_financial_reports/read_financial_report 读取历史正文。
set_report_schedule 保存本地调度；需要工作台进程持续运行。A/HK 按北京时间，美股按纽约当地时间自动处理夏令时。只有用户要求调度时才修改配置。

回测与训练首先列出 get_strategy_checkpoints，选择经典策略或真实模型版本，再开始任务。训练与回测为研究计算，绝不下单。保留数据质量校验、模型截止日、费用、交易约束与样本外限制。
失败时优先展示工具错误与缺失依赖。项目目录 npm ci、npm run setup 完成环境准备，npm run check 校验插件，npm start 打开工作台。不要读取或输出用户凭据。
