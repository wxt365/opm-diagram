# OPM 工作台接入

完整安装、单文件使用、参数/方法、后端部署与数据目录说明见 [OPM 工作台完整使用与部署指南](opm-workbench-user-guide.md)。以下保留接入速查。

## 0.2.2-platform.1：平台迁移接入

本地集成包新增 `saveWithResult(): Promise<string | null>`，返回已确认提交的 Runtime 版本，失败返回 `null`。旧 `save()` 保持兼容。宿主应使用返回值确认保存结果。完整部署、数据职责、接口及恢复说明见 [使用指南](opm-workbench-user-guide.md)。

## 0.2.0：传入地址自动关联

本仓库不依赖来源私有 npm 仓库，也未发布公共组件包。按完整使用指南第 3.2 节从当前源码构建组件，使用自己生成的 `.tgz` 本地安装；以生成产物的 package.json 为准，不复用来源包的版本或验收结论。

0.2.0 需要更新 Runtime 与助手后端，0.1.x 后端没有新 JSON 会话和关联接口。原 services/context 模式继续兼容；地址模式优先使用自动客户端，无需手写 API、bootstrap 或 Vite 代理。下面是完整编辑推荐入口：

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import { OpmWorkbench, type WorkbenchBinding } from '@opm/workbench';
import '@opm/workbench/style.css';

// 从宿主业务记录读取已有关联，首次为空。
const binding = shallowRef<WorkbenchBinding>();
const source = {
  systemId: 'asset-management', // 可省略，默认 default
  projectId: '宿主项目UUID', projectName: '宿主项目名称',
  modelId: '宿主建模记录UUID', modelName: '宿主模型名称',
};
function saveBinding(value: WorkbenchBinding) {
  binding.value = value;
  // 在这里调用宿主接口持久化，关联当前后端环境、业务项目与建模记录。
}
</script>

<template>
  <div style="height: 700px">
    <OpmWorkbench
      backend-url="http://127.0.0.1:17850"
      assistant-url="http://127.0.0.1:17860"
      :source="source"
      :binding="binding"
      show-header
      @bound="saveBinding"
    />
  </div>
</template>
```

首次输入 source：后端确保关联，组件 `bound` 返回 OPM ID；相同 source 重试也复用，名称更新不重建。已有 binding：校验并打开原模型，不执行创建；错误关联返回错误，不自动创建替代模型。显示名称来自 source；只传 binding 时也可通过 context 提供显示名称。每个源模型应使用独立宿主模型 ID，切换前调用 `prepareLeave()` 处理未保存内容。提供实例 `reload()` 可重新取得会话。

backendUrl 支持 `http://IP:端口`、HTTPS 域名和 `/opm` 这样的同源代理前缀，地址只包含服务根路径，不追加 `/api/v1`。assistantUrl 为助手服务根路径，可省略以关闭助手。IP/域名必须从浏览器所在机器可达，127.0.0.1 指浏览器所在机器。HTTPS 页面只能连接 HTTPS 后端或同源路径，不能连接 HTTP 服务。

服务地址直接跨源时只配置后端，不需要 Vite 代理。本机默认可用；局域网/服务器部署分别为 Runtime 和助手启动进程设置：

```powershell
$env:OPM_RUNTIME_HOST = '0.0.0.0'
$env:OPM_ASSISTANT_HOST = '0.0.0.0'
$env:OPM_REMOTE_ENABLED = 'true'
$env:OPM_TRUSTED_WEB_ORIGINS = 'http://192.168.1.20:3000,https://host.example.com'
$env:OPM_EMBEDDED_ACCESS_TOKEN = '<部署接入凭证>'
# 助手需要连接同一份 Runtime；同服务器部署可继续使用回环地址。
$env:OPM_RUNTIME_ORIGIN = 'http://127.0.0.1:17850'
$env:OPM_RUNTIME_ACCESS_TOKEN = '<相同的部署接入凭证>'
```

Runtime 使用上述配置启动新 jar；助手使用新代码启动。AI 服务密钥仍只放助手后端。远程组件额外传 `:access-token="getAccessToken"`，其中 `getAccessToken` 为宿主认证体系提供的函数，返回字符串或 Promise；同机开发模式可省略。这个凭证属于共享 Runtime 的接入权限，当前没有多租户或模型级权限隔离。远程网关不开放旧 `/opm-bootstrap.js`。生产使用 HTTPS，按实际可达服务填写两个地址；来源允许列表是一项部署配置，不由组件自动修改。

跨源助手请求的 OPTIONS 需要允许 `Content-Type`、`X-OPM-Session` 和 `Authorization`。助手仍校验来源与 Runtime 会话；网关也应保留这些请求头和 SSE 响应。验证时使用隔离输出目录，避免 Playwright 默认清理已有报告，例如在上述浏览器验证命令后追加 `--output=test-results/workbench-connected-check`。

JS SDK 参数同 Vue：

```ts
const instance = init(container, { backendUrl, assistantUrl, source, binding, accessToken, showHeader: true });
instance.on('bound', value => saveBinding(value));
```

