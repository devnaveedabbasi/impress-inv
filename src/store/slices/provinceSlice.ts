import { createAsyncThunk, createEntityAdapter, createSlice, type EntityState, type PayloadAction } from "@reduxjs/toolkit";
import api from "@/lib/axios";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { PROVINCES } from "@/utlis/apiRoutes";
import { isOffline } from "@/store/utils/network";
import { generateTempId, isTempId } from "@/store/utils/tempId";

export type ProvinceRecord = {
  id: string | number;
  name: string;
  _offlinePending?: boolean;
  tempId?: string;
};

export type ProvinceAsyncStatus = "idle" | "loading" | "succeeded" | "failed";
export type ProvincePageRequest = { page: number; limit: number };
export type ProvincePagination = { page: number; limit: number; total: number; totalPages: number };

interface ProvinceState extends EntityState<ProvinceRecord, string | number> {
  apiStatus: ProvinceAsyncStatus;
  apiError: string | null;
  nextId: string;
  currentRecord: ProvinceRecord | null;
  isNewMode: boolean;
  isEditing: boolean;
  isIdLoading: boolean;
  isLookingUp: boolean;
  pendingOptions: Array<{ label: string; value: string; _offlinePending?: boolean }>;
  listStatus: ProvinceAsyncStatus;
  listError: string | null;
  pagination: ProvincePagination;
  isSubmitting: boolean;
  offlineQueueVersion: number;
}

const provinceAdapter = createEntityAdapter<ProvinceRecord, string | number>({
  selectId: (record: ProvinceRecord) => String(record.id),
});

const initialState: ProvinceState = provinceAdapter.getInitialState({
  apiStatus: "idle",
  apiError: null,
  nextId: "",
  currentRecord: null,
  isNewMode: true,
  isEditing: true,
  isIdLoading: false,
  isLookingUp: false,
  pendingOptions: [],
  listStatus: "idle",
  listError: null,
  pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
  isSubmitting: false,
  offlineQueueVersion: 0,
});

const toProvinceRecord = (value: any): ProvinceRecord => ({
  id: value?.id ?? value?.tempId ?? generateTempId("prov"),
  name: String(value?.name ?? ""),
  _offlinePending: Boolean(value?._offlinePending),
  tempId: value?.tempId ?? undefined,
});

export const fetchProvinceNextId = createAsyncThunk<{ nextId: string; isTemp: boolean }, void, { rejectValue: string }>(
  "province/fetchNextId",
  async (_, { rejectWithValue }) => {
    if (isOffline()) {
      return { nextId: generateTempId("prov"), isTemp: true };
    }

    try {
      const response = await api.get<{ data: { nextId: string | number } }>(`${PROVINCES}/next-id`, {
        params: { _t: Date.now() },
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      return { nextId: String(response.data.data.nextId), isTemp: false };
    } catch {
      return { nextId: generateTempId("prov"), isTemp: true };
    }
  }
);

export const fetchAllProvinces = createAsyncThunk<{ rows: ProvinceRecord[]; pagination: ProvincePagination }, ProvincePageRequest, { rejectValue: string }>(
  "province/fetchAll",
  async ({ page, limit }, { rejectWithValue }) => {
    if (isOffline()) {
      const cached = await offlineSyncService.getCachedResponse(PROVINCES);
      if (!cached) return rejectWithValue("Offline: no cached data");
      const rawRows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
      const rows = rawRows.map(toProvinceRecord);
      return { rows, pagination: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) } };
    }
    try {
      const response = await api.get<{ data: ProvinceRecord[]; meta?: Partial<ProvincePagination> }>(PROVINCES, { params: { page, limit } });
      const rows = Array.isArray(response.data?.data) ? response.data.data.map(toProvinceRecord) : [];
      const meta = response.data.meta ?? {};
      return { rows, pagination: { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total ?? rows.length, totalPages: meta.totalPages ?? Math.max(1, Math.ceil((meta.total ?? rows.length) / (meta.limit ?? limit))) } };
    } catch (error: any) {
      try {
        const cached = await offlineSyncService.getCachedResponse(PROVINCES);
        const rows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
        const records = rows.map(toProvinceRecord);
        return { rows: records, pagination: { page, limit, total: records.length, totalPages: Math.max(1, Math.ceil(records.length / limit)) } };
      } catch {
        return rejectWithValue(error?.response?.data?.message || "Failed to load provinces.");
      }
    }
  }
);

