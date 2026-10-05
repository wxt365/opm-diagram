# 本地运行与测试产物忽略规则修复

日期：2026-10-05。Work Mode：change；Risk Level：L1；Task Type：bugfix；Active Playbooks：none（primary）。

## Plan / Lean Spec

目标：忽略本地 Runtime 数据、临时截图、Playwright 输出、macOS 元数据、已查明的根目录归档副本及用户指定仅本地保留的根 `AGENTS.md`。非目标：清理磁盘、提交代码、改变运行配置或整理业务文件。

允许：根 `.gitignore`、本文、`test-results/.last-run.json` 和根 `AGENTS.md` 的 Git 索引状态。禁止：修改源码、测试、fixture、设计/API/Schema、依赖和锁文件；删除本地数据或其他文件；修改 `.harness/`、已有业务变更与 Git 历史。

原因：根忽略规则未覆盖 `runtime-data/`、`tmp/`、Playwright 输出和 `归档.zip`；其中 `.last-run.json` 已被跟踪，新增忽略规则无法使它退出索引。验收 I01：目标文件被忽略且本地保留；I02：源码、fixture、文档、锁文件及 CodeGraph 忽略配置仍可提交；I03：唯一索引删除为已确认的测试运行状态文件。

实现顺序：采用根目录限定模式，复用已有 Maven/前端构建与 CodeGraph 忽略规则；取消 `.last-run.json` 跟踪；执行 `git check-ignore`、索引核对与 `git diff --check`。配置不涉及公共契约，不需要应用构建或业务测试。

回滚：逆向撤销本任务 `.gitignore` 新增块，并重新 `git add -f -- test-results/.last-run.json` 恢复跟踪；文件内容和运行数据保留。

## Checklist

引用：`Plan#Lean Spec`。

- [x] 边界确认：仅忽略规则、本文和指定索引条目；现有文件和用户变更保留。
- [x] I01：10 个目标路径忽略检查通过；已有数据库、临时截图、运行状态和归档副本仍在本地。
- [x] I02：9 个源码/测试/fixture/文档/锁文件/CodeGraph 配置路径均未被忽略。
- [x] I03：初次核对唯一 staged 变更为 `.last-run.json` 的索引删除；`git diff --check`、`git diff --cached --check` 通过，已跟踪且被忽略的文件列表为空。

追加验收 I04：按用户指令将根 `AGENTS.md` 设为本地文件，增加 `/AGENTS.md`，仅取消其索引跟踪，保留原内容。回滚时撤销该规则并执行 `git add -f -- AGENTS.md`。不扩大到其他目录的同名文件。

- [x] I04：根 `AGENTS.md` 被忽略且退出索引；本地字节与 HEAD 原内容一致。staged 删除仅根 `AGENTS.md` 和前次 `.last-run.json`；差异检查通过。
