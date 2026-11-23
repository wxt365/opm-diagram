import { createOpmClient, init, OpmWorkbench, type WorkbenchBinding, type WorkbenchSource, type WorkbenchSnapshot } from "@opm/workbench";
import { createRuntimeServices } from "@opm/workbench/runtime";

const snapshot: WorkbenchSnapshot = { diagrams: [] };
const instance = init(document.createElement("div"), { data: snapshot });
instance.on("selectionChange", ids => { ids.forEach(id => id.toUpperCase()); });
instance.setOption({ context: { project: { name: "外部项目" }, model: { name: "外部模型" } }, showHeader: true, showProfile: false, showVersionControls: false });
instance.dispose();
void OpmWorkbench; void createRuntimeServices;
const source: WorkbenchSource = { projectId: "123", projectName: "外部项目", modelId: "456", modelName: "外部模型" };
const client = createOpmClient({ backendUrl: "http://192.168.1.10:17850", assistantUrl: "http://192.168.1.10:17860", accessToken: async () => "access" });
const connected = init(document.createElement("div"), { backendUrl: "/opm", source });
connected.on("bound", (binding: WorkbenchBinding) => connected.setOption({ binding }));
connected.reload(); connected.dispose(); void client;
