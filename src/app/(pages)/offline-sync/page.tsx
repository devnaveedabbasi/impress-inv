"use client";

import { useState } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";
import type { QueuedMutation, SyncHistoryItem } from "@/types/offline";

export default function OfflineSyncDashboardPage() {
  const {
    queue,
    history,
    status,
    triggerSync,
    retryItem,
    retryAll,
    removeItem,
    clearSuccessHistory,
  } = useOfflineSync();

  const [activeTab, setActiveTab] = useState<"queue" | "history">("queue");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const handleManualSync = async () => {
    if (!status.isOnline) {
      toast.error("Device is offline. Cannot trigger synchronization.");
      return;
    }
    const toastId = toast.loading("Processing offline queue...");
    const res = await triggerSync();
    toast.dismiss(toastId);
    if (res.synced > 0) {
      toast.success(`${res.synced} action(s) synced successfully!`);
    }
    if (res.failed > 0) {
      toast.error(`${res.failed} action(s) failed to sync.`);
    }
    if (res.total === 0) {
      toast("Queue is currently empty.", { icon: "ℹ️" });
    }
  };

  // Distinct entities for dropdown filter
  const allEntities = Array.from(
    new Set([
      ...queue.map((q) => q.entity),
      ...history.map((h) => h.entity),
    ])
  ).filter(Boolean);

  // Filtered queue items
  const filteredQueue = queue.filter((item: QueuedMutation) => {
    if (statusFilter !== "all") {
      if (statusFilter === "failed" && !item.permanentFailure && item.status !== "failed") {
        return false;
      }
      if (statusFilter === "pending" && (item.permanentFailure || item.status !== "pending")) {
        return false;
      }
      if (statusFilter === "syncing" && item.status !== "syncing") {
        return false;
      }
    }
    if (entityFilter !== "all" && item.entity !== entityFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchUrl = item.url.toLowerCase().includes(q);
      const matchEntity = item.entity.toLowerCase().includes(q);
      const matchId = String(item.recordId).toLowerCase().includes(q);
      const matchError = (item.errorMessage || "").toLowerCase().includes(q);
      return matchUrl || matchEntity || matchId || matchError;
    }
    return true;
  });

  // Filtered history items
  const filteredHistory = history.filter((item: SyncHistoryItem) => {
    if (statusFilter !== "all" && item.status !== statusFilter) {
      return false;
    }
    if (entityFilter !== "all" && item.entity !== entityFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchUrl = item.url.toLowerCase().includes(q);
      const matchEntity = item.entity.toLowerCase().includes(q);
      const matchId = String(item.recordId).toLowerCase().includes(q);
      const matchRealId = String(item.realId || "").toLowerCase().includes(q);
      return matchUrl || matchEntity || matchId || matchRealId;
    }
    return true;
  });

  return (
    <div className="w-full max-w-5xl space-y-6">
      {/* Header & Overview */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-zinc-900">Offline Sync Dashboard</h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.isOnline
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
                  }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${status.isOnline ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                />
                {status.isOnline ? "Online" : "Offline"}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Manage queued client mutations, track synchronization history, and resolve conflicts.
            </p>
          </div>

          <div className="flex flex-nowrap items-center gap-3">
            <Button
              variant="secondary"
              shape="rounded"
              disabled={status.isSyncing || !status.isOnline}
              onClick={handleManualSync}
              className="border border-zinc-300 bg-white hover:bg-zinc-50 text-xs px-4"
            >
              <Icon
                icon="mdi:sync"
                className={`mr-1.5 h-4 w-4 ${status.isSyncing ? "animate-spin" : ""}`}
              />
              {status.isSyncing ? "Syncing..." : "Sync Now"}
            </Button>

            {status.failedCount > 0 && (
              <Button
                variant="secondary"
                shape="rounded"
                disabled={status.isSyncing || !status.isOnline}
                onClick={() => void retryAll()}
                className="border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-xs px-4"
              >
                <Icon icon="mdi:refresh" className="mr-1.5 h-4 w-4" />
                Retry All Failures ({status.failedCount})
              </Button>
            )}
          </div>
        </div>

        {/* Status Metrics Cards */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
            <div className="text-xs font-medium text-zinc-500">Pending Operations</div>
            <div className="mt-1 text-2xl font-bold text-zinc-800">{status.pendingCount}</div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
            <div className="text-xs font-medium text-zinc-500">Currently Syncing</div>
            <div className="mt-1 text-2xl font-bold text-amber-600">{status.syncingCount}</div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
            <div className="text-xs font-medium text-zinc-500">Failed / Conflicts</div>
            <div className="mt-1 text-2xl font-bold text-rose-600">{status.failedCount}</div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
            <div className="text-xs font-medium text-zinc-500">Last Synced</div>
            <div className="mt-1 text-sm font-semibold text-zinc-700">
              {status.lastSyncTime
                ? new Date(status.lastSyncTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
                : "Never"}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs and Controls */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-zinc-200 px-6 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex gap-6">
            <button
              onClick={() => {
                setActiveTab("queue");
                setStatusFilter("all");
              }}
              className={`pb-3 text-sm font-semibold border-b-2 transition ${activeTab === "queue"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
            >
              Active Queue ({queue.length})
            </button>
            <button
              onClick={() => {
                setActiveTab("history");
                setStatusFilter("all");
              }}
              className={`pb-3 text-sm font-semibold border-b-2 transition ${activeTab === "history"
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
            >
              Sync History ({history.length})
            </button>
          </div>

          {activeTab === "history" && history.length > 0 && (
            <button
              onClick={() => void clearSuccessHistory()}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 pb-3"
            >
              Clear Successful History
            </button>
          )}
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 bg-zinc-50/70 border-b border-zinc-200 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="search"
              placeholder="Search by URL, ID, Entity, or Error..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 outline-none focus:border-primary-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 outline-none"
            >
              <option value="all">All</option>
              {activeTab === "queue" ? (
                <>
                  <option value="pending">Pending</option>
                  <option value="syncing">Syncing</option>
                  <option value="failed">Failed / Conflict</option>
                </>
              ) : (
                <>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </>
              )}
            </select>
          </div>

          {allEntities.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500">Entity:</label>
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 outline-none"
              >
                <option value="all">All Entities</option>
                {allEntities.map((ent) => (
                  <option key={ent} value={ent}>
                    {ent}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          {activeTab === "queue" ? (
            filteredQueue.length === 0 ? (
              <div className="p-12 text-center text-sm text-zinc-500">
                <Icon icon="mdi:check-circle-outline" className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                No active mutations in queue. All offline changes are synced!
              </div>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-zinc-100 text-zinc-700 font-semibold border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Operation</th>
                    <th className="px-4 py-3">Record ID</th>
                    <th className="px-4 py-3">URL</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Queued At</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {filteredQueue.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-semibold text-zinc-900">{item.entity}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${item.operation === "create"
                            ? "bg-blue-100 text-blue-800"
                            : item.operation === "update"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
                            }`}
                        >
                          {item.operation}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-700">
                        {String(item.recordId)}
                        {item.tempId && (
                          <span className="ml-1 text-[10px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded">
                            (temp)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 font-mono text-[11px] truncate max-w-[180px]">
                        {item.url}
                      </td>
                      <td className="px-4 py-3">
                        {item.status === "syncing" ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                            <Icon icon="mdi:loading" className="h-3 w-3 animate-spin" />
                            Syncing
                          </span>
                        ) : item.permanentFailure || item.status === "failed" ? (
                          <div>
                            <span className="inline-block rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                              Failed ({item.errorStatus || "Err"})
                            </span>
                            {item.errorMessage && (
                              <div className="text-[10px] text-rose-600 max-w-xs truncate mt-0.5">
                                {item.errorMessage}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-block rounded bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{item.retryCount}</td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                        {new Date(item.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(item.permanentFailure || item.status === "failed") &&
                            item.retryCount < item.maxRetries && (
                            <button
                              onClick={() => void retryItem(item.id)}
                              className="rounded bg-zinc-100 px-2 py-1 text-zinc-700 hover:bg-zinc-200 font-medium"
                              title="Retry operation"
                            >
                              Retry
                            </button>
                          )}
                          <button
                            onClick={() => void removeItem(item.id)}
                            className="rounded bg-rose-50 px-2 py-1 text-rose-700 hover:bg-rose-100 font-medium"
                            title="Dismiss from queue"
                          >
                            Dismiss
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : filteredHistory.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500">
              No sync history records match the filter.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-zinc-100 text-zinc-700 font-semibold border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Operation</th>
                  <th className="px-4 py-3">Original ID</th>
                  <th className="px-4 py-3">Synced Real ID</th>
                  <th className="px-4 py-3">URL</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Synced At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredHistory.map((h) => (
                  <tr key={h.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-semibold text-zinc-900">{h.entity}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${h.operation === "create"
                          ? "bg-blue-100 text-blue-800"
                          : h.operation === "update"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                          }`}
                      >
                        {h.operation}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-600">{String(h.recordId)}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                      {h.realId ? String(h.realId) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-zinc-500 truncate max-w-[200px]">
                      {h.url}
                    </td>
                    <td className="px-4 py-3">
                      {h.status === "success" ? (
                        <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          Synced
                        </span>
                      ) : (
                        <span className="inline-block rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                      {new Date(h.syncedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
