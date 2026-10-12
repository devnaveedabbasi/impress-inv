"use client";

import { useEffect, useState, useCallback } from "react";
import { offlineSyncService } from "@/lib/offlineSyncService";
import type {
  QueuedMutation,
  SyncHistoryItem,
  SyncEngineStatus,
  SyncResult,
} from "@/types/offline";

export function useOfflineSync() {
  const [queue, setQueue] = useState<QueuedMutation[]>([]);
  const [history, setHistory] = useState<SyncHistoryItem[]>([]);
  const [status, setStatus] = useState<SyncEngineStatus>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isSyncing: false,
    lastSyncTime: null,
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    totalQueueCount: 0,
  });

  useEffect(() => {
    const unsubQueue = offlineSyncService.subscribeQueue((q) => setQueue(q));
    const unsubStatus = offlineSyncService.subscribeStatus((s) => setStatus(s));
    const unsubHistory = offlineSyncService.subscribeHistory((h) => setHistory(h));

    const handleOnline = () => {
      void offlineSyncService.processQueue();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      unsubQueue();
      unsubStatus();
      unsubHistory();
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const triggerSync = useCallback(async (): Promise<SyncResult> => {
    return await offlineSyncService.processQueue();
  }, []);

  const retryItem = useCallback(async (queueId: string) => {
    await offlineSyncService.retryQueueItem(queueId);
  }, []);

  const retryAll = useCallback(async () => {
    await offlineSyncService.retryAllFailed();
  }, []);

  const removeItem = useCallback(async (queueId: string) => {
    await offlineSyncService.removeQueueItem(queueId);
  }, []);

  const clearSuccessHistory = useCallback(async () => {
    await offlineSyncService.clearSuccessHistory();
  }, []);

  const getSuggestedNextId = useCallback(async (resourceUrl: string) => {
    return await offlineSyncService.getSuggestedNextId(resourceUrl);
  }, []);

  return {
    queue,
    history,
    status,
    triggerSync,
    retryItem,
    retryAll,
    removeItem,
    clearSuccessHistory,
    getSuggestedNextId,
  };
}
