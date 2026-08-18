# Spec: DEV-CANVAS-06 Golden Environment 0.2 设计修正

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景与问题

Golden Authoring 第 6.2 节已冻结 `os_name`、`arch`、`browser_executable_sha256` 与 `screenshot_options` 为 environment fingerprint 的输入，但当前 `OPM-DEV-CANVAS-06-GOLDEN-ENVIRONMENT-001/0.1` Schema 未表达这些字段，也未封闭 font 的逻辑角色和 PostScript identity。`03B` 因而不能在不违背 Schema 或 fingerprint 契约的条件下实现 environment verifier。

## 2. 目标

冻结独立的 Golden Environment `0.2` 生产契约、`0.1` 历史兼容边界和后续 Schema/runner 实现入口，使 `GOLDEN-AUTHORING-03B` 可以在契约闭合后继续开发。

## 3. 非目标

- 本任务不新增或修改任何 JSON Schema、脚本、package 命令、Java、Vue、SQLite、API 或浏览器资产；
- 不生成 candidate、Approval、approved golden、Visual Manifest/Report、Candidate 或 Activation；
- 不修改 Golden Environment `0.1`，不回写历史输入或发布目录；
- 不宣称 `GATE-06-03`、Capability、production release 或 ISO 已通过。

## 4. 修改边界

允许修改：本规格、对应 checklist、Golden Authoring 主设计、03B/04/05 实现入口及其 checklist、DEV-CANVAS-06 的直接生产 Schema 指针、测试策略、执行包和文档索引。

禁止修改：`docs/contracts/**`、`scripts/**`、`services/**`、`apps/**`、`tests/**`、`package.json`、现有 candidate/approved 根、SQLite DDL、公共 API、Profile/Rule/Grammar/Symbol。

## 5. 冻结修正

### 5.1 版本与兼容性

1. 保持 `schema_id=OPM-DEV-CANVAS-06-GOLDEN-ENVIRONMENT-001`，生产目标升级为 `schema_version=0.2`，实现文件固定为 `docs/contracts/schemas/opm-dev-canvas-06-golden-environment-v02.schema.json`；
2. 既有 `opm-dev-canvas-06-golden-environment.schema.json` 保持 `0.1`、byte-for-byte 不变，只能作为历史契约输入，不能供 03B、04、05、生产 Visual Manifest 或 Golden Verifier 消费；
3. 新 Schema 的 JSON Schema 正反例、semantic verifier 和写入器必须由后续独立 `feature` 实现切片交付。本修正只冻结设计，不把文字视作 Schema 通过证据。

### 5.2 Golden Environment 0.2 封闭字段

`0.2` 顶层必须 `additionalProperties=false`，并包含以下字段：

```text
schema_id, schema_version, environment_id, generated_at,
os_name, os_build, arch,
playwright_version, chromium_version,
browser_executable{realpath,byte_length,sha256},
launch_args[], color_profile,
font_refs[{logical_role,postscript_name,font_version,path,byte_length,sha256}],
locale, timezone, color_scheme, reduced_motion, device_scale_factor,
screenshot_options{animations,caret,scale,mask_count},
environment_fingerprint,
png_refs[1242], blank_baseline_refs[9]
```

`os_name` 使用 Node `process.platform` 原值（`darwin`、`linux` 或 `win32`）；`arch` 使用 Node `process.arch` 原值（`arm64` 或 `x64`）。`browser_executable.realpath` 是启动前 `realpath` 得到的绝对审计路径，只作为运行证据，不进入 fingerprint；`byte_length/sha256` 必须针对该 realpath 的普通文件 bytes 计算，启动前再次复核。

`font_refs.path` 是未来 approved version 内的相对路径 `environment/fonts/<font-relative-path>`，不得为绝对路径、`..` 或 symlink；`logical_role` 只允许 `UI_SANS`、`CJK_FALLBACK`、`MONOSPACE`，每一角色恰有一个 ref。实际浏览器解析的字体文件必须在 author 启动前和每个 capture 前以 `postscript_name/font_version/byte_length/sha256` 复核，并与该 ref 相等。

`screenshot_options` 固定为 `{animations:"disabled",caret:"hide",scale:"css",mask_count:0}`。任何 mask、未声明选项、不同 scale 或动画/caret 策略均为 environment mismatch。

