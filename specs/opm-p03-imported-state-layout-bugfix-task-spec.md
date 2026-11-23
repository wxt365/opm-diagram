# 已导入状态加载布局修复

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix。
Active Playbooks: none (primary)，本仓库 `.harness` 不存在。
平台接入 Task Type: bugfix；Active Playbooks: frontend-vue (primary)、testing。

## 目标与验收

- IMPORT-STATE-01：加载已导入模型时，越界/重叠状态按 owner_id 回到本图所属对象/特征内；必要时扩容，不改变语义、身份、关系端点。
- IMPORT-STATE-02：保留合法手工位置及无关节点；不将远离 owner 的旧坐标当成扩容目标，不猜测缺失 owner 的归属。
- IMPORT-STATE-03：编辑草稿的修正通过现有布局批量命令随手动保存持久化；保存失败保留待保存布局，保存后重开稳定。只读版本/静态快照仅修正显示、不发命令。
- IMPORT-STATE-04：首开、子图切换、服务端同步及快照都覆盖；新建、改名、拖动原有自适应逻辑保持有效。
- IMPORT-STATE-05：组件回归及真实 X6 浏览器验证包含截图对应的旧坐标；更新本地平台组件依赖并验证运行前端。

## 边界与契约

允许修改状态几何工具、workbench stateLayout/workbenchLayout、workbenchRuntime 及相关回归测试，组件打包脚本、本规格/checklist；平台仅 vendor、package.json 和本地依赖安装。
允许补定向测试及本地 smoke；不改后端、数据库、助手、公共 API、生成契约、路由、全局样式或新依赖。
非目标：全图重新排版/避线、修改业务语义、批量覆盖数据库或改写已发布版本。
继续使用 UPDATE_LAYOUT_BATCH 和现有手动保存协议。
本规格替代上一规格 STATE-03 中“已有重叠仅显式自动布局修复”的限制，依据用户要求修复已导入元素。

## 计划

1. 以实际导入投影坐标补复现测试，区分加载修复和拖动扩容。
2. 复用状态排版，保留有效位置，修正旧越界位置；接入投影、快照及草稿待保存布局。
3. 回归加载/保存重读/只读和状态编辑，构建组件、浏览器验证并更新平台依赖。

## 验证与回滚

定向 Vitest、类型检查、lint、组件与宿主构建；浏览器检查状态包含、连接及保存重开。
回滚仅撤销本次加载整理及切回 platform.8，不涉及 schema 或业务数据迁移。
