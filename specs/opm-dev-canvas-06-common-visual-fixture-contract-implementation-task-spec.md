# Spec: GOLDEN-AUTHORING-02B Common Visual Fixture Contract/Planner 实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`NOT_STARTED`

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 `GOLDEN-AUTHORING-02B`：发布 Common Visual Fixture `0.1/0.1.0` Schema，按冻结的 8 个 subject 构造完整Visual fixture，并由同一静态factory确定性生成16组32个E2E asset、Common Setup Plan和新 Common Fixture Catalog，以只读 semantic verifier 复算44文件树、Schema、raw ref、payload、binding、Revision/index/setup/Projection闭包，并修正 Capture Planner 的 Common Projection 与 Color Profile semantic join。

本包完成后只表示新 Common fixture/Catalog/Plan 输入可被确定性构造和验证；Common Driver后续改变E2E factory语义时，活动Catalog/32个BASE/INPUT/raw ref必须由独立Common E2E输入重建规格重新闭合，不能沿用本包旧执行结果。不创建 SQLite、Runtime、PNG、candidate、approved version 或 release Report。

## 2. 设计输入

唯一设计事实源为：

- `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md` `v1.4`；
- `docs/design/opm-dev-canvas-06-golden-authoring-design.md` `v1.4`；
- Common Fixture Catalog Schema `0.1`，历史`catalog_version=0.1.0`只读、活动`catalog_version=0.2.0`；
- Capture Plan `0.1/0.1.0` Schema；
- `MS-REV-001/0.2` Revision Schema、SQLite V1 contract 和 active binding；
- DEV-CANVAS-06 READY Intake/Handoff 及 exact Runtime JAR identity。

实现不得重新决定 fixture 字段、8 个 subject 的语义/布局/index/setup/Projection、16个E2E case、base/input生成算法、ID、排序、JCS/SHA、颜色别名、Plan 版本、44文件输出布局、错误码或回滚边界。

## 3. 前置条件

1. 全局设计基线为 `READY_FOR_DEVELOPMENT`；
2. 当前 READY Handoff/Intake 能提供 exact 五角色 active binding；
3. Common Catalog机器Schema保持`0.1`字段形状并只接受历史`catalog_version=0.1.0`与活动`0.2.0`；Capture Plan Schema保持`0.1`；
4. 旧 8 个元数据 fixture、旧 Catalog 及 `GOLDEN-CANVAS06-20260803-001` 只作为历史反例，不得覆盖或原地升级；
5. 02B必须先新增`./scripts/canvas06-rfc8785.mjs`并从当前Planner提取等价语义；Builder、Verifier、Planner共同导入，禁止保留第二个02B局部实现；Java parity由03C承接。

## 4. 修改边界

允许修改：

- 只读消费已冻结的 `docs/contracts/schemas/opm-dev-canvas-06-common-visual-fixture.schema.json`，新增其正反contract test；实现发现Schema缺口必须回到设计bugfix，不得在本包静默放宽；
- `tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs` 中 Visual factory 的版本化完整实现及定向测试；
- 新增 `scripts/build-canvas06-common-visual-fixtures.mjs`、`scripts/verify-canvas06-common-visual-fixtures.mjs`、`scripts/canvas06-rfc8785.mjs` 及定向测试；
- 新增Node/Java共用只读向量`tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json`；
- `scripts/release-canvas06-golden-plan.mjs` 的 Common fixture semantic join、Projection digest、Color Profile canonicalization 及定向测试；
- `package.json` 中仅新增 02B build/verify/test 命令，不新增依赖；
- 本规格、对应 checklist 和必要的实现状态入口。

禁止修改：

- Common Fixture Catalog字段形状、Capture Plan、Golden Environment既有Schema；Catalog版本枚举已由设计包冻结，实施不得再扩展；
- 旧 Common fixture/Catalog/Plan bytes 和任何 approved/release bytes；
- Java、SQLite DDL/migration、公共 API、Vue、Profile/Rule/Grammar/Symbol；
- 03C Materializer、03B Candidate Author、Approval/Publisher、Visual Manifest/Runner；
- production gate、Candidate、Activation、Capability 和 ISO 状态。

