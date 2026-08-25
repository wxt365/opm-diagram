# Spec: DEV-CANVAS-06 Common E2E 输入重建实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`READY_FOR_BUILD/NOT_STARTED`

生产重建状态：`BLOCKED_BY_EXACT_CLEAN_FACTORY`

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

实现并执行一个独立的 Common E2E 输入重建事务：只读消费 Common Driver 包形成的 exact clean `common-fixture-factory.mjs`，生成活动 Common Fixture Catalog `0.2.0`、16 个 case 对应的 32 个 `BASE/INPUT` 文件，并按新生成的原始 bytes 重新计算 Catalog 内全部 raw ref。

本包关闭“factory 已按 `7 PASS + 9 BLOCKED` 新语义更新，但活动 Catalog/BASE/INPUT 仍引用旧 bytes”的发布输入缺口。完成后只形成 E2E Manifest v02 可消费的已验证 Common 43 文件输入根，不生成 Manifest、Attempt、Report、Gate、Candidate、Activation、Capability 或 ISO 证据。

## 2. 问题与唯一修正

### 2.1 已确认问题

1. Common Driver 实现规格拥有 factory 的 16 case、错误码和事务语义，但明确不拥有 32 个生成资产与 Catalog raw ref 重建；
2. 当前 Builder 在写 BASE/INPUT 后再次调用 factory 构造 Catalog action，不能证明同一轮重建只消费一次 factory 结果；
3. 当前 Verifier 用本地硬编码规则拼装预期 E2E fixture，没有调用 exact factory，已与 `STALE_TOKEN -> REVISION_CONFLICT`、`REVISION_CONFLICT -> REVISION_CONFLICT` 和无错误码的 Ambiguous case 等活动语义发生漂移；
4. 修改 Runner 测试、放宽 Schema/Verifier、复用旧 SHA 或从 observed 结果回填 Catalog 都会伪造发布输入证据。

### 2.2 唯一修正

Builder 和 Verifier 必须静态绑定同一逻辑 factory owner，分别按固定 16 case 顺序各调用 `e2eFixture(caseId)` 恰一次并缓存结果。Builder 由缓存写出 32 个文件和 16 项 Catalog action；Verifier 由自己的缓存独立重算 32 个文件与 Catalog join。禁止维护第二份 case/error/transaction 规则。

## 3. 权威输入与前置门

唯一输入为：

1. `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md` `v1.4`；
2. `docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md` `v1.2`；
3. `OPM-DEV-CANVAS-06-COMMON-FIXTURE-CATALOG-001/0.1` Schema，活动 `catalog_version=0.2.0`；
4. `GOLDEN-AUTHORING-02B` Builder/Verifier 与 43 文件布局；
5. READY Handoff 的 exact `active_binding`；
6. Common Driver checklist 已确认的 16 case、`7 PASS + 9 BLOCKED`、八个 exact HTTP 错误码及 Ambiguous 无错误码口径。

进入生产重建前必须同时满足：

1. factory 位于 exact clean source commit 的固定路径，工作树无该文件未提交差异；
2. 执行记录冻结 `source_commit`、factory raw `byte_length/sha256`、Handoff raw SHA、`active_binding.binding_digest`、`SOURCE_DATE_EPOCH` 和目标 fresh root；
3. factory 定向测试已证明 16 case 顺序、7/9、错误码、事务和 unknown case 拒绝；
4. 目标 root 及其 staging sibling 不存在；
5. 历史 `0.1.0` Catalog、BASE/INPUT 和既有 release root 保持只读。

任一前置不满足时只能继续实现/测试工具，生产重建保持 `BLOCKED_BY_EXACT_CLEAN_FACTORY`，不得使用脏工作树 SHA 代替 clean identity。

## 4. 精确修改边界

### 4.1 非文档 allowlist：3 个路径

1. `scripts/build-canvas06-common-visual-fixtures.mjs`
2. `scripts/verify-canvas06-common-visual-fixtures.mjs`
3. `scripts/common-visual-fixtures.test.mjs`