`createOpmClient({ backendUrl, assistantUrl, accessToken })` 也可单独调用 `connect()` / `ensureWorkspace(source, binding)`，并将 `client.services` 交给旧 services 接入。内部恢复队列按 Runtime 地址隔离，切换服务器不会将另一环境的未确认提交发送过去。绑定 ID 的宿主持久化也需区分后端环境。

完整 Vue 包装示例见使用指南第 4 节。跨源浏览器验证：先构建组件与 Runtime jar，再运行 `npx playwright test --config=tests/e2e/playwright.workbench-connected.config.ts`。该配置在临时目录运行隔离 Runtime/助手，使用机器 IP 和不同端口，实际验证创建、保存、校验、助手会话和再次打开，不使用现有数据。此配置是可执行验证入口，不代表本次已经运行；服务器公网 HTTPS 的证书和网关在部署环境验收。

现有前端是正式宿主：项目/模型管理、全局头部、路由留在原应用；`WorkbenchView.vue` 将上下文、Runtime 服务和宿主导航交给 `OpmWorkbench`。0.2.0 新增嵌入会话/关联接口及远程接入配置，数据库 schema 未改，原服务协议仍兼容。

## 构建与使用

在仓库根目录执行：

```sh
npm run build:workbench --workspace=@opm/web
```

产物在 `apps/web/dist-workbench`，包含 ESM、隔离样式、类型声明和 `@opm/workbench` 的包清单。可将整个目录复制到其他项目，或在该目录执行 `npm pack` 后安装生成的 tgz；本任务不发布注册表。Vue 3.5.26+ 为 peer dependency，画布及组件内部状态依赖已打包，不需要宿主安装 Pinia 插件或 Vue Router。

Vue 宿主：

```vue
<script setup lang="ts">
import { OpmWorkbench, type WorkbenchSnapshot } from '@opm/workbench';
import '@opm/workbench/style.css';

const context = {
  project: { id: 'project-1', name: '外部项目' },
  model: { id: 'model-1', name: '外部模型' },
  activeContextId: 'root'
};
const data: WorkbenchSnapshot = {
  diagrams: [{ id: 'root', label: 'SD', kind: 'SYSTEM_DIAGRAM', depth: 0,
    nodes: [], relations: [], textLines: [] }]
};
</script>

<template>
  <div style="height: 700px">
    <OpmWorkbench :context="context" :data="data" />
  </div>
</template>
```

普通 JS 宿主：

```js
import { init } from '@opm/workbench';
import '@opm/workbench/style.css';

const workbench = init(document.getElementById('canvas-container'), {
  context: { model: { name: '外部模型' } },
  data: { diagrams: [] },
  showHeader: false,
  projectNavigation: false,
});
workbench.on('selectionChange', ids => console.log(ids));
workbench.setData(nextSnapshot); // 整体替换，不隐式合并节点数组
workbench.setOption({ context: nextContext, data: nextSnapshot });
workbench.resize();
// 宿主卸载页面时：
workbench.dispose();
```

此组件面向浏览器。容器需要明确高度，建议至少 360px；现有宿主保持原页面高度。容器变化由画布的 ResizeObserver 自动适配，宿主也可调用 `resize()` 重新适配视图。

## 输入契约

| 参数 | 默认值与行为 |
| --- | --- |
| `backendUrl` / `assistantUrl` | 0.2.0 地址模式；未提供 backendUrl 时保留原 services/context 模式 |
| `source` / `binding` | 宿主身份与 OPM 关联分开；binding 优先；首次无需 binding |
| `accessToken` | 远程模式接入凭证字符串或异步获取函数，本机模式可省略 |
| `context.project` | 可选，默认“默认项目”；ID 不会用于创建资源 |
| `context.model` | 可选，默认“未命名模型” |
| `context.activeContextId` | 默认第一张 OPD，无数据时为空白根 OPD |
| `context.revision` | 可选，服务模式指定历史版本；未指定时打开活动草稿 |
| `context.profileLabel` | 可选，工作台头部的规则版本标签 |
| `data` | 多 OPD 展示快照：`diagrams`、可选 `findings` |
| `services` | 可选，宿主提供的 Runtime 协议适配器及助手服务 |
| `showHeader` | `false`；控制工作台上下文与操作栏 |
| `showProfile` | `false`；显示 Profile 版本标签；原项目页面显式启用 |
| `showVersionControls` | `false`；显示草稿版本身份和版本选择器；原项目页面显式启用 |
| `projectNavigation` | `false`；显示项目导航按钮后只发事件，不接管路由 |

`data` 优先于 `services`，采用只读快照模式。支持画布缩放、选择、属性查看、OPD 导航和 OPL/问题展示，禁用语义编辑、保存、校验、脑图及助手；不会发起后端请求。未传任何参数也能显示空白工作台。

从 0.1.1 起，嵌入可复用工作台头部，替换宿主自定义的标题/保存/校验行：

