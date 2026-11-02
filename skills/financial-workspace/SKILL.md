---
name: financial-workspace
description: 启动知衡金融工作台，管理研究任务、日报归档、调度、策略回测和模型训练；介绍或排查 Financial Agent 插件。
---

插件研究直接使用当前 Codex 会话和 financial 工具，不要求另配模型 Key。
用户需要网页时调用 open_financial_workspace，展示返回的本机 URL。网页的自然语言研究和日报复核使用已登录的 Codex CLI；缺失时提示 codex login。

网页策略部署、回测和训练支持 A股、港股、美股，默认日线，可选周线、月线。策略任务须指定市场、1–50只股票代码和策略；模型 checkpoint 只用于训练时的市场与周期。原有A股盘中量化流程保留供历史核对。
start_financial_job 返回异步任务；用 get_financial_jobs 检查状态、错误、研究结果和进度。用户要求取消时用 cancel_financial_job。任务失败不能报告完成。
定时上午／下午日报由工作台调度并分别归档。用户手动生成报告时只确认市场，调用 start_financial_job(kind=daily)，无需选择时段；手动报告按市场当地生成时刻单独归档，不参与定时日报的上午／下午复盘。get_daily_research_report 的 morning/afternoon 参数用于直接获取对应时段的结构化证据和快照。list_financial_reports/read_financial_report 读取历史正文。
set_report_schedule 保存本地调度；需要工作台进程持续运行。A/HK 按北京时间，美股按纽约当地时间自动处理夏令时。只有用户要求调度时才修改配置。

网页回测与训练按市场和周期选择经典策略或真实模型版本，再开始任务。训练与回测为研究计算，绝不下单。新周期回测使用用户指定的固定股票池与复权价，需说明幸存者偏差、模型截止日、费用和未模拟的交易约束。
失败时优先展示工具错误与缺失依赖。项目目录 npm ci、npm run setup 完成环境准备，npm run check 校验插件，npm start 打开工作台。不要读取或输出用户凭据。
