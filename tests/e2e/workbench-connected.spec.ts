import { expect, test } from "@playwright/test";

test("IP+端口直连真实 Runtime/助手，首次关联、编辑保存、再次关联和 binding 打开", async ({ page }) => {
  const host = process.env.OPM_CONNECTED_E2E_HOST ?? "127.0.0.1";
  const backend = `http://${host}:17862`, assistant = `http://${host}:17863`;
  const query = new URLSearchParams({ backend, assistant, token: "connected-e2e-access" });
  const path = `/apps/web/examples/workbench-connected.html?${query}`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(path);
  await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
  const first = JSON.parse(await page.locator("#status").innerText());
  expect(first.projectId).toMatch(/^project\./); expect(first.modelId).toMatch(/^model\./);
  await expect(page.locator(".workbench-header")).toContainText("宿主项目");
  await expect(page.locator(".workbench-header")).toContainText("宿主模型");
  const edited = page.waitForResponse(response => response.url().endsWith("/draft/commands") && response.request().method() === "POST");
  await page.getByTestId("p03-tool-object").click();
  expect((await edited).status()).toBe(200);
  await expect(page.locator(".x6-node")).toHaveCount(1);
  const saved = page.waitForResponse(response => response.url().endsWith("/draft/save"));
  await page.getByTestId("hs-save").click(); expect((await saved).status()).toBe(200);
  await page.getByTestId("p03-run-validation").click();
  await expect(page.getByTestId("p03-validation-status")).toContainText("已完成");
  const assistantList = page.waitForResponse(response => response.url().startsWith(assistant) && response.url().endsWith("/api/assistant/list"));
  const assistantWatch = page.waitForResponse(response => response.url().startsWith(assistant) && response.url().endsWith("/api/assistant/watch"));
  await page.getByTestId("left-tab-assistant").click(); expect((await assistantList).status()).toBe(200);
  expect((await assistantWatch).status()).toBe(200);
  await page.goto(path); // source 重试，后端解析同一份关联
  await expect(page.getByTestId("p03-tool-object")).toBeEnabled();
  expect(JSON.parse(await page.locator("#status").innerText())).toEqual(first);
  await expect(page.locator(".x6-node")).toHaveCount(1);
  const ensure = page.waitForRequest(request => request.url().endsWith("/integration/workspace"));
  await page.goto(path + "&binding=1");
  const request = await ensure;
  expect(request.postDataJSON().binding).toEqual(first);
  expect(request.postDataJSON().source).toBeUndefined();
  await expect(page.locator(".x6-node")).toHaveCount(1);
  expect(errors).toEqual([]);
});
