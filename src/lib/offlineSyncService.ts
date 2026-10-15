import localforage from "localforage";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { syncAxiosInstance } from "./axios";
import type {
  QueuedMutation,
  SyncHistoryItem,
  SyncEngineStatus,
  SyncResult,
  OperationType,
  MutationMethod,
} from "@/types/offline";

// Dedicated LocalForage instance for persistent offline operations
export const offlineStore = localforage.createInstance({
  name: "ImpressBikeInv",
  storeName: "offline_system_store",
});

export type QueueSubscriber = (queue: QueuedMutation[]) => void;
export type StatusSubscriber = (status: SyncEngineStatus) => void;
export type HistorySubscriber = (history: SyncHistoryItem[]) => void;

// ==========================================
// SMALL HELPERS (pure functions)
// ==========================================

/**
 * A tiny lock: every function passed in runs one after another.
 * We use it so "read queue -> change -> write queue" can never overlap
 * (this was the cause of lost/overwritten queue items).
 */
function makeLock() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn);
    tail = result.catch(() => undefined);
    return result;
  };
}

// Matches ids like "temp-xxxx". The lookbehind avoids matching inside other words.
const TEMP_RE = /(?<![A-Za-z0-9])temp-[A-Za-z0-9_-]+/g;

// Keys that only exist on the client and must never be sent to the server
const isClientOnlyKey = (key: string) =>
  key === "tempId" || key.startsWith("_temp") || key === "_offlinePending" || key === "_offline";

function replaceTempDeep(value: any, map: Record<string, string | number>): any {
  if (typeof value === "string") return value in map ? map[value] : value;
  if (Array.isArray(value)) return value.map((v) => replaceTempDeep(v, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceTempDeep(v, map)])
    );
  }
  return value;
}

function stripClientKeys(value: any): any {
  if (Array.isArray(value)) return value.map(stripClientKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !isClientOnlyKey(k))
        .map(([k, v]) => [k, stripClientKeys(v)])
    );
  }
  return value;
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;
  const h = headers as any;
  const value =
    typeof h.get === "function" ? h.get(name) : h[name] ?? h[name.toLowerCase()];
  return typeof value === "string" && value ? value : undefined;
}

const isNumericId = (id: unknown) => id !== "" && id !== null && !isNaN(Number(id));

class OfflineSyncService {
  private queueKey = "offline_mutations_queue";
  private historyKey = "offline_sync_history";
  private idMapKey = "offline_id_reconciliation_map";
  private lastSyncTimeKey = "offline_last_sync_timestamp";

  private isSyncing = false;
  private lastSyncTime: number | null = null;

  private queueSubscribers: Set<QueueSubscriber> = new Set();
  private queueSnapshot: QueuedMutation[] = [];
  private statusSubscribers: Set<StatusSubscriber> = new Set();
  private historySubscribers: Set<HistorySubscriber> = new Set();

  // One lock per kind of data
  private queueLock = makeLock();
  private cacheLock = makeLock();
  private historyLock = makeLock();

  constructor() {
    if (typeof window !== "undefined") {
      void this.initService();
    }
  }

  private async initService() {
    try {
      const storedTime = await offlineStore.getItem<number>(this.lastSyncTimeKey);
      if (storedTime) this.lastSyncTime = storedTime;

      // If the tab was closed in the middle of a sync, items stay "syncing" forever.
      await this.mutateQueue((q) =>
        q.map((i) => (i.status === "syncing" ? { ...i, status: "pending" as const } : i))
      );

      await this.cleanExpiredHistory();
      this.notifyStatus();
    } catch (e) {
      console.warn("Init offline service error:", e);
    }
  }

  // ==========================================
  // SUBSCRIPTIONS & EVENT NOTIFICATIONS
  // ==========================================

  public subscribeQueue(callback: QueueSubscriber): () => void {
    this.queueSubscribers.add(callback);
    void this.getQueue().then(callback);
    return () => {
      this.queueSubscribers.delete(callback);
    };
  }

  public subscribeStatus(callback: StatusSubscriber): () => void {
    this.statusSubscribers.add(callback);
    void this.getStatus().then(callback);
    return () => {
      this.statusSubscribers.delete(callback);
    };
  }

  public subscribeHistory(callback: HistorySubscriber): () => void {
    this.historySubscribers.add(callback);
    void this.getHistory().then(callback);
    return () => {
      this.historySubscribers.delete(callback);
    };
  }

  private async notifyStatus() {
    const status = await this.getStatus();
    this.statusSubscribers.forEach((cb) => {
      try {
        cb(status);
      } catch (e) {
        console.error("Status subscriber error:", e);
      }
    });
  }

