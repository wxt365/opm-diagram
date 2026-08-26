# Checklist: DEV-CANVAS-06 E2E Fault Launcher Clean Base与受控Playwright闭包修正

状态：`FROZEN/COMPLETE/SUPERSEDED_FOR_BUILD_BY_PREFLIGHT_DESCRIPTOR_CLOSURE`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 背景/复现/Root Cause | 1、2 | F01~F05 |
| Fix Strategy/base intake | 3、4 | F06~F15 |
| 2A与36 raw refs | 5、6 | F16~F25 |
| 缺陷回流 | 7 | F26~F30 |
| Playwright依赖/机器输出 | 8 | F31~F43 |
| 验收/回滚/事实 | 9~11 | F44~F52 |

## Checklist

- [x] F01 旧规格仍把38路径全部定义为可修改delta。
- [x] F02 旧规格仍记录`BLOCKED_BY_BASE_INTAKE`。
- [x] F03 已复现`0dcaa27...`中36 present、2 absent。
- [x] F04 两个absent路径恰为controlled Playwright spec和Node测试。
- [x] F05 Root Cause为预计allowlist未随clean实现收敛。
- [x] F06 base完整SHA固定为`0dcaa27a92693feaf28b731ebed2f81a9ccea02c`。
- [x] F07 base唯一parent固定为完整`e598...`。
- [x] F08 base tree固定为`ed8a3093...`。
- [x] F09 base epoch固定为`1787730276`。
- [x] F10 base patch SHA固定为`28d64b7c...`。
- [x] F11 base intake状态固定为`READY`。
- [x] F12 fresh worktree HEAD/porcelain证明已冻结。
- [x] F13 当前dirty main禁止作为2A输入。
- [x] F14 活动Manifest/Attempt/Source Set指纹已记录。
- [x] F15 Source Set/Report/Profile版本保持不变。
- [x] F16 唯一delta冻结为`2 A`。
- [x] F17 两个新增path逐字符冻结。
- [x] F18 历史结论已由后继规格收紧：contract base parent等于origin base，2A parent等于contract base。
- [x] F19 禁止修改`package.json`和36项基线。
- [x] F20 2A patch SHA公式已冻结。
- [x] F21 final commit/raw ref/patch SHA不得预填。
- [x] F22 36项raw ref逐项包含path/length/SHA。
- [x] F23 36项顺序固定。
- [x] F24 集合摘要固定为`69491a...b411e`。
- [x] F25 raw ref缺失、extra、重排或漂移均拒绝。
- [x] F26 新测试发现基线缺陷时停止2A Build。
- [x] F27 稳定状态固定为`FAULT_LAUNCHER_BASELINE_DEFECT_DETECTED`。
- [x] F28 基线缺陷必须新建bugfix规格与checklist。
- [x] F29 新规格必须显式扩展allowlist并重建clean base。
- [x] F30 禁止mock/skip/dynamic patch/fallback绕过缺陷。
- [x] F31 唯一preflight CLI和参数集合已冻结。
- [x] F32 参数错误与依赖阻断边界已分离。
- [x] F33 历史十项dependency已冻结；活动第十项由后继规格替换为D10A，D10B移至执行artifact。
- [x] F34 三case、6 attempts、12 cycles计数已冻结。
- [x] F35 机器对象Schema ID/version已冻结。
- [x] F36 顶层11字段封闭。
- [x] F37 dependency result形状与状态枚举已冻结。
- [x] F38 payload SHA公式已冻结。
- [x] F39 BLOCKED stdout/stderr/exit=3已冻结。
- [x] F40 BLOCKED零Runtime/Web/Browser/SQLite/attempt输出已冻结。
- [x] F41 READY命令token数组已冻结且不修改package.json。
- [x] F42 READY不等于Playwright通过。
- [x] F43 skip/fixme/only/retry/dev/mock均禁止。
- [x] F44 Fault Launcher活动规格/checklist同步完成。
- [x] F45 Runner/Toolchain状态同步完成。
- [x] F46 README、测试策略、执行包与冻结基线同步完成。
- [x] F47 活动文档无38路径可修改或base intake缺失残留；冻结基线中的旧文字只作为带日期的历史记录，由复核记录四十六显式取代。
- [x] F48 36/2计数与集合摘要复算通过。
- [x] F49 本规格、checklist及八份同步文档路径存在性验证通过；本规格/checklist未新增Markdown超链接。
- [x] F50 `git diff --check`及新增文件尾随空白检查通过。
- [x] F51 设计任务未修改代码/Schema/release资产。
- [x] F52 Gate/Capability/ISO状态未提升。

## 当前门状态

- 设计修正：`COMPLETE`。
- Fault Launcher 2A Build：`BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`。
- Preflight Contract：`FROZEN_FOR_IMPLEMENTATION/NOT_STARTED`。
- Controlled Playwright：`NOT_RUN`；依赖不齐时必须输出`BLOCKED_BY_DEPENDENCY`机器对象。
- `GATE-06-03`：`BLOCKED/NOT_RUN`。
