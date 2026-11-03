# 问题排查

[项目首页](../README.md) · [文档导航](README.md)

## 日报或工作台打不开

1. 在 Codex 中请求“打开知衡工作台”，使用工具返回的真实地址。默认端口 `3205` 被占用时会选择其他端口。
2. 确认插件已在当前聊天启用并被加载。仅安装插件不会自行启动服务。
3. 在**实际安装目录**运行 `npm run dev`，查看启动错误；自动启动日志位于 `.runtime/workspace.log`。
4. 若设置了 `FINANCE_WEB_AUTOSTART=0`，删除该覆盖或手动启动。

服务停止后，再次调用 `open_financial_workspace` 会重新检查并启动。不要将源码仓库和插件缓存目录当成同一个运行副本；它们各有数据和端口状态。

## Python 依赖缺失

在出现故障的运行副本中执行：

```powershell
npm ci --ignore-scripts
npm run setup
```

若使用 `FINANCE_PYTHON`，确认其指向装有 `requirements.txt` 依赖的解释器。仓库已有 `.venv` 不表示新安装的插件副本也有该环境。

## MCP 无法启动

确认 Node.js ≥ 22.13 且 `node` 在 Codex 启动环境的 PATH 中。检查实际安装副本是否包含 `node_modules`。

若错误路径中原样出现 `${PLUGIN_ROOT}`，说明当前客户端未展开插件路径。曾在 Codex CLI 0.166 alpha 遇到此问题，可在实际安装目录注册绝对路径：

```powershell
$pluginRoot = (Get-Location).Path
codex mcp add financial -- node "$pluginRoot/scripts/mcp-server.mjs"
```

完成后重新加载插件或新建聊天。该方式是路径兼容回退，不需要修改认证文件。

## 网页研究或日报复核失败

先检查网页任务中的错误，再确认 `codex login` 已完成。`FINANCE_CODEX_BIN` 指定的命令需要可执行，`FINANCE_CODEX_MODEL` 需要当前账户可用。

研究、日报和持仓识别异步执行；已有任务运行时，新任务会提示等待或取消。失败任务不会被当成成功日报归档。

## 行情、公告或市场数据缺失

- 上游数据服务可能超时、限流或改字段。保留返回的来源、`as_of` 和缺失说明，不让模型补造数据。
- 美股搜索、报价和日线可使用 24 小时内同参数的缓存，来源会标记缓存获取时间；无有效缓存时返回错误。
- SEC 公告需要 `SEC_USER_AGENT`，填写访问者名称与联系邮箱。它不是模型 Key。
- 港股 HKEX 公告与同行披露未接入，缺失提示不是插件安装失败。

需要重装数据依赖时，在对应虚拟环境执行安装命令；不要对其他 Python 环境盲目升级。

## 原盘中回测下载慢或报 UTF-8 错误

“检查 5 分钟线”阶段仍在下载和验收，GPU 不会加速网络取数。已完成且通过验收的缓存会在重试时复用。

BaoStock 超时后继续使用同一连接可能读到上一条响应残留，产生解码错误。现有准备流程会关闭异常连接并重试，失败时保留可用缓存。避免同时启动多轮 BaoStock 采集。原盘中引擎详见[因子研究](factor-lab.md)。