允许同步本规格、对应 checklist、README、冻结基线、测试策略、开发执行包、02B/Manifest v02/Toolchain 状态入口。生成的 43 文件 fresh root 是受控输出，不计入 source delta。

### 4.2 明确禁止

本包禁止修改：

1. `tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs` 及其测试；它们唯一归 Common Driver 包所有；
2. `scripts/author-canvas06-common-fixtures.mjs`、其测试及仓库内历史 `0.1.0` Catalog/BASE/INPUT；
3. E2E Runner、Runner 测试、Manifest/Report 聚合、Schema 和 verifier 约束；
4. OpenAPI、SQLite DDL/migration、Java、Vue、公共 HTTP wire、生产配置；
5. 已安装 clean source、既有 immutable release root、Handoff、Intake、Evidence Bundle 和 approved 资产；
6. fallback、忽略 ref、跳过 semantic verify、从路径/observed 结果反推或手工编辑生成 JSON。

不新增依赖，不增加新的 Builder/Verifier CLI 参数，不改变既有稳定错误码。

## 5. CLI 与固定输出

继续使用 02B 已冻结 CLI：

```text
npm run release:canvas06:common-visual:build -- \
  --handoff <ready-handoff> \
  --fixture-root <fresh-output-root> \
  --source-date-epoch <non-negative-integer>

npm run release:canvas06:common-visual:verify -- \
  --handoff <ready-handoff> \
  --fixture-root <readonly-root> \
  --catalog dev-canvas-06-common-fixture-catalog.json
```

成功 root 恰为 43 个普通、非链接、单链接文件：

```text
1  dev-canvas-06-common-fixture-catalog.json
8  visual/<subject-id>.json
32 e2e/<case-id>.base.json | <case-id>.input.json
1  sources/scripts/build-canvas06-common-visual-fixtures.mjs
1  sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs
```

Catalog 固定 `schema_version=0.1`、`catalog_version=0.2.0`、8 个 Visual、16 个 E2E 和 `summary=8/16`。Schema 不升级，不增加字段。

## 6. 生成算法

### 6.1 Exact factory identity

1. Builder 和 Verifier 都只能通过固定静态 import 读取 `e2eCases/e2eFixture`；禁止动态路径、env、cwd 搜索、`--source-root`、历史 asset 或第二 factory；
2. 实际 import owner 必须是固定路径的普通、非链接、单链接文件；
3. Builder 将该 owner 原始 bytes 逐 byte 镜像到输出根固定 source path；Catalog 的 24 个 `factory_source_ref` 必须全部逐字段等于该 mirror 的 ref；
4. Verifier 必须证明实际 import owner、mirror bytes 和 24 个 Catalog ref 三方相等后，才允许调用 factory 重算；
5. clean source commit 与 factory SHA 由执行 checklist 记录，不写入 Catalog 新字段。

### 6.2 32 个 BASE/INPUT

按 Catalog Schema 的 16 个 `prefixItems.case_id` 固定顺序执行：

```text
factoryResult[caseId] = e2eFixture(caseId) // 每个进程、每个case恰一次
BASE  = { ...factoryResult[caseId], fixture_kind: "BASE" }
INPUT = { ...factoryResult[caseId], fixture_kind: "INPUT" }
```

输出编码唯一为 UTF-8、LF、2 空格缩进、末尾一个 LF。不得复制、patch 或格式化历史 BASE/INPUT，不得分别再次调用 factory 生成 BASE、INPUT 或 Catalog action。

活动语义固定为：

```text
7  PASS_MATCHED    -> TX_COMMIT_1
9  BLOCKED_MATCHED -> TX_NO_COMMIT

AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED -> expected_error_code 字段省略
STALE_OPTION_BLOCKED                -> DOMAIN_REJECTED
STALE_TOKEN_BLOCKED                 -> REVISION_CONFLICT
MISMATCHED_TOKEN_BLOCKED            -> DOMAIN_REJECTED
ASSET_MISSING                       -> TEXT_GENERATION_BLOCKED
TEXT_BLOCKED                        -> DOMAIN_REJECTED
REVISION_CONFLICT                   -> REVISION_CONFLICT
PERSISTENCE_FAILED                  -> PERSISTENCE_FAILED
READONLY                            -> READ_ONLY_REVISION
```