  private notifyQueue(queue: QueuedMutation[]) {
    this.queueSnapshot = queue;
    this.queueSubscribers.forEach((cb) => {
      try {
        cb(queue);
      } catch (e) {
        console.error("Queue subscriber error:", e);
      }
    });
    void this.notifyStatus();
  }

  private notifyHistory(history: SyncHistoryItem[]) {
    this.historySubscribers.forEach((cb) => {
      try {
        cb(history);
      } catch (e) {
        console.error("History subscriber error:", e);
      }
    });
  }

  public async getStatus(): Promise<SyncEngineStatus> {
    const queue = await this.getQueue();
    const pendingCount = queue.filter((i) => i.status === "pending").length;
    const syncingCount = queue.filter((i) => i.status === "syncing").length;
    const failedCount = queue.filter((i) => i.status === "failed" || i.permanentFailure).length;

    return {
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      pendingCount,
      syncingCount,
      failedCount,
      totalQueueCount: queue.length,
    };
  }

  // ==========================================
  // QUEUE PERSISTENCE
  // ==========================================

  /** Plain read (no lock needed for reading). */
  public async getQueue(): Promise<QueuedMutation[]> {
    if (typeof window === "undefined") return [];
    try {
      const queue = await offlineStore.getItem<QueuedMutation[]>(this.queueKey);
      this.queueSnapshot = queue || [];
      return this.queueSnapshot;
    } catch (e) {
      console.error("Failed to read offline queue:", e);
      return [];
    }
  }

  public getQueueSnapshot(): QueuedMutation[] {
    return this.queueSnapshot;
  }

  /**
   * THE ONLY WAY the queue is changed.
   * Reads the latest queue, lets you return the new one, saves it.
   * Runs inside the queue lock so two changes can never overwrite each other.
   * Do not modify items in place inside `fn`; return new arrays/objects.
   */
  private mutateQueue(
    fn: (queue: QueuedMutation[]) => QueuedMutation[] | Promise<QueuedMutation[]>
  ): Promise<QueuedMutation[]> {
    return this.queueLock(async () => {
      if (typeof window === "undefined") return [];
      const current = await this.getQueue();
      const next = await fn(current);
      await offlineStore.setItem(this.queueKey, next);
      this.notifyQueue(next);
      return next;
    });
  }

  /** Change one queue item (or remove it when change is null). */
  private patchItem(id: string, change: Partial<QueuedMutation> | null) {
    return this.mutateQueue((q) =>
      change ? q.map((i) => (i.id === id ? { ...i, ...change } : i)) : q.filter((i) => i.id !== id)
    );
  }

  /** Kept for backward compatibility. Prefer the specific methods. */
  public async saveQueue(queue: QueuedMutation[]): Promise<void> {
    await this.mutateQueue(() => queue);
  }

  // ==========================================
  // HISTORY PERSISTENCE
  // ==========================================

  public async getHistory(): Promise<SyncHistoryItem[]> {
    if (typeof window === "undefined") return [];
    try {
      const history = await offlineStore.getItem<SyncHistoryItem[]>(this.historyKey);
      return history || [];
    } catch (e) {
      console.error("Failed to read sync history:", e);
      return [];
    }
  }

  public async saveHistory(history: SyncHistoryItem[]): Promise<void> {
    if (typeof window === "undefined") return;
    await offlineStore.setItem(this.historyKey, history);
    this.notifyHistory(history);
  }

  public recordHistoryItem(item: Omit<SyncHistoryItem, "id" | "syncedAt">): Promise<void> {
    return this.historyLock(async () => {
      const history = await this.getHistory();
      const newItem: SyncHistoryItem = {
        ...item,
        id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        syncedAt: Date.now(),
      };
      // Keep most recent 100 history items
      await this.saveHistory([newItem, ...history].slice(0, 100));
    });
  }

  /** History must never break the sync, so errors are only logged. */
  private async safeRecordHistory(item: Omit<SyncHistoryItem, "id" | "syncedAt">) {
    try {
      await this.recordHistoryItem(item);
    } catch (e) {
      console.warn("Failed to record sync history:", e);
    }
  }

  /** Cleans successful history older than retentionDays (default: 7 days) */
  public cleanExpiredHistory(retentionDays = 7): Promise<void> {
    return this.historyLock(async () => {
      const history = await this.getHistory();
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const filtered = history.filter((h) => h.status === "failed" || h.syncedAt >= cutoff);
      if (filtered.length !== history.length) {
        await this.saveHistory(filtered);
      }
    });
  }

  public clearSuccessHistory(): Promise<void> {
    return this.historyLock(async () => {
      const history = await this.getHistory();
      await this.saveHistory(history.filter((h) => h.status === "failed"));
    });
  }

