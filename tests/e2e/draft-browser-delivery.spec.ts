import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { DraftDelivery } from "../../apps/web/src/shared/api/draftDelivery";
import type { DraftMutation } from "../../apps/web/src/shared/api/draftRequestIdentity";
import type { IndexedDbDraftPendingStore } from "../../apps/web/src/shared/api/draftPendingStore";

declare global {
  interface Window { __draftDelivery: DraftDelivery; __draftPending: IndexedDbDraftPendingStore }
}

const token = { draft_id: "draft.browser", edit_seq: 0, binding_digest: "a".repeat(64) };
function mutation(id = "command.browser"): DraftMutation {
  return { operation: "EDIT", request: { request_id: "request.browser", command_id: id, expected_draft_token: token,
    scope: { context_id: "context.browser", selection_id: "occurrence.browser", intent: "UPDATE_LAYOUT", endpoints: [] },
    authorization: { capability_query_id: "query.browser", selected_option_id: "option.browser" },
    command: { command_type: "UPDATE_LAYOUT", payload: { occurrence_id: "occurrence.browser", layout: { x: -0, y: 0.1 } } } } };
}
function result(id = "command.browser") {
  return { request_id: "request.browser", command_id: id, status: "DURABLE", base_token: token, result_token: { ...token, edit_seq: 1 },
    content_digest: "b".repeat(64), affected_ids: [], text_trace_ids: [], validation_summary: { blocking: 0, warning: 0, suggestion: 0, coverage_state: "INCOMPLETE" } };
}

async function mount(page: Page) {
  await page.goto("/__draft-delivery-test");
  await page.evaluate(async () => {
    // 直接导入生产 owner；页面不装配工作台，也不连接真实用户 Runtime。
    const { DraftDelivery } = await import("/src/shared/api/draftDelivery.ts");
    const { IndexedDbDraftPendingStore } = await import("/src/shared/api/draftPendingStore.ts");
    window.__OPM_LOCAL_SESSION__ = "session.browser";
    window.__draftPending = new IndexedDbDraftPendingStore();
    window.__draftDelivery = new DraftDelivery(window.__draftPending);
  });
}
async function submit(page: Page, input = mutation()) {
  return page.evaluate(async request => {
    try { await window.__draftDelivery.submit("project.browser", "model.browser", request); return "OK"; }
    catch (error) { return (error as { code: string }).code; }
  }, input);
}
async function pending(page: Page) { return page.evaluate(() => window.__draftDelivery.pending("project.browser", "model.browser")); }

