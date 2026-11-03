# Git 忽略与凭据保护

[项目首页](../README.md) · [文档导航](README.md)

## 忽略范围

| 类别 | 主要路径与文件 |
| --- | --- |
| 运行与个人数据 | `data/`、`output/`、`reports/`、`config/` 本地设置、`.runtime/`、`.codex/`、`.weave/` |
| 依赖与工具缓存 | `node_modules/`、虚拟环境、npm / pnpm / Yarn / uv 缓存、Python 与前端缓存 |
| 模型与研究产物 | `models/`、`checkpoints/`、`datasets/`、数据库、Parquet、模型权重与 checkpoint 文件 |
| 浏览器与诊断 | Playwright 状态、截图输出目录、测试报告、日志、网络 HAR、追踪和性能快照 |
| 凭据 | `.env*`、本地 MCP 覆盖、云与 SSH 凭据、私钥、包仓库登录文件、Token / Secret 文件 |
| 备份与交付 | 备份文件、压缩包与 `dist/`、`build/` |

可公开提交的例外包括 `.env.example`、`config/*.example.*`、插件清单、文档图片和 `data-corrections/` 固定修正样例。示例文件只能含占位值。

`.mcp.json` 与 `.agents/plugins/marketplace.json` 是公开插件清单，需要纳入 Git；其中不得写入真实 Key、认证 Header 或私人环境变量值。本地覆盖与认证数据应放在被忽略的路径中。

## 提交前检查

在仓库根目录执行：

```powershell
git status --short --untracked-files=all
git diff --cached --stat
git ls-files --cached --ignored --exclude-standard
```

最后一条应无输出。它能发现已经被跟踪、但本应忽略的文件。检查具体规则时，使用尚未创建的示例路径即可：

```powershell
git check-ignore -v --no-index .env.production .runtime/web.json data/portfolio.json auth/storage-state.json
git check-ignore -v --no-index .env.example config/daily-push.example.json docs/assets/codex-workspace-home.png
```

第一条应显示命中的规则；第二条不应输出忽略结果。不要使用 `git add -f` 绕过这些规则提交个人数据。

## 已跟踪文件与历史

`.gitignore` 仅影响未跟踪文件，不会擦除源码、已跟踪文件或旧提交中的密钥。已跟踪的本地文件需要明确从索引移除，例如 `git rm --cached -- <文件>`，再提交变更；这会保留本地工作文件。

若已提交真实凭据，先在对应服务撤销或轮换，再按协作流程清理历史。不要把凭据复制到 Issue、截图或日志中。当前项目没有自动凭据扫描钩子；正式发布前可用独立的 Secret Scanner 检查当前内容和历史。

## 截图与分发

截图只使用空数据或明确标记的演示数据，不包含登录状态、私人持仓、任务正文或带凭据的 URL。README 当前截图在浏览器层屏蔽了个人任务和归档接口。

Git 忽略规则不会自动作用于自行编写的打包脚本。发布时还需检查 ZIP 清单，确认未包含 `data/`、`.runtime/`、虚拟环境、真实配置或认证文件；发布目录也不要用作个人日常运行副本。打包脚本只将配置样例纳入包，文档只收录 Markdown 与图片资源。