## 5. 固定输出与 CLI

Builder CLI 固定为：

```text
npm run release:canvas06:common-visual:build -- \
  --handoff <ready-handoff> \
  --fixture-root <new-output-root> \
  --source-date-epoch <integer>
```

输出根必须不存在，成功后的唯一布局为：

```text
<fixture-root>/
  dev-canvas-06-common-fixture-catalog.json
  visual/
    STATE_ROLES.json
    LONG_LABELS.json
    FUNDAMENTAL_FAN.json
    CANDIDATE_LAYER.json
    INSPECTOR.json
    TOOLCHAIN_CATALOG.json
    FINDING_FOCUS.json
    BLOCKED_FEEDBACK.json
  e2e/
    <16个case-id>.base.json
    <16个case-id>.input.json
  sources/scripts/build-canvas06-common-visual-fixtures.mjs
  sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs
```

成功root必须恰有`44=1 Catalog+8 Visual+32 E2E+2 source mirror+1 Common Setup Plan`个普通非链接文件；不允许外部E2E root、历史fixture目录副本或其他文件。

Verifier CLI 固定为：

```text
npm run release:canvas06:common-visual:verify -- \
  --handoff <ready-handoff> \
  --fixture-root <readonly-root> \
  --catalog dev-canvas-06-common-fixture-catalog.json
```

Builder和Verifier均禁止`--source-root`、`--e2e-root`及任何source path/env override。Builder只在同一父目录创建fresh staging sibling，全部8个Visual fixture、32个E2E asset、两份source mirror、Catalog和verifier通过后才原子rename；任一失败必须删除本次staging并保持最终输出零文件。已有输出、symlink/hardlink、绝对路径、`..`、额外文件、Git metadata或未知参数一律拒绝，不覆盖、不合并、不修复。

## 6. 实现责任

### 6.1 Schema 与 Factory

1. 以只读冻结Schema实现`OPM-DEV-CANVAS-06-COMMON-VISUAL-FIXTURE-001/0.1/0.1.0`validator和正反contract test，不修改Schema；
2. Factory按主设计第4、5、7、8章生成`generated_at`、Project/Model/Revision、五类封闭index seed、8类UI step shape及每subject exact steps、完整expected Projection；
3. 8 个 fixture 按主设计 subject 顺序生成，JSON 固定 UTF-8、LF、2 空格、末尾一个 LF；
4. `fixture_payload_sha256` 排除自身后按 RFC 8785 JCS 计算，Catalog `fixture_ref.sha256` 按文件 raw bytes 计算；
5. 相同Handoff、实际generator/factory source bytes和epoch必须byte-identical。
6. 每个Revision必须包含主设计第4.2.1节唯一空`text_artifact`与`text_traces=[]`；Builder使用共享JCS owner计算`OPM-DEV-CANVAS-06-EMPTY-TEXT-ARTIFACT-PREIMAGE-001/0.1`摘要，禁止省略字段、使用占位摘要或调用真实OPL generator补造Sentence。

### 6.2 Catalog 与只读 Verifier

