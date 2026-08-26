# Checklist: DEV-CANVAS-06 Manifest v02 外置 Release Orchestrator

状态：`SUPERSEDED/DO_NOT_IMPLEMENT`

后继Checklist：`opm-dev-canvas-06-unified-external-release-store-mode-design-closure-bugfix-checklist.md`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 规格责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标/非目标/修改边界 | 1 | C01、C02 |
| Root Cause/Fix Strategy | 2 | C03~C06 |
| owner/commit/package命令 | 3 | C07~C12 |
| 双物理根/source clean | 4 | C13~C20 |
| CLI/owner/子进程 | 5 | C21~C26 |
| staging/verify/fsync/rename/install | 6 | C27~C35 |
| 失败/错误码 | 7 | C36~C40 |
| 正反例 | 8 | C41~C44 |
| 完成/回滚/Gate | 9、10 | C45~C48 |

## Checklist

- [x] C01 仅补外置release orchestrator，不执行Manifest或E2E。
- [x] C02 Schema/API/SQLite/Java/Vue/Profile业务bytes保持只读。
- [x] C03 `e598b305...`为`30f7...`单parent且delta=`8=3 M+5 A`。
- [x] C04 `e598...`patch SHA=`68231699973031cac3d9eaab8371b14ffdbfee5a2a186d6f9fdc81a2c7c87bbc`。
- [x] C05 内嵌`clean-e598...`产生exact 65个untracked文件，复现source-clean拒绝。
- [x] C06 output-root位于source-root时复现Producer `PATHS`拒绝。
- [x] C07 新allowlist固定`3=1 M+2 A`。
- [x] C08 新owner固定为package、orchestrator和单一test。
- [x] C09 总owner closure固定`41`项。
- [ ] C10 package命令按冻结位置/bytes写入，依赖和lockfile不变。
- [ ] C11 新commit单parent=`e598...`，name-status恰为3项。
- [ ] C12 新source patch SHA及完整40位commit已记录。
- [x] C13 source-root和release-store-root绝对、realpath独立且互不包含。
- [x] C14 release store不是Git worktree，installed Profile root只承载release命名空间。
- [x] C15 Handoff/Input、Manifest和Profile Staging路径均从external store唯一派生。
- [x] C16 source Profile五资产仍只从source-root固定路径读取。
- [x] C17 source clean使用完整`--untracked-files=all`且禁止path filter/ignore例外。
- [x] C18 source clean四个reachpoint已冻结。
- [x] C19 ignored build outputs仍按既有Bootstrap/raw/tree契约复核。
- [ ] C20 source/release root symlink、alias、包含、Git worktree和跨filesystem负例通过。
- [x] C21 orchestrator完整CLI及禁止path override已冻结。
- [x] C22 orchestrator唯一拥有外层transaction，不重实现业务语义。
- [x] C23 四个既有子入口只读复用。
- [x] C24 子入口raw SHA前后不变且固定Node 22/JDK 21。
- [x] C25 staging/installed verifier必须为不同PID新进程。
- [ ] C26 shell/PATH替换/env注入/test double production负例通过。
- [x] C27 source12/intake12/manifest/release/profile staging路径公式已冻结。
- [x] C28 Producer参数由两个root和identity唯一映射。
- [x] C29 外层唯一顺序已冻结。
- [x] C30 staging verifier在outer rename前独立退出0且tree不变。
- [x] C31 staging完整fsync后才允许atomic rename。
- [x] C32 rename后parent fsync先于installed verifier。
- [x] C33 installed verifier为新进程且installed tree不变。
- [x] C34 最终stdout只允许path/raw SHA/tree SHA三元组，tree SHA按完整transaction root普通文件inventory/JCS公式复算。
- [ ] C35 两个Verifier正例和写入/extra-output/tree-drift反例通过。
- [x] C36 rename前只删除本进程exclusive mkdir且目录句柄`st_dev/st_ino`仍相等的owned staging，input root保持只读。
- [x] C37 rename后失败保留immutable root且零READY ref。
- [x] C38 禁止复用统一Quarantine Marker或发明新Marker。
- [x] C39 十个稳定错误码/退出码和首错顺序已冻结。
- [ ] C40 fsync/rename/crash residual/installed verify故障矩阵通过。
- [ ] C41 正例证明source四次clean、两个installed verifier及三元组闭合。
- [ ] C42 反例证明65项过滤、ignore修改和内嵌root均被拒绝。
- [x] C43 旧`clean-e598...`未移动、复制、清理或消费。
- [ ] C44 `git diff --check`、文档链接和定向test通过。
- [ ] C45 C10~C44全部通过后才标记Manifest production input READY。
- [x] C46 本设计闭包未执行194/388、Report或Gate。
- [x] C47 本设计闭包未生成Candidate/Activation或启用Capability。
- [x] C48 回滚边界已冻结为只删除未安装outer staging，installed资产等待独立恢复授权。

## 当前事实

- `e598b305...`source集成已完成，但其内嵌installed root违反双物理根契约。
- Producer/Verifier的严格source clean与root独立守卫正确，禁止放宽。
- 外置orchestrator尚未实现或执行，当前不能继续Manifest Producer。
- 本`3=1 M+2 A`清单不再是活动实现入口；`9=7 M+2 A`只保留为External Store职责子集，统一Builder/Verifier external mode与orchestrator最终由`17=14 M+3 A`集成Source清单联合验收。