### 6.3 Catalog raw refs

Catalog 必须在全部文件写完后，从 staging 内实际 raw bytes 重新计算：

1. `generator_ref` 的 `path/byte_length/sha256`；
2. 24 个 `factory_source_ref`，且逐字段相等；
3. 8 个 `visual_subjects[].fixture_ref`；
4. 16 个 `base_fixture_ref` 与 16 个 `input_ref`；
5. 每个 `e2e_cases[].actions` 必须直接取同一次缓存 factory result 的 `action`。

任何旧 SHA、外部路径、错误 kind、length/SHA 不一致、同一 source 不同 ref 或 Catalog action 与 factory result 不同均为拒绝。不得先写 Catalog 占位 ref 后局部替换。

## 7. Builder 原子顺序

唯一顺序：

```text
PARSE_AND_VALIDATE_CLI
-> VERIFY_READY_HANDOFF_AND_BINDING
-> VERIFY_GENERATOR_AND_FACTORY_SOURCE_OWNER
-> VERIFY_FINAL_AND_STAGING_ABSENT
-> CREATE_FRESH_STAGING
-> CALL_FACTORY_ONCE_PER_CASE_AND_CACHE
-> WRITE_8_VISUAL_AND_32_E2E
-> WRITE_2_SOURCE_MIRRORS
-> CALCULATE_ALL_RAW_REFS_FROM_STAGING
-> WRITE_CATALOG_0.2.0
-> FSYNC_FILES_AND_STAGING_DIRECTORIES
-> RUN_SCHEMA_AND_SEMANTIC_VERIFIER_ON_STAGING
-> ATOMIC_RENAME_STAGING_TO_FINAL
-> FSYNC_PARENT
```

rename 前任一失败必须删除本次 staging，final 零输出；final 已存在、staging residual、link/special file、缺失/额外文件一律拒绝，不覆盖、不合并。rename 后 parent fsync 失败不得声明成功，必须把 final 作为待隔离 residual 记录，禁止自动当作可信输入。

## 8. Verifier 责任与首错

Verifier 必须只读，验证前后 tree digest 相同，并按以下顺序返回首错：

```text
CLI/path
-> READY Handoff/binding shape
-> exact 43-file type/link/inventory
-> Catalog Schema/version/order/count
-> generator/factory mirror raw refs
-> actual factory owner/mirror/24 refs三方join
-> factory一次调用缓存
-> 32个BASE/INPUT raw bytes与refs
-> 16项action/7+9/error/transaction/reopen join
-> 8个Visual及既有02B semantic closure
-> tree digest unchanged
```

Verifier 不得使用 case 名称正则、硬编码 error map、历史 fixture 或 Catalog SHA 作为 factory 输出替代品。所有 32 个 JSON 必须先按唯一编码重新序列化为 expected raw bytes，再与磁盘 bytes 逐 byte 相等；只比较解析对象不充分。

稳定错误码/exit 沿用 02B：

| Code | Exit | 边界 |
| --- | --- | --- |
| `GOLDEN_COMMON_INPUT_INVALID` | `2` | CLI、路径、source owner、case 集合或 factory 调用无效 |
| `GOLDEN_COMMON_FIXTURE_SCHEMA_INVALID` | `2` | Catalog/fixture 机器形状无效 |
| `GOLDEN_COMMON_FIXTURE_REF_MISMATCH` | `2` | inventory、mirror、raw bytes/ref、factory/action/事务闭包不一致 |
| `GOLDEN_COMMON_BINDING_MISMATCH` | `3` | Catalog/fixture/Handoff binding 不同 |
| `GOLDEN_COMMON_INTERNAL_ERROR` | `4` | 未分类 I/O、digest、fsync、rename 或 verifier 进程失败 |