```vue
<OpmWorkbench
  :context="{
    project: { id: opmProjectId, name: externalProjectName },
    model: { id: opmModelId, name: externalModelName }
  }"
  :services="services"
  :show-header="true"
  :project-navigation="false"
  :show-profile="false"
  :show-version-controls="false"
/>
```

项目和模型名称由宿主传入，编辑回读不会覆盖这些展示名称；没有传名称时使用后端或默认名称。项目导航关闭后项目名称仍显示为文本。嵌入隐藏 Profile 及版本区域，保留保存状态、只读提示和校验按钮，保存仍可通过画布工具栏执行。原项目保留完整头部。外部宿主需移除自己的 `host-toolbar`，避免出现两行标题和操作。

快照保留 `id`（语义身份）与 `occurrenceId`（图中实例身份），节点、关系和子图定义见公共类型。每张图有独立的 `nodes`、`relations` 和可选 `textLines`。输入在读取时复制，组件不修改宿主数据；宿主用新快照对象替换 `data`，切换模型时同时替换 `context` 与 `data`。当前 OPD 不在新快照中时回退到第一张图。

## 完整编辑与现有后端

不传 `data`、传入真实项目/模型 ID 和 `services` 后进入服务模式。完整编辑复用现有 OPM 草稿、能力选项、语义校验和保存协议，而不是在组件内另写一套规则。

```ts
import { createRuntimeServices } from '@opm/workbench/runtime';

const services = createRuntimeServices(runtimeApiAdapter, {
  request: assistantRequestAdapter,
  watch: assistantSubscriptionAdapter,
});
```

`runtimeApiAdapter` 实现 `WorkbenchRuntimeApi`：由宿主负责网络地址、身份认证、数据获取和写入。`createRuntimeServices` 将同一个适配器传给工作台、草稿会话、提交恢复和脑图查询。服务模式要求提供真实项目和模型 ID。宿主传入的名称优先用于展示；未传名称时使用服务返回的名称。

本仓库的原宿主显式使用 `createLocalRuntimeServices()`，继续连接原 Runtime 和助手服务，包括原有浏览器会话、IndexedDB 草稿提交恢复及路由永久链接。外部嵌入不会自动使用该适配器。永久链接依赖宿主导航，因此仅原宿主显示此入口。

当前源码的周期状态同步使用 GET `/api/v2/projects/{projectId}/models/{modelId}/draft/save-state`，空闲间隔 15 秒，待检查点、保存中或待确认操作时 2 秒；页面隐藏、KeepAlive 停用时暂停，恢复后立即同步。请求完成后才调度下一次，连续失败退避至最多 30 秒。浏览器请求和后端响应均禁用状态缓存。`draft/open` 仍用于实际打开、重载或编辑回读。

自定义 `WorkbenchRuntimeApi` 适配器需要提供 `draftSaveState(projectId, modelId): Promise<SaveState>`，直接返回上述接口的状态对象（无 V1 envelope），复用实例的后端地址与会话认证。默认地址模式和 `createLocalRuntimeServices()` 已实现。0.2.1 安装包已包含该前端优化，安装命令为 `npm install ./opm-workbench-0.2.1.tgz`；后端优化需单独构建部署 Runtime。

替换 `services` 会销毁旧组件实例并创建新实例；宿主应先调用 `prepareLeave()`，处理未保存内容，再替换服务或卸载。切换模型、图或版本的旧加载响应会被丢弃。

## 事件与实例方法

事件名称：`bound`、`navigateProject`、`contextChange`、`revisionChange`、`selectionChange`、`ready`、`error`。Vue 模板使用对应 kebab-case，例如 `@navigate-project`。

Vue ref 暴露：`prepareLeave()`、`save()`、`saveWithResult()`、`validate()`、`resize()`、`reload()`。JS 实例还提供 `setOption()`、`setData()`、`on()`、`off()`、`dispose()`。配置局部更新，快照整体替换；`save/validate` 由服务模式实现，快照模式不执行写入，调用结束不代表业务成功。`saveWithResult()` 返回已确认版本或 `null`，供宿主衔接业务提交。`ready` 表示初始或指定位置加载完成；后续语义变更和提交结果由服务协议返回。

同页工作台各自拥有状态、DOM 标识和快捷键范围；嵌入实例需要在工作台内聚焦后使用快捷键。原宿主保留原来的页面保存快捷键。

## 独立示例与验收

构建完成后，在仓库根目录执行：

```sh
node apps/web/scripts/serve-workbench-example.mjs
```

打开 `http://127.0.0.1:5179`，验证两个真实 X6 工作台、数据替换、子图导航和实例销毁；示例只引用构建产物，不依赖应用路由和后端。宿主的粉色按钮用于观察组件样式是否影响页面。

```sh
npx playwright test --config=tests/e2e/playwright.workbench-component.config.ts
```

自动验证真实画布渲染、无 API 请求、样式边界、多实例和卸载。原系统 E2E 继续使用原配置，此示例使用独立配置和端口。
