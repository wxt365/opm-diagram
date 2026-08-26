# Checklist: DEV-CANVAS-06 Manifest v02 集成 Source 重建

状态：`SOURCE_INTEGRATION_IMPLEMENTED/PRODUCTION_BLOCKED`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 规格责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标/非目标 | 1 | C01、C02 |
| Root Cause/Fix Strategy | 2 | C03、C04 |
| Commit/版本身份 | 3、5 | C05~C09 |
| Composite allowlist与重叠计数 | 4 | C10~C15 |
| 历史根/新根/quarantine | 6 | C16~C20 |
| 同commit重建顺序 | 7 | C21~C25 |
| Manifest生产root/事务/失败隔离 | 8 | C26~C33 |
| 验收与验证 | 9 | C34~C40 |
| Gate/回滚/状态 | 10、11 | C41~C46 |

## Plan

- [x] C01 本包只闭合统一production输入和Manifest v02 production输入，不执行194/388。
- [x] C02 不生成Report、Gate、Candidate、Activation、Capability或ISO结论。
- [x] C03 已复现两实现链从`daf383...`分叉且互不为祖先。
- [x] C04 修复策略固定为`30f7...`单parent加exact 8项集成，不merge/cherry-pick整分支。
- [x] C05 `common_ancestor_commit=daf383df6d7faad866b84fceac0a2c9111a8c926`。
- [x] C06 `integration_base_commit=30f7edc5397bf4e2bd69e1c8cf5f09eaf8e875b9`。
- [x] C07 `manifest_reference_commit=1e040511b9b54eaf0939cdb525f093a4b3419fc2`且只作byte reference。
- [x] C08 `e598b305...`只有一个parent且逐字符等于`30f7...`。
- [x] C09 `source12=e598b305a44e`、epoch及source identity已复算；intake12/manifest仍待external重建。
- [x] C10 统一输入23项与Manifest 17项唯一重叠仅为`package.json`。
- [x] C11 Composite owner closure=`23+17-1=39`，39项清单已冻结。
- [x] C12 相对`30f7...` source delta固定`8=3 M+5 A`。
- [x] C13 exact 8项name-status与规格逐项相等，其他31个owner不进入patch。
- [x] C14 `package.json` raw SHA为`ec8b8112...`并保留两类命令。
- [x] C15 patch SHA=`68231699973031cac3d9eaab8371b14ffdbfee5a2a186d6f9fdc81a2c7c87bbc`。
- [x] C16 `clean-30f7edc5397b`只读历史身份不等于当前checkout已安装事实。
- [ ] C17 历史根和其他`clean-*`未复制、覆盖、追加、删除或移动。
- [ ] C18 新统一输入根必须位于external installed Profile root；source内`clean-e598...`已被拒绝。
- [ ] C19 读取新根前exact final/temp quarantine guard通过。
- [ ] C20 marker存在/非法/link/I/O及其他source12隔离负例通过。
- [ ] C21 新clean worktree基于integrated commit且build前无node_modules/dist/target残留。
- [ ] C22 Node 22、Bootstrap Closure、Web/Evidence/Runtime构建按固定顺序通过。
- [ ] C23 Handoff 0.2、READY Intake、Runtime/Web/Common同commit生成并安装。
- [ ] C24 统一输入installed verifier退出0且tree digest/refs闭合。
- [ ] C25 Manifest Producer只消费同一commit的Handoff/Intake/Runtime/Web/Common/driver/Profile。
- [x] C26 Manifest release parent已修正为`<external-release-store-root>/manifests/e2e-v02`。
- [x] C27 release id固定`clean-<source12>-<intake12>`，final root包含冻结Manifest ID。
- [ ] C28 Producer只在fresh外层staging release root运行，输入根保持只读。
- [ ] C29 staging release root上的独立Manifest verifier退出0且tree不变。
- [ ] C30 外层fsync/atomic rename/parent fsync后installed verifier再次退出0。
- [ ] C31 不创建latest、fixed pointer、symlink或输入根Manifest副本。
- [ ] C32 rename前失败零final；crash residual阻断覆盖。
- [ ] C33 rename后失败root保留为`FAILED_INSTALLED_REVERIFY`且未进入Runner/Gate输入。
- [ ] C34 Manifest v02定向7文件测试通过。
- [ ] C35 统一输入测试通过。
- [ ] C36 `npm run contract:validate`通过。
- [ ] C37 `git diff --check`和文档链接检查通过。
- [ ] C38 39/8计数、commit/parent/patch SHA、环境和全部raw/tree ref已记录。
- [ ] C39 source/identity/root/quarantine/事务负例矩阵通过。
- [ ] C40 正例证明两个installed verifier均退出0且历史root bytes不变。
- [ ] C41 仅在C08~C40全部通过后标记`IMPLEMENTED/MANIFEST_V02_PRODUCTION_INPUT_READY`。
- [ ] C42 未执行194/388、未生成E2E Report、`GATE-06-03`保持`NOT_RUN`。
- [ ] C43 production gate保持disabled，未生成Candidate/Activation或启用Capability。
- [ ] C44 回滚只删除本轮未安装staging；installed失败根等待独立恢复授权。
- [x] C45 双物理根与外层orchestrator后继规格已冻结。
- [ ] C46 后继`17=14 M+3 A` Common/External集成Source实现和external production重建完成；独立9项/8项commit均禁止消费。

## 当前事实

- 两个历史实现commit及共同祖先已通过Git对象核对。
- 39项owner并集和相对`30f7...`的8项diff已复算。
- 当前主工作树不存在`clean-30f7edc5397b`目录，不能宣称其installed READY。
- source集成commit已记录；内嵌65文件输入根违反clean/root守卫，不能继续Producer。
- production执行转由Unified External Release Store Mode checklist承接；旧3文件orchestrator checklist只读。
