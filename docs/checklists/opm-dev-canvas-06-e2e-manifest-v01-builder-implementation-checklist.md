# DEV-CANVAS-06 E2E Manifest 0.1 Builder Implementation Checklist

状态：`COMPLETE / VERSIONED_HANDOFF_REPORT_REF_CLOSURE_REQUIRED`。活动Common Catalog `0.2.0` 43文件root与Family Identity Catalog `0.1.0`适配均已完成；最终source `a36a7f1fd709b72e66c57e5aea634da525c9c515`保持37项精确delta（`4 M+33 A`），显式TAP `16/16`、定向`34/34`、集成`5/5`、Bundle、READY Handoff、READY Intake、production Common/Manifest和`clean-a36a7f1fd709`安装均已闭合。固定Handoff因Candidate直接report ref仍为mutable `reports/**`而重验失败并回滚；后继修正规格已修正为`14=12 M+2 A`并冻结production显式`INSTALLED`、controlled显式`CONTROLLED`及versioned integration fixture，但尚未执行。本状态不构成E2E Report、GATE-06-03、Candidate、Activation、Capability或ISO证据。

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-e2e-manifest-v01-builder-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标/非目标：规格第 1、11、13 节。
- 输入/CLI：规格第 2、4 节。
- 目录/ref/case：规格第 5 至 8 节。
- 事务/错误：规格第 9、10 节。
- 验收：规格第 12 节。
- 回滚：删除本实现包新增代码/命令/测试并恢复入口为 `NOT_STARTED`；不得修改 Schema 或历史合并 builder。

## Build

- [x] active Profile `SYMBOL_ASSET` required logical path、178 family Coverage/Golden/Replay exact join、16 Common case 与三个 family driver 的只读输入闭包已实现并有定向测试。
- [x] 两类 CLI 的白名单/模式互斥、source-contained non-symlink 路径预检和 final root 原子事务 helper 已接入独立 builder/verifier，并有定向测试。
- [x] 固定 `jar` archive listing、路径/重复/数量/大小守卫和 allowlisted-entry temporary materialization 已接入 Manifest 输出，并有定向测试。
- [x] E2E Manifest `0.1.0` 的194/388固定字段组装、Schema预写校验、真实信任链和 final root 输出已接入，并有定向测试。
- [x] READY Intake -> exact Handoff 与 controlled descriptor 的状态、raw ref、non-symlink 信任闭包均已由主 builder/verifier复用并有正反例。
- [x] 独立 E2E builder/verifier owner 已实现，历史合并 owner 未恢复。
- [x] 生产/受控 CLI 全参数、禁止参数和模式互斥已实现。
- [x] controlled descriptor/root/raw refs 和 production Intake/Handoff trust chain 已复用现有 verifier。
- [x] clean build副本/tree ref、archive safety、五类upstream ref、Common Fixture和driver copy已闭合。
- [x] `194=178+16` case、`130+48` expectation、388 attempt summary 和稳定排序已实现。
- [x] 单一 staging root、fsync 和目录级 atomic rename 已实现。
- [x] semantic verifier只读，以controlled descriptor或production Handoff/Intake重新闭合class/raw copy；builder在rename前走受限staging入口，公开CLI拒绝staging/extra/class互用。
- [x] 稳定错误码、stderr/stdout 和退出码已实现。

## Verify

- [x] CONTROLLED_TEST 正例通过；现有不含Catalog的production Evidence Bundle 在final输出前以`E2E_MANIFEST_ARCHIVE_INVALID`稳定拒绝，待新的clean Handoff/Evidence Bundle后重验生产正例。
- [x] 参数、class、path、symlink/hardlink、archive、ref、join、Catalog/fixture/driver 反例通过。
- [x] 九个 rename 前 staging checkpoint 注入失败后，final root 与同 manifest ID 的临时 staging 均为零输出。
- [x] determinism 双构建 tree digest 相等。
- [x] verifier 前后 tree digest 相等。
- [x] production强制`--require-production`、controlled禁止该flag，mode-specific trust root和跨模式正反例通过。
- [x] 历史定向测试`22/22`仅覆盖Family Catalog适配前契约；当前定向测试`23/23`、`npm run contract:validate` 与 `git diff --check`通过。

## Contract Update Gate

- [x] `--common-fixture-root`只接受已通过02B verifier的活动Catalog `0.2.0` 43文件root，不再从clean checkout读取历史Common fixture目录。
- [x] Builder在写staging前验证`43=1+8+32+2`、16 case顺序、32个E2E asset、两份source mirror、24项factory ref和全部raw ref闭合。
- [x] 完整43文件tree逐byte复制到final `inputs/common/`，source/target tree digest相等，Catalog相对结构和ref在target内闭合。
- [x] 历史Catalog `0.1.0`、旧Catalog/factory/32 E2E布局、缺8个Visual/两份source mirror、缺项/额外项/tamper均在final root写入前返回`E2E_MANIFEST_COMMON_FIXTURE_INVALID/2`。
- [x] 新Common契约正反例、determinism、零输出事务、完整定向测试、`npm run contract:validate`和`git diff --check`全部通过。

## Family Identity Contract Gate

- [x] Evidence Bundle安全物化固定`golden/opm-e2e-family-fixture-identity-catalog.json`，Schema/payload/source Golden Manifest SHA闭合。
- [x] Catalog逐byte复制到`inputs/upstream/catalogs/family-fixture-identity-catalog.json`，并在Manifest `fixture_refs[]`中形成唯一`kind=FAMILY_FIXTURE_IDENTITY_CATALOG`普通fileRef。
- [x] `fixture_refs[]`按`path + NUL + sha256`排序，case fixture/input union与Catalog ref无缺项、重复或额外。
- [x] 178个Family `fixture_ref`深度去重为2，SHA集合与Catalog相等；Model/Context/base Revision/sequence逐fixture深度一致，parent按“字段存在则字符串、缺失则Catalog显式`null`”归一后相等。
- [x] 缺Catalog、extra/重复entry、payload/Golden Manifest SHA/fixture SHA/Project namespace/deep join drift全部在final输出前稳定拒绝。
- [x] 新契约正反例、determinism、零输出事务、完整定向测试、`npm run contract:validate`和`git diff --check`通过后，状态恢复为`COMPLETE`；生产正例仍受新的clean Handoff/Evidence Bundle前置阻断。

## Release Boundary

- [x] controlled Manifest 只能在受控输入类验证，不能作为 Gate 证据。
- [x] builder/verifier 不生成或声明 E2E Report READY。
- [x] builder/verifier 不生成 Candidate/Activation，也不启用 Capability。
- [x] builder/verifier 不声明 ISO 19450:2024 符合性。
