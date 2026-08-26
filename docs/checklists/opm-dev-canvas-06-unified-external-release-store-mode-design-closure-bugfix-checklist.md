# Checklist: DEV-CANVAS-06 Unified External Release Store Mode

状态：`FROZEN/SUPERSEDED_AS_STANDALONE_SOURCE_PACKAGE`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 规格责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标/边界 | 1 | C01~C04 |
| Root Cause/Fix | 2 | C05~C08 |
| owner/commit/patch | 3 | C09~C15 |
| CLI/兼容 | 4 | C16~C21 |
| external root | 5 | C22~C27 |
| source clean | 6 | C28~C32 |
| quarantine/事务 | 7、8 | C33~C41 |
| 错误/验收 | 9、10 | C42~C48 |
| 完成/回滚/状态 | 11 | C49~C52 |

## Checklist

- [x] C01 只修正统一输入external mode与outer orchestrator闭包。
- [x] C02 Schema/API/SQLite/Profile/Java/Vue/公共HTTP保持只读。
- [x] C03 不执行Manifest、194/388、Report或Gate。
- [x] C04 修改边界仅为9项source和限定设计同步文档。
- [x] C05 已复现旧Builder把输出写入source内handoff root。
- [x] C06 已复现旧Verifier要求final位于source且放行该untracked root。
- [x] C07 已确认旧语义与完整source-clean/external root不能同时成立。
- [x] C08 Fix固定为修改统一helper/Builder/Verifier并新增orchestrator。
- [x] C09 新allowlist=`9=7 M+2 A`。
- [x] C10 7个M和2个A路径逐项冻结。
- [x] C11 总owner closure仍为41项。
- [x] C12 base固定`e598b305a44ebb9c9845c1f5563bc36c3a89a2b4`。
- [x] C12A base只指Git对象，新实现必须创建clean worktree且禁止复用65项失败现场。
- [ ] C13 新commit唯一parent为`e598...`。
- [ ] C14 exact name-status与9项逐项相等。
- [ ] C15 source patch SHA、package raw SHA和完整commit已记录。
- [x] C16 Builder外置CLI完整冻结。
- [x] C17 Verifier外置CLI完整冻结。
- [x] C18 Orchestrator CLI与两者使用同一base/source/root。
- [x] C19 production拒绝handoff/out/input/path override。
- [x] C20 旧无mode/base=daf CLI不提供production fallback。
- [ ] C21 参数/mode/base/source正反例通过。
- [x] C22 Profile/Handoff/releases/input路径仅从release store派生。
- [x] C23 unified staging与final位于同一releases parent/filesystem。
- [x] C24 quarantine归属于external Handoff releases sibling。
- [x] C25 Manifest和Profile staging位于external store独立命名空间。
- [x] C26 source/release realpath、inode、互不包含和non-Git已冻结。
- [ ] C27 root alias/link/Git/cross-fs/target residual反例通过。
- [x] C28 Builder/Verifier/orchestrator使用完整porcelain空值。
- [x] C29 禁止final untracked例外、path filter和ignore变更。
- [x] C30 Builder三个clean reachpoint已冻结。
- [x] C31 Verifier前后及orchestrator后续clean reachpoint已冻结。
- [ ] C32 任一tracked/untracked漂移负例通过。
- [x] C33 Marker Schema/字段/bytes保持0.1不变。
- [x] C34 marker内部input_root仍相对handoff root，无需Schema升级。
- [x] C35 Builder是post-rename unified marker唯一writer。
- [x] C36 Unified Verifier和Manifest链只读检查marker/temp。
- [x] C37 rename前失败零marker，rename后失败写marker。
- [x] C37A rename后强停形成的无marker residual仍因无成功三元组/final存在而隔离。
- [x] C38 Builder以新进程执行installed Unified Verifier。
- [x] C39 unified成功stdout固定tab三元组。
- [x] C40 unified与Manifest事务owner互不删除对方root。
- [x] C41 外层唯一执行顺序已冻结。
- [x] C42 既有统一错误码不新增，首错映射已冻结。
- [ ] C43 正例证明9项、external input、新进程Verifier及三元组闭合。
- [ ] C44 旧CLI、root、clean、marker和事务反例矩阵通过。
- [ ] C45 四份Node定向test通过。
- [ ] C46 Manifest v02 test与contract validate通过。
- [x] C47 `git diff --check`、文档链接和计数通过。
- [ ] C48 source与release root测试前后tree/status不变。
- [ ] C49 C13~C48全部通过后才标记production input READY。
- [x] C50 旧3文件包已标记SUPERSEDED，不得并行实现。
- [x] C51 本设计闭包未生成Manifest/Report/Gate/Candidate/Activation。
- [x] C52 回滚边界只允许未安装staging，installed资产等待恢复授权。

## 当前事实

- `e598...`旧Builder/Verifier确实绑定source内handoff root和untracked例外。
- 新9文件闭包设计已冻结，作为17路径集成source的职责子集继续有效。
- C13~C49只能由`opm-dev-canvas-06-common-orchestration-integrated-source-closure-bugfix-task-spec.md`联合执行；禁止创建独立9项production source commit或单独标记READY。
- 当前不能直接执行Unified Builder、Manifest Producer或outer orchestrator。