export const fetchProvinceById = createAsyncThunk<ProvinceRecord, string | number, { rejectValue: string }>(
  "province/fetchById",
  async (id, { rejectWithValue }) => {
    const normalizedId = String(id);
    if (isOffline()) {
      const cached = await offlineSyncService.getCachedResponse(`${PROVINCES}/${encodeURIComponent(normalizedId)}`);
      const record = cached?.data ?? cached;
      if (record) return toProvinceRecord(record);
      const listCache = await offlineSyncService.getCachedResponse(PROVINCES);
      const rows = Array.isArray(listCache?.data) ? listCache.data : Array.isArray(listCache) ? listCache : [];
      const found = rows.find((row: { id?: string | number; tempId?: string }) => String(row.id) === normalizedId || String(row.tempId) === normalizedId);
      return found ? toProvinceRecord(found) : rejectWithValue("Offline: no cached data");
    }

    try {
      const response = await api.get<{ data: ProvinceRecord }>(`${PROVINCES}/${encodeURIComponent(normalizedId)}`);
      const record = response.data?.data ?? null;
      if (!record) return rejectWithValue("Province not found.");
      return toProvinceRecord(record);
    } catch (error: any) {
      try {
        const cached = await offlineSyncService.getCachedResponse(PROVINCES);
        const rows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
        const record = rows.find((row: any) => String(row.id) === normalizedId || String(row.tempId) === normalizedId);
        if (record) return toProvinceRecord(record);
      } catch {
        // ignore cache fallback errors
      }
      return rejectWithValue(error?.response?.data?.message || "Province not found.");
    }
  }
);

export const createProvince = createAsyncThunk<ProvinceRecord, { id?: string | number; name: string }, { rejectValue: string }>(
  "province/create",
  async (payload, { rejectWithValue }) => {
    const tempId = payload.id && isTempId(payload.id) ? String(payload.id) : generateTempId("prov");

    if (isOffline()) {
      const queued = await offlineSyncService.enqueueMutation({
        method: "post",
        url: PROVINCES,
        data: { name: payload.name, tempId, _tempId: tempId },
      } as any);
      const record = { id: tempId, name: payload.name, _offlinePending: true, tempId, ...(queued.data?.data ?? {}) };
      return toProvinceRecord(record);
    }

    try {
      const response = await api.post<{ data: ProvinceRecord }>(PROVINCES, { name: payload.name, _tempId: tempId });
      const record = response.data?.data ?? { id: tempId, name: payload.name };
      return toProvinceRecord(record);
    } catch (error: any) {
      const fallback = await offlineSyncService.enqueueMutation({
        method: "post",
        url: PROVINCES,
        data: { name: payload.name, tempId, _tempId: tempId },
      } as any);
      const record = { id: tempId, name: payload.name, _offlinePending: true, tempId, ...(fallback.data?.data ?? {}) };
      return toProvinceRecord(record);
    }
  }
);

export const updateProvince = createAsyncThunk<ProvinceRecord, { id: string | number; name: string }, { rejectValue: string }>(
  "province/update",
  async (payload, { rejectWithValue }) => {
    const targetId = String(payload.id);
    if (isOffline()) {
      const queued = await offlineSyncService.enqueueMutation({
        method: "put",
        url: `${PROVINCES}/${encodeURIComponent(targetId)}`,
        data: { name: payload.name, _tempId: targetId },
      } as any);
      const record = queued.data?.data || { id: targetId, name: payload.name };
      return toProvinceRecord(record);
    }

    try {
      const response = await api.put<{ data: ProvinceRecord }>(`${PROVINCES}/${encodeURIComponent(targetId)}`, { name: payload.name });
      const record = response.data?.data ?? { id: targetId, name: payload.name };
      return toProvinceRecord(record);
    } catch (error: any) {
      const fallback = await offlineSyncService.enqueueMutation({
        method: "put",
        url: `${PROVINCES}/${encodeURIComponent(targetId)}`,
        data: { name: payload.name, _tempId: targetId },
      } as any);
      const record = fallback.data?.data || { id: targetId, name: payload.name };
      return toProvinceRecord(record);
    }
  }
);

export const fetchProvinces = fetchAllProvinces;