## 9. 测试与验收

### 9.1 正例

1. exact clean factory 生成 `43=1+8+32+2`；
2. 16 case 固定同序，32 路径唯一，JSON bytes 满足唯一编码；
3. 7 PASS/9 BLOCKED、八个 exact 错误码、Ambiguous 无错误码、事务与 REOPEN 全部等于 factory；
4. 24 个 factory ref 相等，全部 generator/Visual/E2E ref 的 path/length/SHA 从实际 staging bytes 复算；
5. 两次 fresh build byte-identical；只读 verifier 前后 tree digest 相同；
6. 完整 43 文件 root 可作为 Manifest v02 `--common-fixture-root` 输入，但不在本包生成 Manifest。

### 9.2 反例

必须覆盖旧 factory mirror、旧 Catalog/BASE/INPUT SHA、Ambiguous 伪造错误码、STALE_TOKEN/REVISION_CONFLICT 旧错误码、单个 raw byte/末尾 LF/缩进变化、Catalog action 回填、错误 kind/path/length/SHA、24 ref 任一不同、缺/额外/重复/reorder case、缺/额外文件、symlink/hardlink/special file、source mirror drift、unknown CLI、final/staging 已存在、verifier 写树和 rename/fsync failure。

还必须以定向测试证明 Verifier 不再含本地 `expectedE2e`、case 正则或 error map，factory 语义变化只能由 exact static owner 驱动。禁止通过修改 Runner 测试或放宽 Schema/Verifier 使反例通过。

### 9.3 必跑命令

```text
npm run release:canvas06:common-visual:test
npm run release:canvas06:common-visual:build -- <受控参数>
npm run release:canvas06:common-visual:verify -- <受控参数>
npm run release:canvas06:e2e:manifest:v02:test
npm run contract:validate
git diff --check
```

生产重建还要记录 exact 命令、Node 版本、source commit、factory/Handoff SHA、binding digest、epoch、final tree digest、Catalog SHA、43 文件计数和 verifier exit。单元/临时目录正例不能替代该记录。

## 10. 完成与状态边界

### 10.1 实现完成

3 路径 allowlist 内的 Builder/Verifier/测试全部通过，只表示 `IMPLEMENTED/REBUILD_NOT_RUN`。

### 10.2 重建完成

exact clean factory 输入门通过，fresh root 原子生成，正反例和完整 verifier 通过，执行 checklist 记录全部身份与摘要后，才可标记 `IMPLEMENTED/COMMON_INPUT_READY_FOR_MANIFEST_V02`。

该状态只解除 Manifest v02 的 Common input 前置，不等于 Manifest v02 producer/verifier完成，不等于 `194/388`、`137/57` Report、GATE-06-03、Candidate、Activation、Capability、production release 或 ISO 符合性。

## 11. 回滚

代码回滚只恢复 3 个 allowlist 路径。未安装的失败 staging 整体删除；rename 后未闭合的 residual 必须隔离并记录。已验证 final root 一旦被上游 Manifest raw ref 引用即视为不可变，不得覆盖或原地修复，只能生成新 root。历史 `0.1.0`、既有 release root 和用户数据不得删除。

## 12. 事实与假设

### 12.1 事实

1. Catalog Schema `0.1`已允许活动 `catalog_version=0.2.0`；
2. 活动成功布局已冻结为43文件；
3. Common Driver factory当前语义为7 PASS/9 BLOCKED；
4. 当前 Builder对每个case调用factory不止一次，当前 Verifier维护了独立硬编码E2E期望；
5. Common Driver规格明确把32个资产和Catalog ref重建交给后继任务。

### 12.2 假设/待执行输入

尚无可冻结的 clean factory source commit和raw SHA；它们必须由Common Driver实现完成后的clean source提供，并在本规格checklist执行阶段记录。不得从当前脏工作树推断。