  // ==========================================
  // ID RECONCILIATION MAPPING
  // ==========================================

  public async getIdMap(): Promise<Record<string, string | number>> {
    if (typeof window === "undefined") return {};
    try {
      const map = await offlineStore.getItem<Record<string, string | number>>(this.idMapKey);
      return map || {};
    } catch (e) {
      console.error("Failed to read ID map:", e);
      return {};
    }
  }

  public async saveIdMap(map: Record<string, string | number>): Promise<void> {
    if (typeof window === "undefined") return;
    await offlineStore.setItem(this.idMapKey, map);
  }

  public isTempId(id: string | number | null | undefined): boolean {
    if (!id) return false;
    return String(id).startsWith("temp-");
  }

  public generateTempId(): string {
    const uuid =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
          const random = Math.floor(Math.random() * 16);
          const value = character === "x" ? random : (random & 0x3) | 0x8;
          return value.toString(16);
        });
    return `temp-${uuid}`;
  }

  public generateClientMutationId(): string {
    return `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  // ==========================================
  // CACHE HELPERS
  // ==========================================

  private cleanUrl(url: string) {
    return url.startsWith("/") ? url : `/${url}`;
  }

  /** Params other than page/limit (like search text) change what the list contains. */
  private extraParams(params?: Record<string, unknown>) {
    if (!params) return null;
    const extras = Object.keys(params)
      .filter((k) => k !== "page" && k !== "limit" && params[k] !== undefined && params[k] !== "")
      .sort();
    if (extras.length === 0) return null;
    return Object.fromEntries(extras.map((k) => [k, params[k]]));
  }

  public getCacheKeyForUrl(url: string, params?: Record<string, unknown>): string {
    const base = `get_cache_${this.cleanUrl(url)}`;
    const extras = this.extraParams(params);
    return extras ? `${base}?${JSON.stringify(extras)}` : base;
  }

  private async putCache(key: string, data: any) {
    await offlineStore.setItem(key, { data, cachedAt: Date.now() });
  }

  /**
   * Saves a GET response.
   * Paged lists (page/limit) are MERGED into one full list for that URL,
   * so page 2 no longer overwrites page 1. Offline we slice pages out of it.
   */
  public cacheGetResponse(url: string, data: any, params?: Record<string, unknown>): Promise<void> {
    return this.cacheLock(async () => {
      if (typeof window === "undefined") return;
      try {
        const key = this.getCacheKeyForUrl(url, params);
        let toStore = data;

        const page = Number(params?.page);
        const isPagedList =
          !this.extraParams(params) && Number.isFinite(page) && Array.isArray(data?.data);

        if (isPagedList) {
          const limit = Number(params?.limit) || data.data.length;
          const total = Number(data.meta?.total ?? data.data.length);
          const coversEverything = page === 1 && total <= limit;

          // If page 1 already contains everything, replace (this also drops deleted rows).
          if (!coversEverything) {
            const existing = await this.getCachedResponse(url);
            const previous: any[] = Array.isArray(existing?.data) ? existing.data : [];
            const merged = new Map<string, any>();
            previous.forEach((row) => merged.set(String(row.id), row));
            data.data.forEach((row: any) => merged.set(String(row.id), row));
            toStore = { ...data, data: Array.from(merged.values()) };
          }
        }

        await this.putCache(key, toStore);
        // Also save to the base key (without params) so getCachedPage/applyOptimisticUnlocked always share the same master list!
        if (isPagedList && key !== this.getCacheKeyForUrl(url)) {
          await this.putCache(this.getCacheKeyForUrl(url), toStore);
        }
      } catch (e) {
        console.warn("Failed to cache GET response:", e);
      }
    });
  }

  public async getCachedResponse(url: string, params?: Record<string, unknown>): Promise<any | null> {
    if (typeof window === "undefined") return null;
    try {
      const cached = await offlineStore.getItem<{ data: any; cachedAt: number }>(
        this.getCacheKeyForUrl(url, params)
      );
      return cached ? cached.data : null;
    } catch (e) {
      console.warn("Failed to get cached response:", e);
      return null;
    }
  }

  /** All cached rows of a list URL (all pages merged). */
  public async getCachedRows(url: string): Promise<any[]> {
    const body = await this.getCachedResponse(url);
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body)) return body;
    return [];
  }

  /** One page of the cached list, with correct meta. Returns null when nothing cached. */
  public async getCachedPage(
    url: string,
    params: { page?: number | string; limit?: number | string } & Record<string, unknown>
  ): Promise<{ data: any[]; meta: { page: number; limit: number; total: number; totalPages: number } } | null> {
    if (this.extraParams(params)) return null;
    const body = await this.getCachedResponse(url);
    if (!body || !Array.isArray(body.data)) return null;

    // numeric ids ascending first, temp ids after (in the order they were added)
    const numeric = body.data
      .filter((r: any) => isNumericId(r.id))
      .sort((a: any, b: any) => Number(a.id) - Number(b.id));
    const others = body.data.filter((r: any) => !isNumericId(r.id));
    const rows = [...numeric, ...others];

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Number(params.limit) || rows.length || 1);
    const total = rows.length;
    return {
      data: rows.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** Call this on logout so the next user never sees (or syncs) the previous user's data. */
  public async clearAllOfflineData(): Promise<void> {
    if (typeof window === "undefined") return;
    await this.queueLock(async () => {
      await offlineStore.clear();
      this.lastSyncTime = null;
      this.notifyQueue([]);
      this.notifyHistory([]);
    });
  }

  // ==========================================
  // ENTITY & OPERATION INFERENCE
  // ==========================================

  public parseUrlMetadata(url: string, method: string) {
    const parts = this.cleanUrl(url).split("/").filter(Boolean);

    const meaningfulParts = parts.filter((p) => p !== "api");
    const entitySlug = meaningfulParts[0] || "resource";

    const entityName =
      entitySlug.charAt(0).toUpperCase() +
      entitySlug.slice(1).replace(/-([a-z])/g, (_, c) => ` ${c.toUpperCase()}`);

    const rawMethod = method.toLowerCase();
    let operation: OperationType = "create";
    if (rawMethod === "post") operation = "create";
    else if (rawMethod === "put" || rawMethod === "patch") operation = "update";
    else if (rawMethod === "delete") operation = "delete";

    let recordId: string | number = "";
    if (meaningfulParts.length > 1 && meaningfulParts[1] !== "next-id") {
      recordId = meaningfulParts[1];
    }

    return { entity: entityName, operation, recordId };
  }

  // ==========================================
  // ENQUEUE MUTATION
  // ==========================================

  public async enqueueMutation(config: AxiosRequestConfig): Promise<AxiosResponse> {
    const rawMethod = (config.method || "post").toLowerCase() as MutationMethod;
    const rawUrl = config.url || "";

    let parsedData = config.data;
    if (typeof parsedData === "string") {
      try {
        parsedData = JSON.parse(parsedData);
      } catch {
        // Keep string
      }
    }

    const { entity, operation, recordId } = this.parseUrlMetadata(rawUrl, rawMethod);

    let tempId: string | undefined = undefined;
    let finalRecordId: string | number = recordId;

    if (rawMethod === "post") {
      const requestedTempId =
        parsedData &&
        typeof parsedData === "object" &&
        !Array.isArray(parsedData) &&
        (parsedData._tempId || parsedData.tempId);
      tempId = typeof requestedTempId === "string" ? requestedTempId : this.generateTempId();
      finalRecordId = tempId;
      if (parsedData && typeof parsedData === "object" && !Array.isArray(parsedData)) {
        parsedData = { ...parsedData, tempId };
      }
    }

    // If the request already had an idempotency id (first online attempt), reuse it.
    const clientMutationId =
      readHeader(config.headers, "X-Client-Mutation-Id") ?? this.generateClientMutationId();

    const mutationItem: QueuedMutation = {
      id: `mut-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      clientMutationId,
      entity,
      operation,
      recordId: finalRecordId,
      tempId,
      method: rawMethod,
      url: rawUrl,
      resourceUrl:
        rawMethod === "post" ? rawUrl : rawUrl.split("/").slice(0, -1).join("/") || rawUrl,
      data: parsedData,
      // Never store auth headers here. The sync axios instance adds a fresh token when sending.
      headers: {},
      timestamp: Date.now(),
      status: "pending",
      retryCount: 0,
      maxRetries: 5,
    };

    await this.mutateQueue((queue) => {
      const next = [...queue];

      // Editing a record that is still waiting to be created: merge the edit into the pending POST
      if ((rawMethod === "put" || rawMethod === "patch") && this.isTempId(recordId)) {
        const postIndex = next.findIndex(
          (i) => i.method === "post" && i.tempId === String(recordId) && i.status !== "syncing"
        );
        if (postIndex >= 0) {
          const post = next[postIndex];
          next[postIndex] = {
            ...post,
            data: { ...(post.data || {}), ...(parsedData || {}) },
            status: "pending",
            permanentFailure: false,
            errorMessage: undefined,
            errorStatus: undefined,
            retryCount: 0,
            nextRetryTimestamp: undefined,
          };
          return next;
        }
      }

      // Same temp record saved twice: replace the earlier POST instead of adding a second one
      const existingIndex = tempId ? next.findIndex((item) => item.tempId === tempId) : -1;
      if (existingIndex >= 0) {
        const existing = next[existingIndex];
        next[existingIndex] = {
          ...existing,
          ...mutationItem,
          id: existing.id,
          clientMutationId: existing.clientMutationId,
          retryCount: existing.retryCount,
          status: existing.status === "syncing" ? "syncing" : "pending",
          permanentFailure: false,
        };
      } else {
        next.push(mutationItem);
      }
      return next;
    });

    // Apply optimistic update to local cache
    const simulatedRecord = await this.applyOptimisticUpdate(mutationItem);

    const responsePayload = {
      success: true,
      data: simulatedRecord,
      message:
        rawMethod === "post"
          ? "Action saved offline. Record created with temporary ID."
          : "Action saved offline. Changes will sync when online.",
      _offline: true,
      _tempId: tempId,
    };

    return {
      data: responsePayload,
      status: rawMethod === "post" ? 201 : 200,
      statusText: "OK (Offline Queued)",
      headers: config.headers || {},
      config,
      request: {},
    } as AxiosResponse;
  }

  // ==========================================
  // OPTIMISTIC CACHE UPDATES
  // ==========================================

  public applyOptimisticUpdate(mutation: QueuedMutation): Promise<any> {
    return this.cacheLock(() => this.applyOptimisticUnlocked(mutation));
  }

  private listFrom(wrapperData: any): any[] | null {
    if (Array.isArray(wrapperData)) return wrapperData;
    if (Array.isArray(wrapperData?.data)) return wrapperData.data;
    return null;
  }

  private async applyOptimisticUnlocked(mutation: QueuedMutation): Promise<any> {
    const { method, url, data, tempId } = mutation;
    const cleanUrl = this.cleanUrl(url);

    try {
      if (method === "post") {
        const listCacheKey = this.getCacheKeyForUrl(cleanUrl);
        const cachedWrapper = await offlineStore.getItem<{ data: any }>(listCacheKey);

        const newRecord = {
          ...(data || {}),
          id: tempId,
          _offlinePending: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const list = cachedWrapper ? this.listFrom(cachedWrapper.data) : null;
        if (cachedWrapper && list) {
          const existingIndex = list.findIndex(
            (item: Record<string, unknown>) =>
              String(item.id) === String(tempId) || String(item.tempId) === String(tempId)
          );
          if (existingIndex >= 0) {
            list[existingIndex] = { ...list[existingIndex], ...newRecord };
          } else {
            list.unshift(newRecord);
          }
          if (Array.isArray(cachedWrapper.data)) {
            cachedWrapper.data = list;
          } else if (cachedWrapper.data && Array.isArray(cachedWrapper.data.data)) {
            cachedWrapper.data.data = list;
            if (cachedWrapper.data.meta) {
              cachedWrapper.data.meta.total = list.length;
            }
          }
          await offlineStore.setItem(listCacheKey, cachedWrapper);
        } else {
          // If no list cache exists yet for this resource, create it with this new offline record!
          await offlineStore.setItem(listCacheKey, {
            data: {
              success: true,
              data: [newRecord],
              meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
            },
            cachedAt: Date.now(),
          });
        }

        if (tempId) {
          await this.putCache(this.getCacheKeyForUrl(`${cleanUrl}/${tempId}`), {
            success: true,
            data: newRecord,
            message: "Retrieved from offline cache",
          });
        }

        return newRecord;
      }

      if (method === "put" || method === "patch") {
        const parts = cleanUrl.split("/").filter(Boolean);
        const targetId = parts[parts.length - 1];
        const baseUrl = "/" + parts.slice(0, parts.length - 1).join("/");

        const listCacheKey = this.getCacheKeyForUrl(baseUrl);
        const cachedWrapper = await offlineStore.getItem<{ data: any }>(listCacheKey);

        let updatedRecord: any = null;

        const list = cachedWrapper ? this.listFrom(cachedWrapper.data) : null;
        if (cachedWrapper && list) {
          const index = list.findIndex(
            (item: any) =>
              String(item.id) === String(targetId) || String(item.tempId) === String(targetId)
          );
          if (index !== -1) {
            list[index] = { ...list[index], ...(data || {}), updatedAt: new Date().toISOString() };
            updatedRecord = list[index];
            await offlineStore.setItem(listCacheKey, cachedWrapper);
          }
        }

        const singleKey = this.getCacheKeyForUrl(cleanUrl);
        const singleCached = await this.getCachedResponse(cleanUrl);
        if (singleCached) {
          const target = singleCached.data ? singleCached.data : singleCached;
          const merged = { ...target, ...(data || {}), updatedAt: new Date().toISOString() };
          await this.putCache(singleKey, { success: true, data: merged, message: "Updated offline" });
          if (!updatedRecord) updatedRecord = merged;
        }

        return updatedRecord || { id: targetId, ...(data || {}) };
      }

      if (method === "delete") {
        const parts = cleanUrl.split("/").filter(Boolean);
        const targetId = parts[parts.length - 1];
        const baseUrl = "/" + parts.slice(0, parts.length - 1).join("/");

        const listCacheKey = this.getCacheKeyForUrl(baseUrl);
        const cachedWrapper = await offlineStore.getItem<{ data: any }>(listCacheKey);

        const list = cachedWrapper ? this.listFrom(cachedWrapper.data) : null;
        if (cachedWrapper && list) {
          const filtered = list.filter(
            (item: any) =>
              String(item.id) !== String(targetId) && String(item.tempId) !== String(targetId)
          );
          if (Array.isArray(cachedWrapper.data)) {
            cachedWrapper.data = filtered;
          } else if (cachedWrapper.data?.data) {
            cachedWrapper.data.data = filtered;
          }
          await offlineStore.setItem(listCacheKey, cachedWrapper);
        }

        await offlineStore.removeItem(this.getCacheKeyForUrl(cleanUrl));
        return { id: targetId, deleted: true };
      }
    } catch (e) {
      console.error("Optimistic update error:", e);
    }

    return data;
  }

  // ==========================================
  // ID RECONCILIATION
  // ==========================================

  public async reconcileTempId(
    tempId: string,
    realId: string | number,
    resourceUrl: string
  ): Promise<void> {
    if (!tempId || realId === undefined || realId === null || realId === "") return;

    // 1. Save to ID map (keep only the newest 500 entries)
    const idMap = await this.getIdMap();
    idMap[tempId] = realId;
    const keys = Object.keys(idMap);
    if (keys.length > 500) {
      keys.slice(0, keys.length - 500).forEach((k) => delete idMap[k]);
    }
    await this.saveIdMap(idMap);

    // 2. Replace the temp id in the remaining queue items (url, recordId, body)
    await this.mutateQueue((queue) =>
      queue.map((item) => {
        const touches =
          item.url.includes(tempId) ||
          String(item.recordId) === String(tempId) ||
          JSON.stringify(item.data ?? null).includes(tempId);
        if (!touches) return item;
        return {
          ...item,
          url: item.url.split(tempId).join(String(realId)),
          recordId: String(item.recordId) === String(tempId) ? realId : item.recordId,
          data: replaceTempDeep(item.data, { [tempId]: realId }),
        };
      })
    );

    // 3. Reconcile cached list and single record
    await this.cacheLock(async () => {
      try {
        const cleanUrl = this.cleanUrl(resourceUrl);
        const listCacheKey = this.getCacheKeyForUrl(cleanUrl);
        const cachedWrapper = await offlineStore.getItem<{ data: any }>(listCacheKey);

        let foundItem: any = null;
        const list = cachedWrapper ? this.listFrom(cachedWrapper.data) : null;

        if (cachedWrapper && list) {
          for (let i = 0; i < list.length; i++) {
            if (String(list[i].id) === String(tempId) || String(list[i].tempId) === String(tempId)) {
              list[i].id = realId;
              delete list[i].tempId;
              delete list[i]._offlinePending;
              foundItem = list[i];
              break;
            }
          }
          await offlineStore.setItem(listCacheKey, cachedWrapper);
        }

        if (foundItem) {
          await this.putCache(this.getCacheKeyForUrl(`${cleanUrl}/${realId}`), {
            success: true,
            data: foundItem,
            message: "Synced record retrieved",
          });
          await offlineStore.removeItem(this.getCacheKeyForUrl(`${cleanUrl}/${tempId}`));
        }
      } catch (e) {
        console.error("Reconcile cache error:", e);
      }
    });

    // 4. Tell the app (Redux listeners)
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("offline-id-reconciled", { detail: { tempId, realId, resourceUrl } })
      );
    }
  }

  // ==========================================
  // SYNC PROCESSING ENGINE
  // ==========================================

  /**
   * Decide what to send for one queue item:
   *  - "ready": send this url/data
   *  - "wait":  it depends on a record that has not synced yet (try again later)
   *  - "fail":  it depends on a record that failed for good
   */
  private async prepareRequest(item: QueuedMutation, queue: QueuedMutation[]) {
    const idMap = await this.getIdMap();

    let url = item.url;
    for (const [tempKey, realValue] of Object.entries(idMap)) {
      if (url.includes(tempKey)) url = url.split(tempKey).join(String(realValue));
    }
    // Replace first, then remove client-only keys (_tempId, _tempProvinceId, ...)
    const data = stripClientKeys(replaceTempDeep(item.data, idMap));

    const found = new Set<string>([
      ...(url.match(TEMP_RE) ?? []),
      ...(JSON.stringify(data ?? null).match(TEMP_RE) ?? []),
    ]);

    let mustWait = false;
    for (const tempRef of found) {
      const parent = queue.find((q) => q.tempId === tempRef && q.id !== item.id);
      if (!parent) continue; // not one of our queued records, treat as normal text
      if (parent.permanentFailure || parent.status === "failed") {
        return {
          kind: "fail" as const,
          message: `Depends on a ${parent.entity} record that failed to sync. Fix that one first.`,
        };
      }
      mustWait = true;
    }
    if (mustWait) return { kind: "wait" as const };

    return { kind: "ready" as const, url, data };
  }

  public async processQueue(): Promise<SyncResult> {
    const empty: SyncResult = { total: 0, synced: 0, failed: 0, remaining: 0, errors: [] };

    if (typeof window === "undefined") return empty;
    if (!navigator.onLine) return empty;
    if (this.isSyncing) return empty;

    this.isSyncing = true;
    void this.notifyStatus();

    const result: SyncResult = { total: 0, synced: 0, failed: 0, remaining: 0, errors: [] };

    try {
      // 1. Merge duplicate POSTs for the same temp record
      await this.mutateQueue((queue) => {
        const deduped: QueuedMutation[] = [];
        const tempIndexes = new Map<string, number>();
        for (const item of queue) {
          if (!item.tempId) {
            deduped.push(item);
            continue;
          }
          const previousIndex = tempIndexes.get(item.tempId);
          if (previousIndex === undefined) {
            tempIndexes.set(item.tempId, deduped.length);
            deduped.push(item);
          } else {
            const previous = deduped[previousIndex];
            deduped[previousIndex] = {
              ...previous,
              ...item,
              id: previous.id,
              clientMutationId: previous.clientMutationId,
              retryCount: Math.max(previous.retryCount, item.retryCount),
            };
          }
        }
        return deduped;
      });

      const initialQueue = await this.getQueue();
      result.total = initialQueue.filter((i) => !i.permanentFailure).length;

      if (initialQueue.length === 0) {
        this.lastSyncTime = Date.now();
        await offlineStore.setItem(this.lastSyncTimeKey, this.lastSyncTime);
        return result;
      }

      // Mark an item as failed for good (user must retry or delete it)
      const failForGood = async (
        item: QueuedMutation,
        message: string,
        status: number | undefined
      ) => {
        await this.patchItem(item.id, {
          status: "failed",
          permanentFailure: true,
          errorMessage: message,
          errorStatus: status,
          nextRetryTimestamp: undefined,
        });
        result.failed++;
        result.errors.push({ id: item.id, url: item.url, message, status });
        await this.safeRecordHistory({
          mutationId: item.id,
          clientMutationId: item.clientMutationId,
          entity: item.entity,
          operation: item.operation,
          recordId: item.recordId,
          method: item.method,
          url: item.url,
          status: "failed",
          errorMessage: message,
        });
      };

      const handled = new Set<string>(); // each item is tried once per run

      // 2. Process one item at a time, ALWAYS reading the newest queue first
      while (navigator.onLine) {
        const queue = await this.getQueue();
        const item = queue.find(
          (i) => !handled.has(i.id) && !i.permanentFailure && i.status !== "failed"
        );
        if (!item) break;
        handled.add(item.id);

        // Waiting for backoff
        if (item.nextRetryTimestamp && Date.now() < item.nextRetryTimestamp) continue;

        await this.patchItem(item.id, { status: "syncing" });

        const prepared = await this.prepareRequest(item, queue);
        if (prepared.kind === "wait") {
          await this.patchItem(item.id, { status: "pending" });
          continue;
        }
        if (prepared.kind === "fail") {
          await failForGood(item, prepared.message, undefined);
          continue;
        }

        // 2a. The request itself (only this part decides "success" or "error")
        let response: AxiosResponse;
        let stopSync = false;
        try {
          response = await syncAxiosInstance({
            url: prepared.url,
            method: item.method,
            data: prepared.data,
            headers: { "X-Client-Mutation-Id": item.clientMutationId },
          });
        } catch (error: any) {
          const status: number | undefined = error.response?.status;
          const message: string =
            error.response?.data?.message || error.message || "Network error during synchronization";

          if (status === 409) {
            const conflictId = this.extractRealId(error.response?.data?.data || error.response?.data);
            if (item.method === "post" && item.tempId && conflictId !== undefined) {
              // Record already exists on the server: link our temp id to it
              result.synced++;
              try {
                await this.reconcileTempId(item.tempId, conflictId, item.resourceUrl || item.url);
              } catch (e) {
                console.error("Reconcile after conflict failed:", e);
              }
              await this.patchItem(item.id, null);
              await this.safeRecordHistory({
                mutationId: item.id,
                clientMutationId: item.clientMutationId,
                entity: item.entity,
                operation: item.operation,
                recordId: item.recordId,
                method: item.method,
                url: prepared.url,
                realId: conflictId,
                status: "success",
              });
              window.dispatchEvent(
                new CustomEvent("offline-sync-conflict", {
                  detail: { entity: item.entity, tempId: item.tempId, realId: conflictId },
                })
              );
            } else {
              await failForGood(item, message, status);
            }
          } else if (status === 401) {
            // Token expired. Keep everything and stop. Syncing continues after login.
            await this.patchItem(item.id, {
              status: "pending",
              errorMessage: "Session expired. Log in again to continue syncing.",
              errorStatus: 401,
            });
            result.errors.push({ id: item.id, url: prepared.url, message, status });
            stopSync = true;
          } else if (!status) {
            // No response at all: network or server is down. Try again later.
            await this.patchItem(item.id, { status: "pending", errorMessage: message });
            stopSync = true;
          } else if (status === 408 || status === 429 || status >= 500) {
            const retryCount = (item.retryCount || 0) + 1;
            if (retryCount >= item.maxRetries) {
              await failForGood(item, message, status);
            } else {
              const backoffSeconds = Math.min(60, Math.pow(2, retryCount) * 2);
              await this.patchItem(item.id, {
                status: "pending",
                retryCount,
                errorMessage: message,
                errorStatus: status,
                nextRetryTimestamp: Date.now() + backoffSeconds * 1000,
              });
              result.failed++;
              result.errors.push({ id: item.id, url: prepared.url, message, status });
            }
          } else {
            // Other 4xx: the server rejected the data, retrying will not help
            await failForGood(item, message, status);
          }

          if (stopSync) break;
          continue;
        }

        // 2b. Success handling. An error here must NEVER cause the POST to be sent again.
        const responseData = response.data?.data || response.data;
        const realId = this.extractRealId(responseData);

        if (item.method === "post" && item.tempId) {
          if (realId === undefined) {
            await failForGood(
              item,
              "Sync succeeded but the server returned no real record ID.",
              response.status
            );
            continue;
          }
          try {
            await this.reconcileTempId(item.tempId, realId, item.resourceUrl || item.url);
          } catch (e) {
            console.error("Reconcile after sync failed:", e);
          }
        }

        result.synced++;
        await this.patchItem(item.id, null); // synced, remove from queue
        await this.safeRecordHistory({
          mutationId: item.id,
          clientMutationId: item.clientMutationId,
          entity: item.entity,
          operation: item.operation,
          recordId: item.recordId,
          method: item.method,
          url: prepared.url,
          realId,
          status: "success",
        });
      }

      const finalQueue = await this.getQueue();
      result.remaining = finalQueue.length;
      this.lastSyncTime = Date.now();
      await offlineStore.setItem(this.lastSyncTimeKey, this.lastSyncTime);

      return result;
    } finally {
      this.isSyncing = false;
      void this.notifyStatus();
    }
  }

  private extractRealId(value: unknown): string | number | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    const directId = record.id ?? record._id ?? record.realId ?? record.recordId;
    if (typeof directId === "string" || typeof directId === "number") return directId;
    for (const key of ["data", "record", "existing", "existingRecord"]) {
      const nested = this.extractRealId(record[key]);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }

  // ==========================================
  // MANAGEMENT ACTIONS
  // ==========================================

  /** Manual retry gives the item a fresh set of attempts. */
  public async retryQueueItem(queueId: string): Promise<void> {
    await this.patchItem(queueId, {
      status: "pending",
      permanentFailure: false,
      retryCount: 0,
      errorMessage: undefined,
      errorStatus: undefined,
      nextRetryTimestamp: undefined,
    });
    void this.processQueue();
  }

  public async retryAllFailed(): Promise<void> {
    await this.mutateQueue((queue) =>
      queue.map((item) =>
        item.permanentFailure || item.status === "failed"
          ? {
            ...item,
            status: "pending" as const,
            permanentFailure: false,
            retryCount: 0,
            errorMessage: undefined,
            errorStatus: undefined,
            nextRetryTimestamp: undefined,
          }
          : item
      )
    );
    void this.processQueue();
  }

  public async removeQueueItem(queueId: string): Promise<void> {
    await this.patchItem(queueId, null);
  }

  public async clearQueue(): Promise<void> {
    await this.mutateQueue(() => []);
  }
}

export const offlineSyncService = new OfflineSyncService();