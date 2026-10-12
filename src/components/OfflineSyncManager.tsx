"use client";

import { useEffect, useState } from "react";
import { offlineSyncService } from "@/lib/offlineSyncService";
import type { QueuedMutation, SyncResult, SyncEngineStatus } from "@/types/offline";
import toast from "react-hot-toast";

export function OfflineSyncManager() {
  const [queue, setQueue] = useState<QueuedMutation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Subscribe to queue changes
    const unsubQueue = offlineSyncService.subscribeQueue((q) => {
      setQueue(q);
    });

    // Subscribe to sync state changes
    const unsubStatus = offlineSyncService.subscribeStatus((status: SyncEngineStatus) => {
      setIsSyncing(status.isSyncing);
    });

    // Handle online event
    const handleOnline = async () => {
      toast.success("Network restored! Checking offline queue...", { id: "network-status", duration: 3000 });
      const currentQueue = await offlineSyncService.getQueue();
      if (currentQueue.length > 0) {
        const toastId = "syncing-offline-actions";
        toast.loading(`Syncing ${currentQueue.length} offline action(s)...`, { id: toastId });
        const result: SyncResult = await offlineSyncService.processQueue();
        toast.dismiss(toastId);

        if (result.synced > 0) {
          toast.success(`${result.synced} offline item(s) synced successfully!`, { id: "sync-success", duration: 4000 });
        }

        if (result.failed > 0) {
          const firstError = result.errors[0]?.message || "Sync encountered errors";
          toast.error(`${result.failed} item(s) failed to sync: ${firstError}`, { id: "sync-error", duration: 5000 });
        }
      }
    };

    const handleOffline = () => {
      toast("You are currently offline. Actions will be queued locally.", {
        icon: "📡",
        id: "network-status",
        duration: 4000,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check when component mounts
    if (navigator.onLine) {
      void offlineSyncService.getQueue().then(async (q) => {
        if (q.length > 0) {
          await offlineSyncService.processQueue();
        }
      });
    }

    return () => {
      unsubQueue();
      unsubStatus();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const pendingCount = queue.filter((i) => !i.permanentFailure).length;
  const failedCount = queue.filter((i) => i.permanentFailure).length;

  if (queue.length === 0) {
    return null;
  }

  // Collapsed docked toggle pill on the bottom-right
  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/95 px-3.5 py-2 text-xs font-medium text-white shadow-xl backdrop-blur transition-all duration-200 hover:scale-105 hover:bg-zinc-800"
        title="Open Offline Queue"
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isSyncing ? "bg-amber-400 animate-ping" : failedCount > 0 ? "bg-red-400" : "bg-emerald-400"
          }`}
        />
        <span>Offline Queue ({queue.length})</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="bg-zinc-900/95 text-white backdrop-blur border border-zinc-700 shadow-2xl rounded-xl p-3 text-xs flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isSyncing ? "bg-amber-400 animate-ping" : failedCount > 0 ? "bg-red-400" : "bg-emerald-400"
              }`}
            />
            <span className="font-semibold text-zinc-100">
              Offline Queue ({queue.length})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {navigator.onLine && !isSyncing && (
              <button
                onClick={() => void offlineSyncService.processQueue()}
                className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-200 transition font-medium"
              >
                Sync Now
              </button>
            )}

            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition"
              title="Minimize to toggle button"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="text-zinc-400 flex flex-col gap-1">
          {pendingCount > 0 && (
            <div>• {pendingCount} mutation(s) pending sync</div>
          )}
          {failedCount > 0 && (
            <div className="text-red-400 font-medium">
              • {failedCount} conflict/failed item(s) preserved
            </div>
          )}
        </div>

        {failedCount > 0 && (
          <div className="max-h-32 overflow-y-auto space-y-1 mt-1 border-t border-zinc-800 pt-1">
            {queue
              .filter((i) => i.permanentFailure)
              .map((item) => (
                <div
                  key={item.id}
                  className="bg-red-950/40 border border-red-900/60 p-1.5 rounded flex items-center justify-between gap-2"
                >
                  <div className="truncate flex-1">
                    <span className="uppercase font-bold text-[10px] text-red-300">
                      {item.method}
                    </span>{" "}
                    <span className="text-zinc-300">{item.url}</span>
                    <div className="text-red-400 text-[10px] truncate">
                      {item.errorMessage}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => void offlineSyncService.retryQueueItem(item.id)}
                      className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] text-zinc-200"
                      title="Retry"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => void offlineSyncService.removeQueueItem(item.id)}
                      className="px-1.5 py-0.5 bg-red-900 hover:bg-red-800 rounded text-[10px] text-zinc-200"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        <div className="border-t border-zinc-800 pt-1.5 text-center">
          <a
            href="/offline-sync"
            className="text-[11px] text-primary-400 hover:text-primary-300 font-medium"
          >
            Open Full Sync Dashboard →
          </a>
        </div>
      </div>
    </div>
  );
}
