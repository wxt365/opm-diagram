# DEV-CANVAS-06 E2E Profile Asset 与摘要闭包修正 Checklist

状态：`FROZEN_FOR_BUILD / SCHEMA_CONTRACT_19_OF_19`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 问题/目标：规格第 1、2 节。
- 非目标/边界：规格第 3、4 节。
- 版本与 CLI/Profile/input/JAR信任：规格第 5、6 节。
- 摘要与 parity：规格第 7、8 节。
- 实现顺序/验收/状态：规格第 9 至 12 节。

## Plan

1. P0：冻结 Manifest `0.2` 的 Profile asset tree/raw refs 和 CLI raw 校验；
2. P0：冻结 Attempt Artifact `0.2` 的 Profile asset join 与 Artifact Index 扩展；
3. P1：冻结 OPL/Trace/Token 三类摘要 owner、JCS preimage 和 Node/Java parity vectors；
4. P1：同步 Manifest/Runner/Artifact verifier 规格与历史 `0.1` 只读边界；
5. P0：冻结 direct-root Profile、Materializer `--input`自校验和当前进程JAR code source；
6. P0：冻结`source_sha256` exact Runtime JAR raw-byte preimage、producer/verifier和相等不变量；
7. P0：冻结Manifest `generated_at`到`source_date_epoch`的严格UTC整秒往返、唯一seed时间和零输出边界；
8. P0：冻结Spring Boot `jar:nested:<outer>/!BOOT-INF/classes/!/`唯一CodeSource及外层physical JAR安全反解析；
9. P1：完成 Schema/JSON/parity 设计验证，保持完整 CLI 成功路径未实现。

## Boundary

- [x] 不修改历史 Manifest/Attempt Artifact `0.1` Schema 或 bytes。
- [x] `v1.4`时间/nested CodeSource语义追加不修改活动Manifest/Attempt Artifact `0.2` Schema或机器artifact。
- [x] 不修改 `services/**`、现有 CLI 成功路径、产品 API、SQLite、Vue、fixture、Handoff、Intake 或 Evidence Bundle。
- [x] 不生成 E2E Report、194/388、Gate、Candidate、Activation 或 Capability。

## Build

- [x] 新增 Manifest `0.2` Schema，增加 `profile_asset_tree_ref` 与 5 项具体类型的 `profile_asset_refs`。
- [x] 新增 Attempt Artifact union `0.2` Schema，增加 `fixture-materialization.profile_asset_*`、Profile Index 条目及五类 `asset_kind`。
- [x] 新增 Profile Asset Tree内嵌契约、Token preimage/Token parity Schema。
- [x] 新增固定 Token parity fixture，填入真实 canonical bytes/SHA 和稳定负例。
- [x] 新增 Profile asset 与三类摘要设计入口。
- [x] 同步 Manifest builder/verifier、E2E Runner、Artifact verifier 实现规格/checklist。
- [x] 冻结 `DIRECT_PACKAGE_ROOT`唯一入口、五文件exact set、禁止checkout/classpath fallback及复用`ProfilePackageAssembler`边界。
- [x] 冻结Materializer必填`--input`、Manifest case raw ref自校验、失败码和零SQLite边界。
- [x] 冻结当前进程CodeSource唯一为`jar:nested:<attempt-local raw outer path>/!BOOT-INF/classes/!/`，完整匹配后才单次解码并同时闭合outer lexical/real path；测试classpath禁止成功artifact。
- [x] 冻结`source_sha256=SHA-256(exact Runtime JAR raw bytes)`，并要求其必须等于`runtime_jar_ref.sha256`；禁止`.class`/source-set/Manifest值fallback。
- [x] 冻结`source_date_epoch=parseUtcWholeSecond(manifest.generated_at)`；Runner不新增时间参数，`.000Z`等非canonical表示在SQLite前拒绝且零artifact。
- [x] 同步测试策略、冻结基线、开发执行包和 `docs/README.md` 指针。

## Verify

- [x] 所有新增 Schema 可由 Draft 2020-12 Ajv 编译，新增/既有 Visual/E2E 定向契约测试 `19/19` 通过。
- [x] Manifest/Attempt Artifact `0.2` Schema 正反例覆盖缺失、五类重复/泛化、Index缺项和版本互用；symlink、raw SHA、tree SHA、binding drift 属后继 builder/verifier semantic 实现验收，当前未伪造通过。
- [x] Token 3 正向量和4负向量的preimage/canonical bytes/SHA/error/pointer输入已冻结；后继Node/Java writer实现状态与运行证据只以Runner implementation checklist为准，不由本设计任务重复判定。
- [x] OPL/Trace 摘要唯一复用 `OplGoldenArtifactCanonicalWriter` 既有 bytes，不创建第二公式；本轮不重跑未实现的 E2E producer。
- [x] `jq empty`、Schema identity/version 检查和限定文件 `git diff --check` 通过。
- [x] direct-root、`--input`、JAR code source的命令、首错、错误码和正反例已同步至Runner implementation spec/checklist；本轮只做文档一致性验证，不伪造实现通过。
- [x] `source_sha256` producer单次raw观测、verifier独立复算、`E2E_INPUT_INVALID/2`与`E2E_ENVIRONMENT_MISMATCH/3`边界已同步；现有Schema字段足够，无需升级`0.2`。
- [x] canonical UTC整秒正例以及`.000Z`、非零小数、offset、空白、非法和归一化反例已冻结；`source_date_epoch`仅为内存seed输入，无需升级活动Schema。
- [x] JDK 21 + `PropertiesLauncher` forked-JAR正例和`file:`、`jar:file:`、其他entry/链、非canonical URI、classpath/其他JAR反例已冻结；本轮未执行或宣称该成功集成测试通过。
- [x] 未执行 CLI 成功路径、Materializer、Runner、Report、194/388 和 production 验证。

## Release Boundary

- [x] 新 `0.2` 设计输入闭合后，才允许创建后继 CLI/Materializer/Artifact verifier 实现任务。
- [x] 现有 `0.1` 实现和 release root 保持只读，不宣称兼容新 `0.2`。
- [x] 不生成 Candidate/Activation，不启用 Capability，不声明 ISO 符合性。

## Rollback

- [x] 只回退本修正新增的 `0.2` Schema、Token Schema/vector、设计、规格、checklist 和状态指针。
- [x] 不删除、覆盖或重写历史 `0.1` Schema、Manifest、Attempt Artifact、Handoff、Intake、fixture 或 release root。
