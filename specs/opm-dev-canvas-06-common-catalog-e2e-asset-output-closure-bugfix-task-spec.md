# Spec: DEV-CANVAS-06 Common Catalog E2E Asset 输出闭包修正

文档状态：`FROZEN`

更新时间：`2026-08-07`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

### 1.1 问题

活动 Common Fixture Catalog `0.2.0` 仍按 Schema 强制携带 `8` 个 `visual_subjects` 和 `16` 个 `e2e_cases`，但 Visual Common Materialization `v1.3` 与 02B 实现规格冻结的成功输出根只有：

```text
1 Catalog + 8 Visual fixture + 2 source mirror
```

Catalog 中 `e2e_cases[].base_fixture_ref/input_ref` 指向 `e2e/**`，`factory_source_ref`也必须指向可信 factory bytes；上述文件不在活动输出树内。Verifier又被要求只信输出根、不读取外部 checkout，因此活动 Catalog 存在无法解析的机器 ref。

### 1.2 Root Cause

上一轮只关闭了 Visual fixture、index、UI step 和 source mirror，没有把“Catalog 字段仍包含 E2E 条目”纳入最终树闭包检查；Schema验证只证明 `e2e_cases[16]` 的字段形状，不证明这些 raw ref 在 02B 输出根内可解析。

### 1.3 为什么此前未发现

当前仓库只有历史 Catalog `0.1.0` 与源目录下的 32 个 E2E 文件；活动 Catalog `0.2.0`、02B Builder/Verifier 和其 fresh output root 尚未实现，因此此前测试没有执行“活动 Catalog全部fileRef -> 同一输出根普通文件”的全树验证。

## 2. Fix Strategy

在三个候选方案中唯一选择“E2E assets 纳入活动输出布局”：

1. 活动 Catalog `0.2.0`继续携带 `8 Visual + 16 E2E`，Catalog Schema `0.1`字段和数量不变；
2. 02B Builder使用同一静态导入 factory 的 `e2eCases/e2eFixture`确定性生成32个E2E base/input文件，不从外部目录复制；
3. 32个E2E文件与8个Visual文件、Catalog、generator/factory source mirror在同一staging事务内发布；
4. Catalog全部Visual/E2E/source ref只能指向该输出根内文件，Verifier只读验证完整43文件树；
5. E2E Manifest Builder只接受已通过02B verifier的活动 Catalog `0.2.0`根，并把完整43文件树逐byte复制到final root的`inputs/common/`；不再直接消费可变checkout中的历史Catalog/factory/E2E目录；
6. 历史 Catalog `0.1.0`及既有E2E Manifest输出保持不可变，只允许历史reader/历史证据解释，活动builder必须拒绝。

不选择外部只读 E2E root，因为现有Catalog没有外部root identity，增加该方案会重新开放CLI、root owner和raw-ref信任语义。不选择移除E2E条目，因为会拆断现有E2E Manifest `194=178+16`的唯一输入目录并要求Catalog Schema/消费者分叉。

## 3. 修改边界

允许修改：

- 本规格及对应 Spec Mapping checklist；
- `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md`；
- 02B实现规格/checklist；
- E2E Manifest `0.1` Builder实现规格/checklist；
- 测试策略、开发执行包、DEV-CANVAS-06工具链 checklist；
- Golden Authoring当前入口、README、冻结基线和仅用于当前版本指针同步的历史规格/checklist。

禁止修改：

- `docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json`字段、数量与版本枚举；
- `scripts/**`、`tests/**`、factory、Builder、Verifier、Runtime、Web和E2E实现；
- 既有Catalog、Visual/E2E fixture、Manifest、Report、Handoff、Plan、approved或release bytes；
- SQLite DDL、Revision Schema、公共 API、Profile/Rule/Grammar/Symbol；
- Candidate、Activation、Capability、production gate和ISO状态。

## 4. 活动 Catalog 0.2 唯一输出树

活动02B成功根必须恰有以下 `43` 个普通非链接文件：

```text
<fixture-root>/
  dev-canvas-06-common-fixture-catalog.json
  visual/<8个subject-id>.json
  e2e/<16个case-id>.base.json
  e2e/<16个case-id>.input.json
  sources/scripts/build-canvas06-common-visual-fixtures.mjs
  sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs
```

计数公式固定为：

```text
43 = 1 Catalog + 8 Visual + 32 E2E + 2 source mirror
```

不允许根级`factories/`、外部路径占位、symlink/hardlink、Git metadata、临时文件或其他文件。

## 5. E2E 资产生成与 ref