`png_refs` 与 `blank_baseline_refs` 保持 `0.1` 的 logical ID + `{kind,path,byte_length,sha256}` raw ref 结构、固定 Plan 顺序和 `1242/9` 精确计数；它们是 candidate/approved 内容，不进入 environment fingerprint。

### 5.3 Fingerprint 与身份

`environment_fingerprint` 固定为以下对象按 RFC 8785 JCS 后的 SHA-256：

```text
{
  os_name, os_build, arch,
  playwright_version, chromium_version,
  browser_executable_sha256: browser_executable.sha256,
  launch_args, color_profile,
  font_refs[{logical_role,postscript_name,font_version,path,byte_length,sha256}],
  locale, timezone, color_scheme, reduced_motion, device_scale_factor,
  screenshot_options
}
```

数组顺序固定：`launch_args` 为实际 launch 传参顺序；`font_refs` 按 `logical_role/postscript_name/path` 递增排序。`environment_id=dev-canvas-06.golden-environment.<environment_fingerprint 前 12 位>`，由 semantic verifier 跨字段检查。`generated_at` 固定为同一 `source_date_epoch` 的 UTC，且不进入 fingerprint。

### 5.4 Writer、verifier 与失败边界

1. 03B 先从已解析的 browser 与实际字体构造 `0.2` Environment，再逐项验证 fingerprint、`environment_id`、font/PNG/blank refs；仅验证成功后可原子写 candidate `golden-environment.json`；
2. 03B READY Report、04 Approval/Publisher、Golden Verifier 和 05 Visual Manifest 只接受通过 `0.2` Schema 与 semantic verifier 的 exact Environment raw bytes；Publisher 只能复制，不得重算或替换；
3. `0.1`、不匹配 browser SHA、font 角色缺失/重复、screenshot 选项不一致、PNG/blank 计数/顺序/sha 不闭合均为可归类 environment 阻断，退出 `3`，且不产生 READY candidate、Approval、approved root 或 Visual Manifest；
4. Schema/ref/path 无效退出 `2`；读写、realpath、hash 或内部异常退出 `4`。候选写入继续遵循 03B 的同目录 temp、fsync、Schema/semantic verify、atomic rename 和零覆盖要求。

## 6. 后续实现入口

后续新增 `GOLDEN-AUTHORING-03B Environment Schema` 实现切片，允许范围仅为 `0.2` Schema、AJV 正反例、environment semantic verifier 及其测试和 package 测试入口。该切片通过后，03B 才可实现 Common Fixture Factory、browser capture、candidate writer；04/05 仍分别等待真实 03B candidate 和 approved version。

## 7. 验收标准

1. `0.1` 与 `0.2` 的 Schema 路径、消费边界和回滚策略无歧义；
2. `0.2` 的完整字段、path/ref/SHA、角色、固定 screenshot options、fingerprint payload、排序和 `environment_id` 算法可直接实现；
3. 03B/04/05 对 `0.2` 的依赖和拒绝 `0.1` 的边界已同步；
4. Schema 正反例、runtime verifier、candidate writer 和 release asset 均明确仍未实现；
5. Markdown 链接、围栏、术语和跨文档版本指针通过检查。

## 8. 验证方式

1. 搜索 `Golden Environment 0.1/0.2`、`browser_executable_sha256`、`screenshot_options` 与 `environment_fingerprint`，确认生产指针一致；
2. 核对 `0.2` 字段和第 6.2 节 payload 完整一致；
3. 检查 Markdown 相对链接和围栏；
4. 执行 `jq empty docs/contracts/schemas/opm-dev-canvas-06-golden-environment.schema.json` 与 `git diff --check`。本任务不需要运行测试，因为禁止修改代码与 Schema。

## 9. 兼容与回滚

公共 API、SQLite、产品配置、`0.1` Schema 和所有既有资产不变。回滚只回退本设计文档增量；回滚后 03B 重新处于 `BLOCKED_BY_DESIGN`，不得以降级消费 `0.1` 继续执行。

## 10. 事实与假设

事实：当前 `0.1` Schema 无法表达已冻结 fingerprint 的完整输入；`0.2` Schema、正反例、environment verifier 和任何 candidate 均未实现。

假设：无。
