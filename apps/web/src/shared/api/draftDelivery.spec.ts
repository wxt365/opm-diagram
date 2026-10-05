import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftDelivery } from "./draftDelivery";
import { draftRawJson, draftRequestCanonical, draftSha256 } from "./draftRequestIdentity";
import type { DraftMutation } from "./draftRequestIdentity";
import type { DraftLane, DraftPendingEntry, DraftPendingStore } from "./draftPendingStore";
import type { DraftEditRequest } from "./generated/draftWorkspaceContract";
import { localRuntimeApi } from "./localRuntimeApi";

import vectors from "../../../../../tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json";
const token = { draft_id: "draft.1", edit_seq: 0, binding_digest: "a".repeat(64) };
const edit = (): DraftMutation => ({ operation: "EDIT", request: JSON.parse(vectors.digests[0].raw) as DraftEditRequest });
const save = (): DraftMutation => ({ operation: "SAVE", request: { save_id: "save.1", reason: "MANUAL", target_draft_token: token } });
const pin = (): DraftMutation => ({ operation: "PIN", request: { pin_id: "pin.1", purpose: "PERMALINK", target_draft_token: token } });
const editResult = () => JSON.parse(vectors.messages.find((item: { type: string; raw: string }) => item.type === "DraftEditResult" && item.raw.includes("DURABLE")).raw);
const saveResult = () => ({ save_id: "save.1", status: "SAVED", captured_token: token, checkpoint_id: "checkpoint.1", revision_id: "revision.1", head_token: token });
const pinResult = () => ({ pin_id: "pin.1", revision_id: "revision.1", captured_token: token });

// 此替身只验证交付状态机；真实 IDB 事务另有 Chromium 测试。
class MemoryPending implements DraftPendingStore {
  entries = new Map<string, DraftPendingEntry>();
  key(project: string, model: string, lane: DraftLane) { return JSON.stringify([project, model, lane]); }
  async read(project: string, model: string, lane: DraftLane) { return this.entries.get(this.key(project, model, lane)) ?? null; }
  async add(entry: DraftPendingEntry) {
    const key = this.key(entry.project_id, entry.model_id, entry.lane);
    if (this.entries.has(key)) throw { code: "DRAFT_PENDING_EXISTS" };
    this.entries.set(key, structuredClone(entry));
  }
  async acknowledge(entry: DraftPendingEntry) { this.entries.delete(this.key(entry.project_id, entry.model_id, entry.lane)); }
}

function setup() {
  const store = new MemoryPending();
  const query = vi.fn(async (_p, _m, operation, request) => operation === "open"
    ? { request_id: request.request_id, project_id: "project.1", model_id: "model.1", mode: "JOURNALED_DRAFT_V2", draft_token: token }
    : { ...request, status: "NOT_FOUND", request_digest: null, result: null });
  const mutate = vi.fn(async (_p, _m, operation) => operation === "EDIT" ? editResult() : operation === "SAVE" ? saveResult() : pinResult());
  const api = { draftQuery: query, draftMutation: mutate } as unknown as typeof localRuntimeApi;
  return { store, query, mutate, api, client: new DraftDelivery(store, api) };
}

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe("浏览器请求身份", () => {
  it("全部 EDIT canonical 和 SHA 与冻结 Node/Java 向量一致", async () => {
    for (const vector of vectors.digests) {
      const mutation: DraftMutation = { operation: "EDIT", request: JSON.parse(vector.raw) };
      const canonical = draftRequestCanonical(vectors.project_id, vectors.model_id, mutation);
      expect(canonical).toBe(vector.canonical);
      expect(await draftSha256(canonical)).toBe(vector.digest);
    }
  });

  it("PIN 固定向量一致，SAVE 使用独立身份与 binary64 序号", async () => {
    const request = { pin_id: "pin.test", purpose: "PERMALINK" as const, target_draft_token: { ...token, draft_id: "draft.test", edit_seq: 7 } };
    expect(await draftSha256(draftRequestCanonical("project.test", "model.test", { operation: "PIN", request })))
      .toBe("0526b1948d39fff497ff228e04978536459c48e8d458d2f15096d17ffb2d41ff");
    expect(draftRequestCanonical("project.1", "model.1", save())).toBe('{"identity_version":"DraftSaveRequest/1","model_id":"model.1","project_id":"project.1","reason":"MANUAL","save_id":"save.1","target_draft_token":{"binding_digest":"' + "a".repeat(64) + '","draft_id":"draft.1","edit_seq":{"binary64":"0000000000000000"}}}');
  });

  it.each([NaN, Infinity, -Infinity, undefined, new Date(), new Map(), new Array(2), { value: undefined }, "\ud800", "\udc00"])("非法 JSON 值拒绝：%s", value => {
    expect(() => draftRawJson(value)).toThrow();
  });

  it("拒绝循环和 getter；保留负零、Unicode 与数组顺序", () => {
    const loop: Record<string, unknown> = {}; loop.loop = loop;
    expect(() => draftRawJson(loop)).toThrow();
    expect(() => draftRawJson({ get value() { throw new Error("不得调用"); } })).toThrow();
    const raw = draftRawJson({ 中文: "订单😀", points: [-0, 0.1, 3] });
    expect(Object.is(JSON.parse(raw).points[0], -0)).toBe(true);
    expect(JSON.parse(raw).中文).toBe("订单😀");
  });
});

