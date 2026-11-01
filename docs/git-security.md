# Git 忽略与凭据保护

[返回文档导航](README.md)

本仓库的 `.gitignore` 默认排除 `data/`、运行缓存、虚拟环境、构建产物、日志、数据库和模型文件。本地 `config/` 配置及常见 `.env`、Token、私钥、云凭据路径也会被忽略；`config/*.example.*`、`.env.example` 和独立的 `data-corrections/` 校验样例仍可提交。

修改规则后可检查：

```sh
git check-ignore -v config/daily-push.json data/us-cache/example.json .env
git check-ignore -v config/daily-push.example.json .env.example
git ls-files -ci --exclude-standard
```

第一条命令应显示命中的忽略规则；第二条的示例文件不应被忽略；最后一条应无输出。如果某个敏感文件已经被 Git 跟踪，新增 `.gitignore` 不会自动移除它，需要用 `git rm --cached <路径>` 从索引移除。历史提交中的密钥仍需撤销或轮换，并单独处理历史记录。

`.gitignore` 不能阻止 `git add -f`，也不能识别写在普通源码或示例文件中的密钥。提交前应检查暂存内容；当前仓库没有自动凭据扫描钩子。
