# Windows x64 交叉构建测试包

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

日期：2026-11-16。Work Mode：change；Risk Level：L2；Task Type：feature。
Active Playbooks：none (primary)、testing。

## 目标与非目标

用户要求构建 Windows 安装包，并确认暂时没有 Windows 主机。尝试在 Mac ARM64 上使用隔离 Linux x64 + Wine/Mono 工具链生成当前 0.1.3 的 Windows x64 测试安装器。仅交付交叉构建测试包，不宣称真实 Windows 安装、升级、卸载、助手或完整运行验收通过；原生 Windows 正式构建规则继续保留。

## 修改边界与契约

允许新增 `apps/desktop/scripts` 的定向构建辅助代码、相应测试、本规格/检查清单和桌面说明；允许在忽略的构建目录及临时目录下载匹配架构的发行运行时、装配 Windows 专属生产依赖、运行隔离 Docker 和生成独立 Windows 输出。禁止修改业务 API/schema、根依赖和版本、现有 macOS 包、用户数据与凭证、`.harness` 或其他未提交工作。不得将 Mac 的 JRE/Node/原生依赖直接用于 Windows，不删除或停用现有容器。不得绕过资源摘要/目标架构检查。

## 验收

- W1：Windows x64 的 Java 17、Node 22、Electron 和原生依赖来源/版本/摘要可追溯；独立装配不包含用户配置、凭证或业务数据。
- W2：使用现有 Electron Packager + Squirrel 依赖构建，验证最终主程序及运行时的 PE x64 架构、资源摘要、安装器结构及摘要；macOS 产物不变。
- W3：提供实际产物与安装说明，明确 Wine/静态检查不等于 Windows 运行验收。如下载/工具环境阻断，记录确切失败和已完成结果，不生成伪安装器。

## Plan 与边界确认

先验证 Wine/Mono 工具环境与目标运行时下载，再在独立目录安装 Windows 生产依赖并核对现有 Harness Windows 分支；复用已验证 Web/JAR/资产并记录摘要；交叉打包时独立校验 Windows 资源，不改变原生 Forge 守卫；生成 Squirrel EXE 后检查结构、保存摘要及交付。用户构建请求覆盖必要工具链与测试产物，未授权外部发布或 Git 推送。

## 回滚

仅移除本次新增脚本/文档及独立 Windows 测试产物，保留原生构建逻辑、旧包、用户数据和既有容器。若不能完成构建，保留可追溯的阻断记录，不标记 W1/W2 已完成。