describe("草稿交付与恢复", () => {
  it("发送时请求已落队列，raw 相等且负零不变，DURABLE 后确认", async () => {
    const { client, mutate, store } = setup();
    mutate.mockImplementation(async (_p, _m, _op, raw) => {
      expect(store.entries.size).toBe(1);
      expect([...store.entries.values()][0]?.raw).toBe(raw);
      expect(Object.is(JSON.parse(raw).command.payload.layout.x, -0)).toBe(true);
      return editResult();
    });
    await client.submit("project.1", "model.1", edit());
    expect(store.entries.size).toBe(0);
  });

  it("调用后修改原请求不会改变已捕获 bytes", async () => {
    const { client, mutate } = setup(); const mutation = save();
    const saving = client.submit("project.1", "model.1", mutation);
    if (mutation.operation === "SAVE") mutation.request.save_id = "save.changed";
    await saving;
    expect(JSON.parse(mutate.mock.calls[0]?.[3]).save_id).toBe("save.1");
  });

  it("本地持久化失败零发送", async () => {
    const { client, mutate, store } = setup();
    vi.spyOn(store, "add").mockRejectedValue({ code: "DRAFT_LOCAL_PROTECTION_UNAVAILABLE" });
    await expect(client.submit("project.1", "model.1", edit())).rejects.toMatchObject({ code: "DRAFT_LOCAL_PROTECTION_UNAVAILABLE" });
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each(["EDIT", "SAVE", "PIN"] as const)("%s 丢响应后 FOUND 核对摘要并确认，不再提交", async operation => {
    const { client, mutate, store, query, api } = setup();
    const mutation = operation === "EDIT" ? edit() : operation === "SAVE" ? save() : pin();
    mutate.mockRejectedValueOnce(new Error("响应丢失"));
    await expect(client.submit("project.1", "model.1", mutation)).rejects.toThrow();
    const row = [...store.entries.values()][0]!;
    query.mockImplementation(async (_p, _m, op, request) => op === "open"
      ? { request_id: request.request_id, project_id: "project.1", model_id: "model.1", mode: "JOURNALED_DRAFT_V2", draft_token: { ...token, edit_seq: 10 } }
      : { ...request, status: "FOUND", request_digest: row.request_digest, result: operation === "EDIT" ? editResult() : operation === "SAVE" ? saveResult() : pinResult() });
    const reopened = new DraftDelivery(store, api);
    await reopened.recover("project.1", "model.1", row.lane);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(store.entries.size).toBe(0);
  });

  it.each(["EDIT", "SAVE", "PIN"] as const)("%s 无收据时只重发原字节与 ID", async operation => {
    const { client, mutate } = setup();
    mutate.mockRejectedValueOnce(new Error("断网"));
    await expect(client.submit("project.1", "model.1", operation === "EDIT" ? edit() : operation === "SAVE" ? save() : pin())).rejects.toThrow();
    await client.recover("project.1", "model.1", operation === "EDIT" ? "EDIT" : "EXPLICIT");
    expect(mutate.mock.calls[0]).toEqual(mutate.mock.calls[1]);
  });

  it.each(["token", "digest", "raw", "result", "operation"])("恢复 %s 不一致保留原条目且不重发", async fault => {
    const { client, mutate, store, query } = setup();
    mutate.mockRejectedValueOnce(new Error("断网"));
    await expect(client.submit("project.1", "model.1", edit())).rejects.toThrow();
    const row = [...store.entries.values()][0]!;
    if (fault === "raw") row.raw += " ";
    query.mockImplementation(async (_p, _m, op, request) => op === "open"
      ? { request_id: request.request_id, project_id: "project.1", model_id: "model.1", mode: "JOURNALED_DRAFT_V2", draft_token: { ...token, edit_seq: fault === "token" ? 1 : 0 } }
      : fault === "token" ? { ...request, status: "NOT_FOUND", request_digest: null, result: null }
        : { ...request, operation: fault === "operation" ? "SAVE" : "EDIT", status: "FOUND", request_digest: fault === "digest" ? "b".repeat(64) : row.request_digest,
          result: fault === "result" ? { ...editResult(), command_id: "wrong.id" } : editResult() });
    await expect(client.recover("project.1", "model.1", "EDIT")).rejects.toMatchObject({ code: fault === "raw" ? "DRAFT_PENDING_INVALID" : fault === "token" ? "DRAFT_CONFLICT" : "DRAFT_RESPONSE_INVALID" });
    expect(store.entries.size).toBe(1);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { status: "ACCEPTED" }, { ...editResult(), result_token: { ...token, edit_seq: 2 } }, { ...editResult(), content_digest: "bad" }])("不合法 2xx 结果不清队列", async response => {
    const { client, mutate, store } = setup(); mutate.mockResolvedValueOnce(response);
    await expect(client.submit("project.1", "model.1", edit())).rejects.toMatchObject({ code: "DRAFT_RESPONSE_INVALID" });
    expect(store.entries.size).toBe(1);
  });

  it("Runtime 拒绝与本地删除失败均保留；相同 lane 新请求不能覆盖", async () => {
    const { client, mutate, store } = setup(); mutate.mockRejectedValueOnce({ code: "DRAFT_EDIT_REJECTED" });
    await expect(client.submit("project.1", "model.1", edit())).rejects.toMatchObject({ code: "DRAFT_EDIT_REJECTED" });
    await expect(client.submit("project.1", "model.1", edit())).rejects.toMatchObject({ code: "DRAFT_PENDING_EXISTS" });
    vi.spyOn(store, "acknowledge").mockRejectedValueOnce({ code: "DRAFT_LOCAL_PROTECTION_UNAVAILABLE" });
    await expect(client.recover("project.1", "model.1", "EDIT")).rejects.toMatchObject({ code: "DRAFT_LOCAL_PROTECTION_UNAVAILABLE" });
    expect(store.entries.size).toBe(1);
  });

  it("SAVE 在途时 EDIT 可以完成，另一 SAVE/PIN 不能覆盖", async () => {
    const { client, mutate, store } = setup();
    let complete!: (value: unknown) => void;
    mutate.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const saving = client.submit("project.1", "model.1", save());
    await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
    await client.submit("project.1", "model.1", edit());
    await expect(client.submit("project.1", "model.1", pin())).rejects.toMatchObject({ code: "DRAFT_PENDING_EXISTS" });
    expect(store.entries.size).toBe(1); complete(saveResult()); await saving;
    expect(store.entries.size).toBe(0);
  });

  it.each(["SAVE", "PIN"] as const)("%s 无收据可以捕获同草稿较旧 token，但不能跨 binding", async operation => {
    const { client, mutate, query, store } = setup();
    mutate.mockRejectedValueOnce(new Error("断网"));
    await expect(client.submit("project.1", "model.1", operation === "SAVE" ? save() : pin())).rejects.toThrow();
    query.mockImplementation(async (_p, _m, op, request) => op === "open"
      ? { request_id: request.request_id, project_id: "project.1", model_id: "model.1", mode: "JOURNALED_DRAFT_V2", draft_token: { ...token, edit_seq: 3, binding_digest: "b".repeat(64) } }
      : { ...request, status: "NOT_FOUND", request_digest: null, result: null });
    await expect(client.recover("project.1", "model.1", "EXPLICIT")).rejects.toMatchObject({ code: "DRAFT_CONFLICT" });
    expect(store.entries.size).toBe(1); expect(mutate).toHaveBeenCalledTimes(1);
    query.mockImplementation(async (_p, _m, op, request) => op === "open"
      ? { request_id: request.request_id, project_id: "project.1", model_id: "model.1", mode: "JOURNALED_DRAFT_V2", draft_token: { ...token, edit_seq: 3 } }
      : { ...request, status: "NOT_FOUND", request_digest: null, result: null });
    await client.recover("project.1", "model.1", "EXPLICIT");
    expect(mutate).toHaveBeenCalledTimes(2); expect(store.entries.size).toBe(0);
  });
});
