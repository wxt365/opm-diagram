# GOLDEN-AUTHORING-03B Candidate Author 输入闭包修正规格

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 问题

03B 的原 CLI 只接收 Plan、clean source、Runtime JAR、Family Materialization root、candidate root 和 epoch；但它必须调用的 03C Adapter Request `0.2` 还强制要求 Java 21 executable、五文件 Direct Profile Asset Staging Root、Common fixture root 和 fresh work root。Golden Environment `0.2` 还要求实际 Chromium executable 与三份字体的 exact raw identity。Capture Plan 不携带这些物理路径或 raw refs，且既有规则禁止从 checkout、环境变量、PATH 或目录扫描回退推导。

## 2. 唯一修正

03B Author CLI 在既有六个参数外，新增且只新增以下四个必填参数：

```text
--common-adapter-request <absolute-existing-json-file>
--browser-executable <absolute-existing-regular-file>
--font-manifest <absolute-existing-json-file>
--authoring-lineage <absolute-existing-json-file>
```

完整参数集合固定为：

```text
--plan --source-root --runtime-jar --materialization-root --candidate-root
--source-date-epoch --common-adapter-request --browser-executable --font-manifest
--authoring-lineage
```

禁止其它参数、重复参数、`--force`、`--overwrite`、`--update-snapshots`、`--accept-new-golden`、`--skip-missing`、`--ignore-environment` 和任意 fallback。

### 2.1 Adapter Request

`--common-adapter-request` 必须是活动 `OPM-DEV-CANVAS-06-COMMON-VISUAL-ADAPTER-REQUEST-001/0.2/0.2.0` 的 ordinary JSON file。03B 在创建 candidate 临时目录、启动 Browser 或调用 adapter 前必须验证：

1. Request raw bytes 可读，且通过既有 Adapter Request Schema；
2. `plan_path` 与 `--plan` realpath 相同，`plan_ref` 与 `--plan` raw bytes 相同；
3. `runtime_jar_path` 与 `--runtime-jar` realpath 相同，`runtime_jar_ref` 与 Plan `LOCAL_RUNTIME_JAR` ref逐字段相同；CLI physical JAR只按`byte_length/sha256`与该逻辑ref闭合；
4. `source_date_epoch` 与 `--source-date-epoch` 相同；
5. Request 的 Java/Profile/Common root/work root 仅由 Request 自身精确承载并由03C adapter复核；03B不得重写、补齐或从 source root 推导；
6. `work_root` 必须是 fresh absolute path，且不得位于 candidate root、source root或 materialization root 内。

03B 唯一静态 ESM import `runCommonVisualMaterialization(request, captureCallback)`；不得按路径动态加载 callback 或执行 Adapter CLI。

### 2.2 Browser 与字体输入

`--browser-executable` 必须是 ordinary regular file。03B 必须对其 realpath、byte length 和 SHA-256 进行观测；实际 launch 的 executable 必须与此 physical file 相同。实际 Playwright/Chromium 版本仍必须精确等于 Plan policy，不能通过传入文件名或 manifest 声称。

`--font-manifest` 的唯一 Schema 是新增 `OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-FONT-INPUT-001/0.1/0.1.0`。它恰含 `UI_SANS`、`CJK_FALLBACK`、`MONOSPACE` 三项，按该顺序列出：

```text
logical_role, postscript_name, font_version, source_path, source_ref
```

`source_path` 是绝对 ordinary regular-file path，`source_ref.kind=FONT_FILE` 且 `source_ref.path` 必须与 `source_path` 相同。03B 在写任一候选输出前复算每项 raw ref；随后只复制这三份 bytes 到 candidate 临时根的 `environment/fonts/<logical_role>/<postscript_name>.font`，并以该候选相对路径生成 Golden Environment `font_refs`。不得读取系统字体目录、`FONTCONFIG_PATH`、浏览器默认字体或任意未在 manifest 出现的字体。

### 2.3 报告与原子性

Adapter Request 和 Font Manifest 是一次 Author invocation 的受控输入，不修改现有 Authoring Report `0.2` 字段。其闭包体现在：Request 的 Plan/JAR/epoch exact join、Authoring Report 的 Environment fingerprint、Environment 的 Browser/Font raw refs，以及 candidate 输出内已复制的三份 font bytes。

所有上述 preflight 在创建 candidate 临时目录、Browser、Adapter Base/Clone 或 PNG 前执行。任一失败统一为 `GOLDEN_AUTHOR_INPUT_INVALID/2`，candidate root、Approval、approved root、Visual Manifest 和 Family Materialization 均为零写入。Browser/version/font/adapter join 失败属于 `GOLDEN_AUTHOR_ENVIRONMENT_MISMATCH/3`，同样不得写 READY 输出。

### 2.4 Release Lineage 输入

`--authoring-lineage` 的唯一 Schema 是新增 `OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-LINEAGE-INPUT-001/0.1/0.1.0`。它是 Author 写入 Report `golden_set_version`、`old_golden_set_version` 和 `old_golden_set_sha256` 的唯一输入：

1. `INITIAL` 只能为目标 `1.0.0`，两个 old 字段均为`null`；
2. `SUPERSEDE` 必须提供目标版本、old version 与 old SHA；版本递增和 predecessor Report/approved root 的真实性仍只由 Approval/Publisher 验证；
3. Author 禁止读取 approved root、扫描版本目录、读取 latest 指针或从 change ID 推导版本；
4. Lineage 输入与 Plan `change_id` 必须同一 `GOLDEN-CANVAS06-*`，否则在零输出阶段拒绝。

Lineage Input 不进入既有 Authoring Report `0.2` Schema；其可审计结果是候选 Report 内的版本及 old-set 字段。不得为此修改 `0.2` Schema或把 Lineage Input 当作 Approval Record。

## 3. 修改边界

允许新增 Font/Lineage Input Schema、03B runner/定向测试、03B spec/checklist及本修正规格/checklist。禁止修改 Capture Plan、Adapter Request、Authoring Report、Golden Environment、SQLite、公共 API、Profile、Approval/Publisher/Manifest 语义。

## 4. 验收

1. Plan 不含三组 physical input 时，03B 只接受显式输入，不读取 fallback；
2. Request 与 Plan/JAR/epoch 任一差异在零输出阶段拒绝；
3. Browser raw identity、实际版本及 Font Manifest 的角色/顺序/path/ref 任一差异稳定拒绝；
4. candidate Environment 的三份 font ref 都指向 candidate 内复制 bytes，并与 Font Manifest raw bytes相等；
5. 现有 0.1/0.2 Schema 和产品 API 保持 byte/行为不变；
6. Markdown 链接、Schema contract test、03B定向测试和 `git diff --check` 通过。

## 5. 回滚

回滚只删除新增 Font Input Schema、03B参数处理与定向测试，并恢复03B为输入未闭合状态。不得删除 candidate、materialization、approved 或用户数据。