1. case顺序固定为静态factory导出的 `e2eCases[16]`，且必须逐项等于Catalog Schema的16个 `prefixItems.case_id`；
2. 每个case调用同一实际静态factory的 `e2eFixture(caseId)`恰一次，禁止从源目录读取既有base/input bytes；
3. base唯一值为 `{...e2eFixture(caseId),fixture_kind:"BASE"}`，input唯一值为 `{...e2eFixture(caseId),fixture_kind:"INPUT"}`；
4. JSON编码固定UTF-8、LF、2空格、末尾单LF；相同binding、epoch和实际generator/factory bytes必须byte-identical；
5. `base_fixture_ref.path="e2e/<case-id>.base.json"`，`input_ref.path="e2e/<case-id>.input.json"`；
6. 16项 `factory_source_ref`必须与8项Visual `factory_source_ref`逐字段相同，全部指向唯一factory mirror；
7. `summary.visual_subject_count=8`、`summary.e2e_case_count=16`保持不变；
8. Catalog Schema只验证字段形状和顺序；factory输出、ref路径、43文件inventory与跨项相等性由活动semantic verifier唯一承接。

## 6. Builder、Verifier与事务

02B Builder固定在同一fresh staging内按以下顺序执行：

```text
CLI/source owner
-> 生成8 Visual
-> 生成32 E2E
-> 镜像2份source
-> 生成Catalog 0.2.0
-> Schema与全量semantic verify
-> 复算43文件tree digest
-> fsync
-> atomic rename
```

任一步失败删除本次staging且最终根零文件。Verifier必须：

- 拒绝 Catalog `0.1.0`、非 `8/16` summary和非43文件inventory；
- 从Catalog所在root解析所有Visual/E2E/source ref，执行containment、ordinary non-symlink、single-link、raw length/SHA；
- 重算8个Visual fixture、32个E2E fixture、两个source allowlist和跨项factory ref相等性；
- 验证前后tree digest相等，不读取checkout、Git、环境变量source root或其他外部路径。

活动root缺任一E2E文件、含额外文件、E2E内容/factory/ref漂移统一映射 `GOLDEN_COMMON_FIXTURE_REF_MISMATCH/2`；factory输出或case集合不合法映射 `GOLDEN_COMMON_INPUT_INVALID/2`。

## 7. E2E Manifest 消费边界

E2E Manifest Builder的 `--common-fixture-root`必须指向已通过02B verifier的活动43文件根，`--common-fixture-catalog`必须是该根内安全相对路径并满足：

```text
schema_id=OPM-DEV-CANVAS-06-COMMON-FIXTURE-CATALOG-001
schema_version=0.1
catalog_version=0.2.0
summary=8/16
```

Builder先只读验证源根，再把完整43文件树逐byte复制到：

```text
<e2e-final-root>/inputs/common/
```

复制后Catalog相对结构保持不变；`common_fixture_catalog_ref`指向final root内Catalog，16个case的Manifest `fixture_ref/input_ref`指向final root内`inputs/common/e2e/**`。Builder和Verifier必须验证`inputs/common/`恰为43文件、源/目标tree digest相等、全部Catalog ref在目标root内闭合。

历史Catalog `0.1.0`、仅含Catalog/factory/32 E2E文件的旧source布局或缺8个Visual/source mirror的root，活动Builder统一以 `E2E_MANIFEST_COMMON_FIXTURE_INVALID/2`在写final root前拒绝。

## 8. 兼容与状态

1. Catalog Schema `0.1`不变，历史`0.1.0`bytes不变，活动`0.2.0`仍为兼容字段升级；
2. E2E Manifest Schema/Manifest版本保持`0.1/0.1.0`，只收紧Common输入semantic preflight和final布局；
3. 既有E2E Manifest Builder `22/22`是旧Common source布局的历史实现快照；完成本规格对应实现和重验前，其当前符合性状态为`CONTRACT_UPDATE_REQUIRED`；
4. 本修正不改变`194/388`、driver、transaction、Report或Gate算法。

## 9. 验收与验证

1. 主设计、02B规格、E2E规格对43文件布局、16 case顺序、生成算法、ref路径和失败码一致；
2. Catalog Schema继续接受历史`0.1.0`与活动`0.2.0`的`8/16`形状，未知版本拒绝；
3. 文档明确不存在外部E2E asset root、`--source-root`或未解析E2E ref；
4. E2E Manifest checklist明确旧`22/22`与新契约实现状态分离；
5. JSON、Markdown链接/表格/围栏、版本/计数/状态和`git diff --check`通过。

本轮为设计任务，不运行或修改02B/E2E Builder，不生成43文件根、E2E Manifest、Report或release evidence。

## 10. 回滚

删除本规格/checklist并恢复Visual Common、02B/E2E规格及全局入口的本包增量。不得删除历史Catalog/fixture/Manifest、实现代码、release root或用户资产。

## 11. 事实与假设

### 11.1 事实

1. Catalog Schema当前强制`e2e_cases[16]`和`e2e_case_count=16`；
2. 当前factory导出固定`e2eCases[16]`和确定性`e2eFixture(caseId)`；
3. 当前02B设计输出布局未包含`e2e/**`，活动Catalog E2E refs因此无法在该root闭合；
4. 当前E2E Manifest builder从checkout Common source目录复制Catalog/factory/E2E文件，尚未消费活动02B 43文件根。

### 11.2 假设/解释

无。任何未来拆分Visual/E2E Catalog的决定必须发布新Schema/版本和独立迁移规格，不得重解释`0.2.0`。