1. Catalog identity的`schema_version`保持`0.1`，活动`catalog_version`固定为`0.2.0`；Visual 8项引用新完整fixture，E2E 16项及其Schema固定顺序不变；历史`0.1.0`只作为必须拒绝的不可变输入；
2. generator必须用`import.meta.url`绑定实际执行的`build-canvas06-common-visual-fixtures.mjs`，factory必须绑定其静态import实际模块；两者按主设计第11.1节逐byte镜像到固定`sources/**`路径；
3. factory导出的`e2eCases[16]`必须逐项等于Catalog Schema的16个`prefixItems.case_id`；每个case调用`e2eFixture(caseId)`恰一次，base写为`{...fixture,fixture_kind:"BASE"}`，input写为`{...fixture,fixture_kind:"INPUT"}`，JSON固定UTF-8/LF/2空格/末尾单LF；禁止读取或复制历史`fixtures/e2e/**`；
4. Catalog `generator_ref`只指generator mirror；8项Visual和16项E2E共24项`factory_source_ref`逐字段相同且只指factory mirror；16项`base_fixture_ref/input_ref`固定指向活动root内32个E2E文件；禁止指外部checkout、历史author、cwd/env或动态import来源；
5. verifier固定按CLI/path/source owner -> Schema/source mirror/raw ref -> 44文件inventory/Common Setup Plan -> E2E case/factory输出 -> payload SHA -> Handoff/binding -> subject identity -> Revision/index -> setup -> Projection的顺序返回首错；
6. 验证8项Visual的唯一性、顺序、闭包字段、固定ID/名称/布局、五类index逐字段/排序/计数/时间/null、空Text Artifact preimage/digest、显式空Trace、8类step shape与各subject exact steps、focus、rendered cell数和subject差量；同时重算16组E2E base/input、32条raw ref和24项factory ref相等性；
7. verifier只读且不读取外部checkout；root必须恰为43个普通非链接单链接文件，验证前后fixture root tree digest必须相等。

### 6.3 Planner Semantic Join

1. Planner 必须在生成任何 Plan bytes 前调用同一 Common verifier；
2. 每个 subject 的 9 个 Common capture 从 fixture `expected_projection` 计算同一个 `expected_projection_sha256`；
3. `expected_cells=committed_cells.length+transient_cells.length`，revision/focus/anchor/critical regions 与 fixture 深度相等；
4. 旧 `sha256(JCS({subject_id,focus_target_id}))` 固定为 `HISTORICAL_PLACEHOLDER`，即使旧 Plan Schema-valid 也必须被新 author semantic preflight 拒绝；
5. 02B 只修正 planner 实现，不覆盖旧 Plan；真实后续输入必须使用新 change ID 和 fresh output path。

### 6.4 Color Profile

唯一纯函数实现：

```text
canonicalize("srgb", [exact launch args containing one --force-color-profile=srgb])
  -> "sRGB IEC61966-2.1"
```

只接受 Plan raw `srgb`、恰一个 `--force-color-profile=srgb` 且不存在其他同前缀参数。禁止 trim、大小写折叠、Unicode normalization、ICC path、系统默认 profile 或其他 alias。Planner 保持 raw 值；03B/Golden Environment semantic join 复用同一导出纯函数，不得复制规则。

### 6.5 JCS Owner与Parity Vector

`scripts/canvas06-rfc8785.mjs`只导出`canonicalizeJcs(value)`和`sha256Jcs(value)`，值域、排序、escaping和拒绝边界严格采用Visual Common设计`v1.4`第8.3节。空Text Artifact、Planner、Builder和Verifier必须共同导入该owner；Planner必须删除局部`jcs()`，不得复制实现或从其他历史script导入私有函数。

共用向量固定为`tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json`，字段、顺序、10项exact input/canonical/SHA和`U+1F600/U+E000`排序辨识样例不允许实现时替换或扩展optional字段。02B Node test负责生成/校验向量raw bytes及逐项canonical/SHA；03C Java test只读消费同一文件并复算，不由Java重写向量。

## 7. 错误、事务与退出码

| Code | Exit | 适用边界 |
| --- | --- | --- |
| `GOLDEN_COMMON_INPUT_INVALID` | `2` | CLI、路径、实际source owner/type、E2E case集合/factory输出、Schema engine输入或禁止参数 |
| `GOLDEN_COMMON_FIXTURE_SCHEMA_INVALID` | `2` | fixture 结构/版本/封闭字段无效 |
| `GOLDEN_COMMON_FIXTURE_REF_MISMATCH` | `2` | source mirror/raw ref、E2E内容、Common Setup Plan、44文件inventory、payload SHA、Catalog/subject/Projection join不闭合 |
| `GOLDEN_COMMON_BINDING_MISMATCH` | `3` | fixture/Catalog/Handoff active binding 不同 |
| `GOLDEN_COLOR_PROFILE_MISMATCH` | `3` | raw alias、launch arg 或 canonical mapping 不精确 |
| `GOLDEN_COMMON_INTERNAL_ERROR` | `4` | 未分类 I/O、serializer、digest 或 atomic writer 失败 |