export const provinceSlice = createSlice({
  name: "province",
  initialState,
  reducers: {
    setReconciledId: (state, action: PayloadAction<{ tempId: string; realId: string | number; resourceUrl: string }>) => {
      const { tempId, realId } = action.payload;
      const ids = provinceAdapter.getSelectors().selectAll(state);
      const match = ids.find((item) => String(item.id) === String(tempId) || String(item.tempId) === String(tempId));

      if (match) {
        provinceAdapter.updateOne(state, {
          id: String(match.id),
          changes: {
            id: realId,
            tempId: undefined,
            _offlinePending: false,
          },
        });
      }

      const pending = state.pendingOptions.find((item) => String(item.value) === String(tempId));
      if (pending) {
        state.pendingOptions = state.pendingOptions.map((item) =>
          String(item.value) === String(tempId)
            ? { ...item, value: String(realId), _offlinePending: false }
            : item
        );
      }

      if (state.currentRecord && (String(state.currentRecord.id) === String(tempId) || String(state.currentRecord.tempId) === String(tempId))) {
        state.currentRecord = {
          ...state.currentRecord,
          id: realId,
          tempId: undefined,
          _offlinePending: false,
        };
      }

      if (state.nextId && String(state.nextId) === String(tempId)) {
        state.nextId = String(realId);
      }
    },
    setCurrentRecord: (state, action: PayloadAction<ProvinceRecord | null>) => {
      state.currentRecord = action.payload;
      state.isNewMode = !Boolean(action.payload);
      state.isEditing = Boolean(action.payload);
    },
    resetForm: (state) => {
      state.currentRecord = null;
      state.isNewMode = true;
      state.isEditing = true;
      state.apiError = null;
    },
    setNewMode: (state, action: PayloadAction<boolean>) => {
      state.isNewMode = action.payload;
      if (action.payload) state.isEditing = true;
    },
    setEditing: (state, action: PayloadAction<boolean>) => {
      state.isEditing = action.payload;
    },
    setOfflineQueueVersion: (state, action: PayloadAction<number>) => {
      state.offlineQueueVersion = action.payload;
    },
    clearApiError: (state) => {
      state.apiError = null;
    },
    setPendingOptions: (state, action: PayloadAction<Array<{ label: string; value: string; _offlinePending?: boolean }>>) => {
      state.pendingOptions = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProvinceNextId.pending, (state) => {
        state.apiStatus = "loading";
        state.isIdLoading = true;
      })
      .addCase(fetchProvinceNextId.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isIdLoading = false;
        state.nextId = action.payload.nextId;
        state.isNewMode = true;
        state.isEditing = true;
        state.currentRecord = null;
      })
      .addCase(fetchProvinceNextId.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isIdLoading = false;
        state.nextId = generateTempId("prov");
        state.isNewMode = true;
        state.isEditing = true;
        state.currentRecord = null;
        state.apiError = action.payload ?? "Failed to fetch next province ID.";
      })
      .addCase(fetchAllProvinces.pending, (state) => {
        state.apiStatus = "loading";
        state.listStatus = "loading";
        state.listError = null;
      })
      .addCase(fetchAllProvinces.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.listStatus = "succeeded";
        state.pagination = action.payload.pagination;
        provinceAdapter.setAll(state, action.payload.rows);
      })
      .addCase(fetchAllProvinces.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.listStatus = "failed";
        state.listError = action.payload ?? "Failed to load provinces.";
        state.apiError = state.listError;
      })
      .addCase(fetchProvinceById.pending, (state) => {
        state.apiStatus = "loading";
        state.isLookingUp = true;
      })
      .addCase(fetchProvinceById.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isLookingUp = false;
        state.currentRecord = action.payload;
        state.isNewMode = false;
        state.isEditing = false;
        provinceAdapter.upsertOne(state, action.payload);
      })
      .addCase(fetchProvinceById.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isLookingUp = false;
        state.currentRecord = null;
        state.isNewMode = true;
        state.isEditing = true;
        state.apiError = action.payload ?? "Province lookup failed.";
      })
      .addCase(createProvince.pending, (state) => {
        state.apiStatus = "loading";
        state.isSubmitting = true;
      })
      .addCase(createProvince.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isSubmitting = false;
        state.currentRecord = action.payload;
        state.isNewMode = true;
        state.isEditing = true;
        provinceAdapter.upsertOne(state, action.payload);
      })
      .addCase(createProvince.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to create province.";
      })
      .addCase(updateProvince.pending, (state) => {
        state.apiStatus = "loading";
        state.isSubmitting = true;
      })
      .addCase(updateProvince.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isSubmitting = false;
        state.currentRecord = action.payload;
        state.isNewMode = false;
        state.isEditing = false;
        provinceAdapter.upsertOne(state, action.payload);
      })
      .addCase(updateProvince.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to update province.";
      });
  },
});

export const {
  resetForm,
  setNewMode,
  setEditing,
  clearApiError,
  setCurrentRecord,
  setReconciledId,
  setPendingOptions,
} = provinceSlice.actions;

export const provinceReducer = provinceSlice.reducer;
export default provinceSlice.reducer;
