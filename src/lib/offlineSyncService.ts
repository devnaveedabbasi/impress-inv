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

  constructor() {
    if (typeof window !== "undefined") {
      void this.initService();
    }
  }

  private async initService() {
    try {
      const storedTime = await offlineStore.getItem<number>(this.lastSyncTimeKey);
      if (storedTime) this.lastSyncTime = storedTime;
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
  // QUEUE & HISTORY PERSISTENCE
  // ==========================================

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

  public async saveQueue(queue: QueuedMutation[]): Promise<void> {
    if (typeof window === "undefined") return;
    await offlineStore.setItem(this.queueKey, queue);
    this.notifyQueue(queue);
  }

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

  public async recordHistoryItem(item: Omit<SyncHistoryItem, "id" | "syncedAt">): Promise<void> {
    const history = await this.getHistory();
    const newItem: SyncHistoryItem = {
      ...item,
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      syncedAt: Date.now(),
    };
    // Keep most recent 100 history items
    const updated = [newItem, ...history].slice(0, 100);
    await this.saveHistory(updated);
  }

  /**
   * Cleans successful history older than retentionDays (default: 7 days)
   */
  public async cleanExpiredHistory(retentionDays = 7): Promise<void> {
    const history = await this.getHistory();
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    // Keep all failed history or successful history newer than cutoff
    const filtered = history.filter((h) => h.status === "failed" || h.syncedAt >= cutoff);
    if (filtered.length !== history.length) {
      await this.saveHistory(filtered);
    }
  }

  public async clearSuccessHistory(): Promise<void> {
    const history = await this.getHistory();
    const filtered = history.filter((h) => h.status === "failed");
    await this.saveHistory(filtered);
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
    const uuid = typeof globalThis.crypto?.randomUUID === "function"
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

  public getCacheKeyForUrl(url: string): string {
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;
    return `get_cache_${cleanUrl}`;
  }

  public async cacheGetResponse(url: string, data: any): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const cacheKey = this.getCacheKeyForUrl(url);
      await offlineStore.setItem(cacheKey, {
        data,
        cachedAt: Date.now(),
      });
    } catch (e) {
      console.warn("Failed to cache GET response:", e);
    }
  }

  public async getCachedResponse(url: string): Promise<any | null> {
    if (typeof window === "undefined") return null;
    try {
      const cacheKey = this.getCacheKeyForUrl(url);
      const cached = await offlineStore.getItem<{ data: any; cachedAt: number }>(cacheKey);
      return cached ? cached.data : null;
    } catch (e) {
      console.warn("Failed to get cached response:", e);
      return null;
    }
  }

  // ==========================================
  // ENTITY & OPERATION INFERENCE
  // ==========================================

  public parseUrlMetadata(url: string, method: string) {
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;
    const parts = cleanUrl.split("/").filter(Boolean);

    // Filter out common API prefixes like 'api'
    const meaningfulParts = parts.filter((p) => p !== "api");
    const entitySlug = meaningfulParts[0] || "resource";

    // Singularize or capitalize
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
      } catch (e) {
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

    const clientMutationId = this.generateClientMutationId();

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
        rawMethod === "post"
          ? rawUrl
          : rawUrl.split("/").slice(0, -1).join("/") || rawUrl,
      data: parsedData,
      headers: (config.headers as Record<string, string>) || {},
      timestamp: Date.now(),
      status: "pending",
      retryCount: 0,
      maxRetries: 5,
    };

    const queue = await this.getQueue();
    const existingIndex =
      tempId ? queue.findIndex((item) => item.tempId === tempId) : -1;
    if (existingIndex >= 0) {
      const existing = queue[existingIndex];
      queue[existingIndex] = {
        ...existing,
        ...mutationItem,
        id: existing.id,
        clientMutationId: existing.clientMutationId,
        retryCount: existing.retryCount,
        status: existing.status === "syncing" ? "syncing" : "pending",
        permanentFailure: false,
      };
    } else {
      queue.push(mutationItem);
    }
    await this.saveQueue(queue);

    // Apply optimistic update to local cache
    const queuedItem = existingIndex >= 0 ? queue[existingIndex] : mutationItem;
    const simulatedRecord = await this.applyOptimisticUpdate(queuedItem);

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

  public async applyOptimisticUpdate(mutation: QueuedMutation): Promise<any> {
    const { method, url, data, tempId } = mutation;
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;

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

        if (cachedWrapper && cachedWrapper.data) {
          const list = Array.isArray(cachedWrapper.data)
            ? cachedWrapper.data
            : Array.isArray(cachedWrapper.data.data)
            ? cachedWrapper.data.data
            : null;

          if (list) {
            const existingIndex = list.findIndex(
              (item: Record<string, unknown>) =>
                String(item.id) === String(tempId) ||
                String(item.tempId) === String(tempId)
            );
            if (existingIndex >= 0) {
              list[existingIndex] = { ...list[existingIndex], ...newRecord };
            } else {
              list.push(newRecord);
            }
            await offlineStore.setItem(listCacheKey, cachedWrapper);
          }
        }

        // Cache single record as well
        if (tempId) {
          const singleUrl = `${cleanUrl}/${tempId}`;
          await this.cacheGetResponse(singleUrl, {
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

        if (cachedWrapper && cachedWrapper.data) {
          const list = Array.isArray(cachedWrapper.data)
            ? cachedWrapper.data
            : Array.isArray(cachedWrapper.data.data)
            ? cachedWrapper.data.data
            : null;

          if (list) {
            const index = list.findIndex(
              (item: any) => String(item.id) === String(targetId) || String(item.tempId) === String(targetId)
            );
            if (index !== -1) {
              list[index] = {
                ...list[index],
                ...(data || {}),
                updatedAt: new Date().toISOString(),
              };
              updatedRecord = list[index];
              await offlineStore.setItem(listCacheKey, cachedWrapper);
            }
          }
        }

        const singleUrl = cleanUrl;
        const singleCached = await this.getCachedResponse(singleUrl);
        if (singleCached) {
          const target = singleCached.data ? singleCached.data : singleCached;
          const merged = { ...target, ...(data || {}), updatedAt: new Date().toISOString() };
          await this.cacheGetResponse(singleUrl, {
            success: true,
            data: merged,
            message: "Updated offline",
          });
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

        if (cachedWrapper && cachedWrapper.data) {
          const list = Array.isArray(cachedWrapper.data)
            ? cachedWrapper.data
            : Array.isArray(cachedWrapper.data.data)
            ? cachedWrapper.data.data
            : null;

          if (list) {
            const filtered = list.filter(
              (item: any) => String(item.id) !== String(targetId) && String(item.tempId) !== String(targetId)
            );
            if (Array.isArray(cachedWrapper.data)) {
              cachedWrapper.data = filtered;
            } else if (cachedWrapper.data.data) {
              cachedWrapper.data.data = filtered;
            }
            await offlineStore.setItem(listCacheKey, cachedWrapper);
          }
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
  // SUGGESTED NEXT ID CALCULATION
  // ==========================================

  /**
   * Calculates the latest suggested next ID by checking both cached records
   * AND pending queued POST mutations for the given resource URL.
   */
  public async getSuggestedNextId(resourceUrl: string): Promise<string> {
    const cleanUrl = resourceUrl.startsWith("/") ? resourceUrl : `/${resourceUrl}`;
    let maxId = 0;

    // 1. Inspect cached list
    const listCache = await this.getCachedResponse(cleanUrl);
    const list = Array.isArray(listCache?.data)
      ? listCache.data
      : Array.isArray(listCache)
      ? listCache
      : [];

    for (const item of list) {
      const num = Number(item.id);
      if (!isNaN(num) && num > maxId) {
        maxId = num;
      }
    }

    // 2. Count pending POST creations in queue for this resource
    const queue = await this.getQueue();
    const pendingCreations = queue.filter(
      (item) =>
        item.method === "post" &&
        (item.url === cleanUrl ||
          item.url === resourceUrl ||
          item.url.replace(/^\//, "") === cleanUrl.replace(/^\//, ""))
    ).length;

    // The suggested next ID is maxId + 1 + any pending creations not yet having real database IDs
    const suggested = Math.max(1, maxId + 1 + pendingCreations);
    return String(suggested);
  }

  // ==========================================
  // ID RECONCILIATION
  // ==========================================

  public async reconcileTempId(tempId: string, realId: string | number, resourceUrl: string): Promise<void> {
    if (!tempId || !realId) return;

    // 1. Save to ID map
    const idMap = await this.getIdMap();
    idMap[tempId] = realId;
    await this.saveIdMap(idMap);

    // 2. Reconcile subsequent queue items (URLs and body payloads)
    const queue = await this.getQueue();
    let queueChanged = false;

    for (const item of queue) {
      if (item.url.includes(tempId)) {
        item.url = item.url.replace(tempId, String(realId));
        queueChanged = true;
      }
      if (String(item.recordId) === String(tempId)) {
        item.recordId = realId;
        queueChanged = true;
      }
      if (item.data && typeof item.data === "object") {
        const replaceInObj = (obj: any) => {
          for (const key of Object.keys(obj)) {
            if (String(obj[key]) === String(tempId)) {
              obj[key] = realId;
              queueChanged = true;
            } else if (typeof obj[key] === "object" && obj[key] !== null) {
              replaceInObj(obj[key]);
            }
          }
        };
        replaceInObj(item.data);
      }
    }

    if (queueChanged) {
      await this.saveQueue(queue);
    }

    // 3. Reconcile cached list and single record
    try {
      const cleanUrl = resourceUrl.startsWith("/") ? resourceUrl : `/${resourceUrl}`;
      const listCacheKey = this.getCacheKeyForUrl(cleanUrl);
      const cachedWrapper = await offlineStore.getItem<{ data: any }>(listCacheKey);

      let foundItem: any = null;

      if (cachedWrapper && cachedWrapper.data) {
        const list = Array.isArray(cachedWrapper.data)
          ? cachedWrapper.data
          : Array.isArray(cachedWrapper.data.data)
          ? cachedWrapper.data.data
          : null;

        if (list) {
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
      }

      if (foundItem) {
        const realSingleUrl = `${cleanUrl}/${realId}`;
        await this.cacheGetResponse(realSingleUrl, {
          success: true,
          data: foundItem,
          message: "Synced record retrieved",
        });

        const tempSingleUrl = `${cleanUrl}/${tempId}`;
        await offlineStore.removeItem(this.getCacheKeyForUrl(tempSingleUrl));
      }
    } catch (e) {
      console.error("Reconcile cache error:", e);
    }

    // 4. Dispatch browser event
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("offline-id-reconciled", {
          detail: { tempId, realId, resourceUrl },
        })
      );
    }
  }

  // ==========================================
  // SYNC PROCESSING ENGINE
  // ==========================================

  public async processQueue(): Promise<SyncResult> {
    if (typeof window === "undefined") {
      return { total: 0, synced: 0, failed: 0, remaining: 0, errors: [] };
    }

    if (!navigator.onLine) {
      return { total: 0, synced: 0, failed: 0, remaining: 0, errors: [] };
    }

    if (this.isSyncing) {
      return { total: 0, synced: 0, failed: 0, remaining: 0, errors: [] };
    }

    this.isSyncing = true;
    void this.notifyStatus();

    const result: SyncResult = {
      total: 0,
      synced: 0,
      failed: 0,
      remaining: 0,
      errors: [],
    };

    try {
      const queue = await this.getQueue();
      const dedupedQueue: QueuedMutation[] = [];
      const tempIndexes = new Map<string, number>();
      for (const item of queue) {
        if (!item.tempId) {
          dedupedQueue.push(item);
          continue;
        }
        const previousIndex = tempIndexes.get(item.tempId);
        if (previousIndex === undefined) {
          tempIndexes.set(item.tempId, dedupedQueue.length);
          dedupedQueue.push(item);
        } else {
          const previous = dedupedQueue[previousIndex];
          dedupedQueue[previousIndex] = {
            ...previous,
            ...item,
            id: previous.id,
            clientMutationId: previous.clientMutationId,
            retryCount: Math.max(previous.retryCount, item.retryCount),
          };
        }
      }
      if (dedupedQueue.length !== queue.length) {
        await this.saveQueue(dedupedQueue);
      }
      const queueToProcess = dedupedQueue;
      result.total = queueToProcess.length;

      if (queueToProcess.length === 0) {
        this.lastSyncTime = Date.now();
        await offlineStore.setItem(this.lastSyncTimeKey, this.lastSyncTime);
        return result;
      }

      const updatedQueue: QueuedMutation[] = [];

      for (let i = 0; i < queueToProcess.length; i++) {
        const item = queueToProcess[i];

        // Abort if network dropped mid-sync
        if (!navigator.onLine) {
          updatedQueue.push(...queueToProcess.slice(i));
          break;
        }

        // Skip items permanently failed (e.g. unique constraint 409) unless retried by user
        if (item.permanentFailure) {
          updatedQueue.push(item);
          result.remaining++;
          continue;
        }

        // Bounded exponential backoff check for transient errors
        if (item.nextRetryTimestamp && Date.now() < item.nextRetryTimestamp) {
          updatedQueue.push(item);
          result.remaining++;
          continue;
        }

        // Mark syncing in UI
        item.status = "syncing";
        await this.saveQueue([...updatedQueue, ...queueToProcess.slice(i)]);

        // Prepare request
        const idMap = await this.getIdMap();
        let targetUrl = item.url;
        let targetData = item.data;

        for (const [tId, rId] of Object.entries(idMap)) {
          if (targetUrl.includes(tId)) {
            targetUrl = targetUrl.replace(tId, String(rId));
          }
          if (targetData && typeof targetData === "object") {
            const replaceInObj = (obj: any) => {
              for (const k of Object.keys(obj)) {
                if (String(obj[k]) === String(tId)) {
                  obj[k] = rId;
                } else if (typeof obj[k] === "object" && obj[k] !== null) {
                  replaceInObj(obj[k]);
                }
              }
            };
            replaceInObj(targetData);
          }
        }

        // Clean client metadata
        if (targetData && typeof targetData === "object" && !Array.isArray(targetData)) {
          const sanitized = { ...targetData };
          delete sanitized.tempId;
          delete sanitized._offlinePending;
          delete sanitized._offline;
          targetData = sanitized;
        }

        try {
          const response = await syncAxiosInstance({
            url: targetUrl,
            method: item.method,
            data: targetData,
            headers: {
              ...(item.headers || {}),
              "X-Client-Mutation-Id": item.clientMutationId,
            },
          });

          // SUCCESS
          result.synced++;
          const responseData = response.data?.data || response.data;
          const realId = this.extractRealId(responseData);

          if (item.method === "post" && item.tempId) {
            if (realId === undefined) {
              item.status = "failed";
              item.permanentFailure = true;
              item.errorMessage = "Sync succeeded but the server returned no real record ID.";
              item.errorStatus = response.status;
              updatedQueue.push(item);
              result.failed++;
              result.errors.push({
                id: item.id,
                url: targetUrl,
                message: item.errorMessage,
                status: response.status,
              });
              continue;
            }
            await this.reconcileTempId(item.tempId, realId, item.resourceUrl || item.url);
          }

          // Record in sync history
          await this.recordHistoryItem({
            mutationId: item.id,
            clientMutationId: item.clientMutationId,
            entity: item.entity,
            operation: item.operation,
            recordId: item.recordId,
            method: item.method,
            url: targetUrl,
            realId,
            status: "success",
          });

          // Successfully synced item is omitted from updatedQueue
        } catch (error: any) {
          const status = error.response?.status;
          const errorMessage =
            error.response?.data?.message ||
            error.message ||
            "Network error during synchronization";

          item.retryCount = (item.retryCount || 0) + 1;
          item.errorMessage = errorMessage;
          item.errorStatus = status;

          if (status === 409) {
            const conflictData = error.response?.data?.data || error.response?.data;
            const conflictId = this.extractRealId(conflictData);
            if (item.method === "post" && item.tempId && conflictId) {
              result.synced++;
              await this.reconcileTempId(item.tempId, conflictId, item.resourceUrl || item.url);
              await this.recordHistoryItem({
                mutationId: item.id,
                clientMutationId: item.clientMutationId,
                entity: item.entity,
                operation: item.operation,
                recordId: item.recordId,
                method: item.method,
                url: targetUrl,
                realId: conflictId,
                status: "success",
              });
              continue;
            }

            item.status = "failed";
            item.permanentFailure = true;
            item.nextRetryTimestamp = undefined;
          } else if (status >= 400 && status < 500) {
            item.status = "failed";
            item.permanentFailure = true;
            item.nextRetryTimestamp = undefined;
          } else {
            item.status = "pending";
            const backoffSeconds = Math.min(60, Math.pow(2, item.retryCount) * 2);
            item.nextRetryTimestamp = Date.now() + backoffSeconds * 1000;
          }

          result.failed++;
          result.errors.push({
            id: item.id,
            url: targetUrl,
            message: errorMessage,
            status,
          });

          // Record history failure
          await this.recordHistoryItem({
            mutationId: item.id,
            clientMutationId: item.clientMutationId,
            entity: item.entity,
            operation: item.operation,
            recordId: item.recordId,
            method: item.method,
            url: targetUrl,
            status: "failed",
            errorMessage,
          });

          // ALWAYS preserve failed item in queue!
          updatedQueue.push(item);
        }

      }

      result.remaining = updatedQueue.length;
      this.lastSyncTime = Date.now();
      await offlineStore.setItem(this.lastSyncTimeKey, this.lastSyncTime);
      await this.saveQueue(updatedQueue);

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

  public async retryQueueItem(queueId: string): Promise<void> {
    const queue = await this.getQueue();
    const item = queue.find((i) => i.id === queueId);
    if (item && item.retryCount < item.maxRetries) {
      item.status = "pending";
      item.permanentFailure = false;
      item.retryCount = 0;
      item.errorMessage = undefined;
      item.nextRetryTimestamp = undefined;
      await this.saveQueue(queue);
      void this.processQueue();
    }
  }

  public async retryAllFailed(): Promise<void> {
    const queue = await this.getQueue();
    let updated = false;
    for (const item of queue) {
      if (
        (item.permanentFailure || item.status === "failed") &&
        item.retryCount < item.maxRetries
      ) {
        item.status = "pending";
        item.permanentFailure = false;
        item.errorMessage = undefined;
        item.nextRetryTimestamp = undefined;
        updated = true;
      }
    }
    if (updated) {
      await this.saveQueue(queue);
      void this.processQueue();
    }
  }

  public async removeQueueItem(queueId: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter((item) => item.id !== queueId);
    await this.saveQueue(filtered);
  }

  public async clearQueue(): Promise<void> {
    await this.saveQueue([]);
  }
}

export const offlineSyncService = new OfflineSyncService();