同一输入必须返回同一 top code/exit。输入或 semantic 失败不得产生最终 root、Plan、Environment 或 Report；writer/internal failure 只允许清理本次 staging，不得删除已有资产。

## 8. 测试与性能

至少覆盖：

1. Schema正例8项及缺字段、额外字段、版本、SHA、null/空形状反例；
2. 8个subject的元素/State/Fact、layout、五类index entry逐字段/顺序/固定ID时间状态、8类step shape/exact对象、focus、cell数和Projection golden；
3. binding、source mirror/raw ref、payload SHA、Catalog顺序/重复/缺失/额外、Revision/index/setup/Projection单变量篡改；
4. 16个E2E case顺序、32个base/input固定路径和factory重算结果、24项factory ref相等、Common Setup Plan和exact 44文件inventory全部闭合；缺失/额外/E2E/setup plan tamper和历史bytes复制拒绝；
5. generator/factory实际source到mirror逐byte相等，Catalog path/kind/length/SHA闭合；source override、E2E root override、历史author、动态import、缺失/额外source、symlink/hardlink/escape/Git metadata全部拒绝；
6. 两次build byte-identical，失败/root已存在/rename fault最终零输出；
7. planner `72=8*3*3`、每subject 9项、projection digest深度复算、旧占位digest拒绝和新change ID；
8. Color Profile唯一正例及trim/case/alias/缺失/重复/冲突launch arg反例；
9. verifier前后tree digest不变；
10. 共享Node模块被Builder/Verifier/Planner共同导入，Planner无局部`jcs()`；10项parity vector的canonical JSON text/SHA全部匹配，safe integer、UTF-16 key排序、lone surrogate及其他Node非法值反例全部拒绝；
11. 固定参考环境中44文件build加完整verify wall time`<=5 s`、peak RSS`<=256 MiB`。该阈值是release tooling约束，不是ISO要求。

## 9. 验证命令

实现后至少执行：

```text
npm run release:canvas06:common-visual:test
npm run release:canvas06:common-visual:build -- <受控参数>
npm run release:canvas06:common-visual:verify -- <受控参数>
npm run release:canvas06:golden:plan:test
npm run release:canvas06:golden-authoring-schema:test
npm run contract:validate
git diff --check
```

## 10. 完成定义

冻结Schema的validator/contract test、Factory、8个Visual fixture、32个E2E asset、两份source mirror、Common Setup Plan、44文件Catalog builder、只读verifier、共享Node JCS/parity vector、Planner semantic join、Color Profile pure function、正反例、确定性和性能全部通过，implementation checklist记录exact命令与计数。完成后状态仅可提升为`IMPLEMENTED/NOT_RELEASE_VALIDATED`；E2E Manifest新消费契约、03C、03B、真实新Plan、SQLite/PNG/candidate/approved evidence、Gate、Capability与ISO状态不得联动提升。

## 11. 回滚

回滚删除本包新增 Schema、builder/verifier/helper/test/命令，并恢复 planner/Factory 的本包增量。不得删除或改写旧 fixture/Catalog/Plan、Handoff、candidate、approved 或用户数据；任何已生成但未发布的新 output root 只能按其 change 记录单独清理。

## 12. 事实与假设

事实：当前8个Visual fixture只有历史元数据；源目录中的32个历史E2E文件不在活动02B输出根；Common Visual Fixture机器Schema已冻结，但validator/contract test、8个完整Visual fixture、32个活动E2E asset、source mirror、43文件producer/verifier尚未实现；当前production Plan使用历史占位Projection digest。假设：无；未来生成物的raw SHA、wall time和RSS必须由实际执行记录。
