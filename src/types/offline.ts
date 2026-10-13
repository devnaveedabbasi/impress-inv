export type MutationMethod = "post" | "put" | "patch" | "delete";

export type OperationType = "create" | "update" | "delete";

export type QueueItemStatus = "pending" | "syncing" | "failed" | "completed";

export interface QueuedMutation {
  id: string; // Unique client mutation ID (e.g., "mutation-171...")
  clientMutationId: string; // Idempotency key sent to server headers (e.g., "idemp-...")
  entity: string; // Entity name/type (e.g. "Category", "City", "Vendor")
  operation: OperationType; // "create" | "update" | "delete"
  recordId: string | number; // "temp-171..." or real numeric ID
  tempId?: string; // Client temporary ID if this was created offline
  method: MutationMethod;
  url: string;
  resourceUrl?: string;
  data?: any;
  headers?: Record<string, string>;
  timestamp: number;
  status: QueueItemStatus;
  retryCount: number;
  maxRetries: number;
  nextRetryTimestamp?: number;
  errorMessage?: string;
  errorStatus?: number;
  permanentFailure?: boolean; // True for 4xx validation or unique conflicts (e.g. 409 duplicate name)
}

export interface SyncHistoryItem {
  id: string;
  mutationId: string;
  clientMutationId: string;
  entity: string;
  operation: OperationType;
  recordId: string | number;
  method: MutationMethod;
  url: string;
  syncedAt: number;
  realId?: string | number;
  status: "success" | "failed";
  errorMessage?: string;
}

export interface SyncEngineStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: number | null;
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  totalQueueCount: number;
}

export interface SyncResult {
  total: number;
  synced: number;
  failed: number;
  remaining: number;
  errors: { id: string; url: string; message: string; status?: number }[];
}
