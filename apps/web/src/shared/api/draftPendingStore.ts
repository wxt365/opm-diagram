import type { DraftOperation } from "./draftRequestIdentity";
import { LocalRuntimeApiError } from "./localRuntimeApi";

export type DraftLane = "EDIT" | "EXPLICIT";
export interface DraftPendingEntry {
  version: 1;
  project_id: string;
  model_id: string;
  lane: DraftLane;
  operation: DraftOperation;
  idempotency_id: string;
  raw: string;
  raw_sha256: string;
  request_digest: string;
}

export interface DraftPendingStore {
  read(project: string, model: string, lane: DraftLane): Promise<DraftPendingEntry | null>;
  add(entry: DraftPendingEntry): Promise<void>;
  acknowledge(entry: DraftPendingEntry): Promise<void>;
}

// 每次操作独立连接，只在事务 complete 后兑现 Promise；不回退内存。
export class IndexedDbDraftPendingStore implements DraftPendingStore {
  constructor(private readonly factory: () => IDBFactory = () => globalThis.indexedDB) { }

  read(project: string, model: string, lane: DraftLane): Promise<DraftPendingEntry | null> {
    return this.transaction("readonly", (store, set) => {
      const query = store.get([project, model, lane]);
      query.onsuccess = () => set(query.result ?? null);
    });
  }

  add(entry: DraftPendingEntry): Promise<void> {
    return this.transaction("readwrite", (store, _set, fail) => {
      const query = store.add(entry);
      query.onerror = () => {
        if (query.error?.name === "ConstraintError") fail(new LocalRuntimeApiError("DRAFT_PENDING_EXISTS", "当前操作尚未确认，请先恢复待确认请求。"));
      };
    });
  }

  acknowledge(entry: DraftPendingEntry): Promise<void> {
    return this.transaction("readwrite", (store, _set, fail) => {
      const key = [entry.project_id, entry.model_id, entry.lane];
      const query = store.get(key);
      query.onsuccess = () => {
        const current = query.result as DraftPendingEntry | undefined;
        // 另一页面已确认同条目时可重复完成，但不能删除另一条新请求。
        if (!current) return;
        if (current.operation !== entry.operation || current.idempotency_id !== entry.idempotency_id
          || current.raw_sha256 !== entry.raw_sha256 || current.request_digest !== entry.request_digest || current.raw !== entry.raw) {
          fail(new LocalRuntimeApiError("DRAFT_PENDING_CHANGED", "待确认记录已变化，未删除本地数据。")); return;
        }
        store.delete(key);
      };
    });
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let failed = false;
      const fail = () => { failed = true; reject(protectionError()); };
      try {
        const request = this.factory().open("opm-draft-delivery", 1);
        request.onupgradeneeded = () => {
          if (failed) { request.transaction?.abort(); return; }
          request.result.createObjectStore("pending", { keyPath: ["project_id", "model_id", "lane"] });
        };
        request.onerror = fail;
        request.onblocked = fail;
        request.onsuccess = () => {
          const database = request.result;
          if (failed) { database.close(); return; }
          database.onversionchange = () => database.close();
          resolve(database);
        };
      } catch { fail(); }
    });
  }

  private async transaction<T>(mode: IDBTransactionMode,
    body: (store: IDBObjectStore, set: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      let result: T;
      let failure: Error | undefined;
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction("pending", mode, { durability: "strict" });
      } catch { database.close(); reject(protectionError()); return; }
      const fail = (error: Error) => { failure ??= error; transaction.abort(); };
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onabort = () => { database.close(); reject(failure ?? protectionError()); };
      transaction.onerror = () => { failure ??= protectionError(); };
      if (mode === "readwrite" && transaction.durability !== "strict") { fail(protectionError()); return; }
      try { body(transaction.objectStore("pending"), value => { result = value; }, fail); }
      catch { fail(protectionError()); }
    });
  }
}

function protectionError(): LocalRuntimeApiError {
  return new LocalRuntimeApiError("DRAFT_LOCAL_PROTECTION_UNAVAILABLE", "本地恢复保护不可用，未清除待确认输入。", true);
}
