# Checklist: GOLDEN-AUTHORING-02B Common Visual Fixture Contract/Planner 实现

状态：`IMPLEMENTED / CONTROLLED_TEST_PASS / NOT_RELEASE_VALIDATED`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-common-visual-fixture-contract-implementation-task-spec.md`。
- Task Type：`feature`。
- Active Playbooks：`testing (primary)`、`design-module-docs`。
- 目标/设计输入/前置条件：规格第 1 至 3 节。
- 允许/禁止修改：规格第 4 节。
- CLI/输出/实现：规格第 5、6 节。
- 错误/事务/测试/验收：规格第 7 至 10 节。
- 回滚与 release boundary：规格第 11、12 节。

## Input Gate

- [ ] 全局设计基线为 `READY_FOR_DEVELOPMENT`。
- [ ] 使用 READY Handoff/Intake 和 exact active binding。
- [ ] 旧 fixture/Catalog/Plan 已标识为只读历史输入，目标 output root fresh。
- [x] Common Visual Fixture`0.1`机器Schema已由设计修正包发布并冻结；validator与正反contract test已实现。
- [x] 已建立`./scripts/canvas06-rfc8785.mjs`唯一02B owner并删除Planner局部JCS；未从历史script复制第二实现。

## Build

- [x] 已冻结Common Visual Fixture`0.1/0.1.0`Schema的validator与正反contract test完成，未修改Schema。
- [x] 8 个完整 factory fixture、固定顺序和确定性 bytes 完成。
- [x] 同一静态factory按固定16 case顺序确定性生成32个E2E base/input，禁止复制历史E2E bytes。
- [x] 实际generator/factory source逐byte镜像到固定`sources/**`，Catalog source refs只指mirror。
- [x] 活动Catalog固定`catalog_version=0.2.0`；历史`0.1.0`保持不可变且被新semantic preflight拒绝。
- [x] 新 Catalog builder 的`44=1+8+32+2+1 Common Setup Plan` fresh staging/atomic rename/零输出事务完成。
- [x] 只读 semantic verifier、exact 44文件inventory、Common Setup Plan和tree digest守卫完成。
- [x] Planner Common Projection semantic join 和旧占位 digest 拒绝完成。
- [x] `srgb -> sRGB IEC61966-2.1` 唯一 pure function 与 Planner 复用入口完成。
- [x] 10项exact Node/Java共用parity vector完成，Node逐项canonical/SHA、safe integer边界、UTF-16 key排序和非法值反例通过；Java 03C parity仍未实现。
- [x] npm 命令已接入且没有新增依赖。

## Verify

- [ ] 8 subject的语义、布局、五类index entry字段/排序/ID/时间/状态/null、8类step shape/exact对象、focus、cell和Projection全闭合。
- [x] `72=8*3*3` Common capture、每 subject 9 项及 digest 深度复算通过。
- [ ] Schema/source mirror/ref/payload/binding/顺序/篡改和旧输入反例稳定返回冻结错误。
- [ ] 16 case顺序、32路径/factory重算、24项factory ref相等和全部Catalog ref在同一root闭合。
- [ ] `--source-root`/`--e2e-root`/source override、历史author/bytes、cwd/env/dynamic source、缺失/额外/link/escape/Git metadata均拒绝。
- [x] Color Profile 正例与 trim/case/alias/重复/冲突参数反例通过。
- [x] 两次 build byte-identical，已存在输出根拒绝且未产生 staging 最终输出。
- [x] verifier 前后 root tree digest 相等。
- [ ] Builder/Verifier/Planner只导入共享Node JCS模块，无局部副本。
- [ ] wall time `<=5 s`、peak RSS `<=256 MiB`。
- [x] `common-visual:test`、独立build/verify、Planner回归、Golden Authoring Schema、`contract:validate`和`git diff --check`通过；JDK 21由受控本机路径提供。

## 本轮验证

- `npm run release:canvas06:common-visual:test`：`14/14`通过，覆盖44文件构建/只读验证、单字节篡改、source mirror、额外文件或链接、staging故障、确定性与factory矩阵。
- `JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home npm run release:canvas06:golden:plan:test`：`3/3`通过，覆盖`1242/9`确定性Plan、历史/dirty/golden-like零输出拒绝与非Java 21拒绝。
- `npm run release:canvas06:common-visual:jcs:test`：`2/2`通过。
- `npm run release:canvas06:common-visual:color-profile:test`：`2/2`通过。

以上验证使用受控临时根或测试输入。READY Handoff、fresh release root、性能阈值与后续Plan/SQLite/PNG/authoring证据仍未执行。

## Risks And Residuals

- [ ] 02B 完成也不表示 03C/03B 已实现或新 production Plan 已生成。
- [x] E2E Manifest builder的历史43文件root适配与`22/22`重验已记录；活动输入由44-file inventory闭包重新验收，后续Family Identity Catalog适配由独立契约Gate跟踪，不回退本项。
- [ ] 8 个 SQLite base、144 个 clone、1242 PNG、candidate 和 approved version 仍不存在。
- [ ] GATE-06-03、Candidate、Activation、Capability 和 ISO 状态不得提升。
- [x] Common Driver改变factory语义后的32个E2E/Catalog raw ref重建由独立Common E2E输入重建规格承接，现有02B局部结果不得作为活动clean root。

## Rollback

- [ ] 只回退02B新增builder/verifier/helper/test/命令和planner/Factory增量；冻结Schema只能经独立设计bugfix变更。
- [ ] 不删除或覆盖历史、release、approved 或用户资产。