test.beforeEach(async ({ context }) => {
  await context.route("**/__draft-delivery-test", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>草稿传输测试</title>" }));
});

test("真实 IndexedDB 先提交后发送；刷新后凭 exact 收据确认，不再编辑", async ({ page, context }) => {
  let commands = 0, committedBeforeSend = false, digest = "";
  await context.route("**/api/v2/**", async route => {
    const input = route.request().postDataJSON();
    if (route.request().url().endsWith("/commands")) {
      commands++;
      const rows = await pending(page);
      committedBeforeSend = rows.length === 1 && rows[0]?.raw === route.request().postData();
      expect(Object.is(JSON.parse(rows[0]!.raw).command.payload.layout.x, -0)).toBe(true);
      expect(route.request().headers()["x-opm-session"]).toBe("session.browser");
      digest = rows[0]!.request_digest;
      await route.abort("failed"); return;
    }
    const body = route.request().url().endsWith("/open")
      ? { request_id: input.request_id, project_id: "project.browser", model_id: "model.browser", mode: "JOURNALED_DRAFT_V2", draft_token: { ...token, edit_seq: 1 } }
      : { ...input, status: "FOUND", request_digest: digest, result: result() };
    await route.fulfill({ json: body });
  });
  await mount(page);
  expect(await submit(page)).toBe("RUNTIME_UNAVAILABLE");
  expect(committedBeforeSend).toBe(true);
  await page.reload(); await mount(page);
  expect(await pending(page)).toHaveLength(1);
  const recovered = await page.evaluate(() => window.__draftDelivery.recover("project.browser", "model.browser", "EDIT"));
  expect(recovered).toMatchObject({ command_id: "command.browser", status: "DURABLE" });
  expect(commands).toBe(1); expect(await pending(page)).toHaveLength(0);
});

test("NOT_FOUND 在原 token 上按原 bytes 重试；不开辟新 command_id", async ({ page, context }) => {
  const raws: string[] = [];
  await context.route("**/api/v2/**", async route => {
    const input = route.request().postDataJSON();
    if (route.request().url().endsWith("/commands")) {
      raws.push(route.request().postData()!);
      if (raws.length === 1) { await route.abort("failed"); return; }
      await route.fulfill({ json: result() }); return;
    }
    await route.fulfill({ json: route.request().url().endsWith("/open")
      ? { request_id: input.request_id, project_id: "project.browser", model_id: "model.browser", mode: "JOURNALED_DRAFT_V2", draft_token: token }
      : { ...input, status: "NOT_FOUND", request_digest: null, result: null } });
  });
  await mount(page); expect(await submit(page)).toBe("RUNTIME_UNAVAILABLE");
  await mount(page);
  await page.evaluate(() => window.__draftDelivery.recover("project.browser", "model.browser", "EDIT"));
  expect(raws).toHaveLength(2); expect(raws[0]).toBe(raws[1]); expect(await pending(page)).toHaveLength(0);
});

test("两个页面同 lane 竞争不能覆盖；旧确认不能删除另一条请求", async ({ page, context }) => {
  let commands = 0;
  await context.route("**/api/v2/**", async route => { commands++; await route.abort("failed"); });
  const other = await context.newPage(); await mount(page); await mount(other);
  const responses = await Promise.all([submit(page, mutation("command.one")), submit(other, mutation("command.two"))]);
  expect(responses.sort()).toEqual(["DRAFT_PENDING_EXISTS", "RUNTIME_UNAVAILABLE"]);
  expect(commands).toBe(1);
  const rows = await pending(page); expect(rows).toHaveLength(1);
  expect(await pending(other)).toEqual(rows);
  const rejected = await page.evaluate(async row => {
    try { await window.__draftPending.acknowledge({ ...row, idempotency_id: "command.wrong" }); return "OK"; }
    catch (error) { return (error as { code: string }).code; }
  }, rows[0]!);
  expect(rejected).toBe("DRAFT_PENDING_CHANGED"); expect(await pending(page)).toEqual(rows);
  await page.evaluate(row => window.__draftPending.acknowledge(row), rows[0]!);
  expect(await pending(other)).toHaveLength(0);
});

for (const failure of ["unavailable", "quota", "relaxed"] as const) {
  test(`真实浏览器 ${failure} 时零网络发送且不给出成功`, async ({ page, context }) => {
    let commands = 0;
    await context.route("**/api/v2/**", async route => { commands++; await route.abort("failed"); });
    await mount(page);
    await page.evaluate(kind => {
      if (kind === "unavailable") Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
      else if (kind === "quota") IDBObjectStore.prototype.add = () => { throw new DOMException("受控配额失败", "QuotaExceededError"); };
      else {
        const original = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (stores, mode) { return original.call(this, stores, mode, { durability: "relaxed" }); };
      }
    }, failure);
    expect(await submit(page)).toBe("DRAFT_LOCAL_PROTECTION_UNAVAILABLE"); expect(commands).toBe(0);
  });
}

test("真实 IndexedDB 写事务 abort 不发送，也不留下半条记录", async ({ page, context }) => {
  let commands = 0;
  await context.route("**/api/v2/**", async route => { commands++; await route.abort("failed"); });
  await mount(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      const query = original.call(this, value, key);
      query.addEventListener("success", () => this.transaction.abort());
      return query;
    };
  });
  expect(await submit(page)).toBe("DRAFT_LOCAL_PROTECTION_UNAVAILABLE");
  expect(commands).toBe(0); expect(await pending(page)).toHaveLength(0);
});
