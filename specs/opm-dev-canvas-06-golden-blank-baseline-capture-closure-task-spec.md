# Spec: GOLDEN-AUTHORING-03B Blank Baseline Capture Closure

文档状态：`FROZEN_FOR_IMPLEMENTATION`

Task Type：`feature`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 目标

为 Candidate Author 的九个 blank baseline 冻结唯一浏览器输入、双 attempt 生命周期、输出布局和结果映射。该闭包只补足已冻结 `9/18` 矩阵的可执行语义；不改变 Capture Plan、Authoring Report、Golden Environment、Approval 或 Visual Manifest Schema。

## 2. 唯一执行语义

1. Blank Capture 的唯一 owner 是 `scripts/release-canvas06-golden-author.mjs`。它只使用 CLI 已显式传入且 preflight 已校验的 browser executable 与 Plan `environment_policy`；不得访问 Runtime、Web、fixture、数据库、checkout、系统字体目录或环境变量。
2. 每个 `plan.blank_baselines[]` 按 Plan 原序执行 `attempt_ordinal=1,2`。每次 attempt 都启动一个新的 Chromium process、Browser Context 和 Page；不得复用任一对象。
3. Context 固定使用 baseline 的 `viewport_id`、Plan 的 locale/timezone/color_scheme/reduced_motion/device_scale_factor，launch args 必须逐项等于 Plan `environment_policy.launch_args`。
4. Page 只导航至 `about:blank`，不得写入 DOM、使用 network route/interception 或加载任何外部资源。唯一允许的页面求值是只读的双 `requestAnimationFrame` 稳定等待；该页不承载应用状态，`zoom_id` 只作为 baseline identity 的一部分，不对空白页施加 CSS 或浏览器缩放。
5. Page 完成一次 `requestAnimationFrame` 双帧后，以 Plan `screenshot_options` 截取 viewport PNG。输出固定为：

```text
<candidate-temp-root>/blank/attempt-1/<baseline_id>.png
<candidate-temp-root>/blank/attempt-2/<baseline_id>.png
```

6. 结果对象固定为 `{baseline_id,attempt_ordinal,png_byte_length,png_sha256,width,height}`。同一 baseline 的两次对象必须除 `attempt_ordinal` 外深度相等；不等时以 `GOLDEN_AUTHOR_ENVIRONMENT_MISMATCH/3` 失败。
7. Canonical blank 只取 attempt 1，传给既有 `writeCandidateGoldenEnvironment()` 的路径固定为 `blank/attempt-1/<baseline_id>.png`。attempt 2 只作为 Candidate Report evidence，永不进入 approved root。
8. 所有 blank bytes 写入既有 Candidate transaction temporary root。任一失败由该 transaction 清理临时根，最终 candidate root、Approval、approved root 和 Visual Manifest 均为零输出。

## 3. 修改边界

后继实现只允许修改 Candidate Author、其定向 Node 测试、03B implementation spec/checklist、本文和必要状态文档。禁止修改浏览器产品 UI、Runtime、SQLite、公共 API、Capture Plan/Report/Environment Schema、Approval/Publisher 和 Visual Manifest。

## 4. 验收

1. 九个 baseline 和 18 个 attempt 均按 Plan 原序生成；缺失、重复、额外、已有输出或不同 PNG/尺寸全部拒绝。
2. browser/context/page 对每次 attempt 均新建并关闭；非 `about:blank`、错误 viewport、错误 launch/context/screenshot 参数或页面脚本调用全部拒绝。
3. `writeCandidateGoldenEnvironment()` 与 Candidate Report 的 blank refs/attempt results 能逐字段复算。
4. 失败时 Candidate transaction 不发布 final root。

## 5. 状态边界

该闭包和定向测试只使 03B 主链可实现，不构成真实 Candidate、人工审批、approved version、Visual Gate、Capability 启用或 ISO 符合性证据。
