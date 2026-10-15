import { createAsyncThunk, createEntityAdapter, createSlice, type EntityState, type PayloadAction } from "@reduxjs/toolkit";
import api from "@/lib/axios";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { CATEGORIES } from "@/utlis/apiRoutes";
import { isOffline } from "@/store/utils/network";
import { generateTempId, isTempId } from "@/store/utils/tempId";

export type CategoryRecord = {
  id: string | number;
  name: string;
  _offlinePending?: boolean;
  tempId?: string;
};

export type CategoryAsyncStatus = "idle" | "loading" | "succeeded" | "failed";
export type PageRequest = { page: number; limit: number };
export type Pagination = { page: number; limit: number; total: number; totalPages: number };

interface CategoryState extends EntityState<CategoryRecord, string | number> {
  apiStatus: CategoryAsyncStatus;
  apiError: string | null;
  nextId: string;
  currentRecord: CategoryRecord | null;
  isNewMode: boolean;
  isEditing: boolean;
  isIdLoading: boolean;
  isLookingUp: boolean;
  listStatus: CategoryAsyncStatus;
  listError: string | null;
  pagination: Pagination;
  isSubmitting: boolean;
  offlineQueueVersion: number;
}

const categoryAdapter = createEntityAdapter<CategoryRecord, string | number>({
  selectId: (record: CategoryRecord) => String(record.id),
});

const initialState: CategoryState = categoryAdapter.getInitialState({
  apiStatus: "idle",
  apiError: null,
  nextId: "",
  currentRecord: null,
  isNewMode: true,
  isEditing: true,
  isIdLoading: false,
  isLookingUp: false,
  listStatus: "idle",
  listError: null,
  pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
  isSubmitting: false,
  offlineQueueVersion: 0,
});

const toCategoryRecord = (value: any): CategoryRecord => ({
  id: value?.id ?? value?.tempId ?? generateTempId("cat"),
  name: String(value?.name ?? ""),
  _offlinePending: Boolean(value?._offlinePending),
  tempId: value?.tempId ?? undefined,
});

export const fetchCategoryNextId = createAsyncThunk<{ nextId: string; isTemp: boolean }, void, { rejectValue: string }>(
  "category/fetchNextId",
  async (_, { rejectWithValue }) => {
    if (isOffline()) {
      return { nextId: generateTempId("cat"), isTemp: true };
    }

    try {
      const response = await api.get<{ data: { nextId: string | number } }>(`${CATEGORIES}/next-id`, {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      return { nextId: String(response.data.data.nextId), isTemp: false };
    } catch (error: any) {
      if (error?.response) {
        return rejectWithValue(error.response.data?.message || "Unable to fetch the next category ID.");
      }
      if (typeof navigator !== "undefined" && navigator.onLine) {
        return rejectWithValue("Category API is unreachable. Check the backend URL, CORS, and server status.");
      }
      return { nextId: generateTempId("cat"), isTemp: true };
    }
  }
);

export const fetchAllCategories = createAsyncThunk<{ rows: CategoryRecord[]; pagination: Pagination }, PageRequest, { rejectValue: string }>(
  "category/fetchAll",
  async ({ page, limit }, { rejectWithValue }) => {
    if (isOffline()) {
      const cached = await offlineSyncService.getCachedResponse(CATEGORIES);
      if (!cached) return rejectWithValue("Offline: no cached data");
      const rawRows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
      const rows = rawRows.map(toCategoryRecord);
      return { rows, pagination: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) } };
    }
    try {
      const response = await api.get<{ data: CategoryRecord[]; meta?: Partial<Pagination> }>(CATEGORIES, { params: { page, limit } });
      const rows = Array.isArray(response.data?.data) ? response.data.data.map(toCategoryRecord) : [];
      const meta = response.data.meta ?? {};
      return { rows, pagination: { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total ?? rows.length, totalPages: meta.totalPages ?? Math.max(1, Math.ceil((meta.total ?? rows.length) / (meta.limit ?? limit))) } };
    } catch (error: any) {
      try {
        const cached = await offlineSyncService.getCachedResponse(CATEGORIES);
        const rows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
        const records = rows.map(toCategoryRecord);
        return { rows: records, pagination: { page, limit, total: records.length, totalPages: Math.max(1, Math.ceil(records.length / limit)) } };
      } catch {
        return rejectWithValue(error?.response?.data?.message || "Failed to load categories.");
      }
    }
  }
);

export const fetchCategoryById = createAsyncThunk<CategoryRecord, string | number, { rejectValue: string }>(
  "category/fetchById",
  async (id, { rejectWithValue }) => {
    const normalizedId = String(id);
    if (isOffline()) {
      const cached = await offlineSyncService.getCachedResponse(`${CATEGORIES}/${encodeURIComponent(normalizedId)}`);
      const record = cached?.data ?? cached;
      if (record) return toCategoryRecord(record);
      const listCache = await offlineSyncService.getCachedResponse(CATEGORIES);
      const rows = Array.isArray(listCache?.data) ? listCache.data : Array.isArray(listCache) ? listCache : [];
      const found = rows.find((row: { id?: string | number; tempId?: string }) => String(row.id) === normalizedId || String(row.tempId) === normalizedId);
      return found ? toCategoryRecord(found) : rejectWithValue("Offline: no cached data");
    }

    try {
      const response = await api.get<{ data: CategoryRecord }>(`${CATEGORIES}/${encodeURIComponent(normalizedId)}`);
      const record = response.data?.data ?? null;
      if (!record) return rejectWithValue("Category not found.");
      return toCategoryRecord(record);
    } catch (error: any) {
      try {
        const cached = await offlineSyncService.getCachedResponse(CATEGORIES);
        const rows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
        const record = rows.find((row: any) => String(row.id) === normalizedId || String(row.tempId) === normalizedId);
        if (record) return toCategoryRecord(record);
      } catch {
        // ignore cache fallback errors
      }
      return rejectWithValue(error?.response?.data?.message || "Category not found.");
    }
  }
);

export const createCategory = createAsyncThunk<CategoryRecord, { id?: string | number; name: string }, { rejectValue: string }>(
  "category/create",
  async (payload, { rejectWithValue }) => {
    const tempId = payload.id && isTempId(payload.id) ? String(payload.id) : generateTempId("cat");

    if (isOffline()) {
      const queued = await offlineSyncService.enqueueMutation({
        method: "post",
        url: CATEGORIES,
        data: { name: payload.name, tempId, _tempId: tempId },
      } as any);
      const record = { id: tempId, name: payload.name, _offlinePending: true, tempId, ...(queued.data?.data ?? {}) };
      return toCategoryRecord(record);
    }

    try {
      const response = await api.post<{ data: CategoryRecord }>(CATEGORIES, { name: payload.name, _tempId: tempId });
      const record = response.data?.data ?? { id: tempId, name: payload.name };
      return toCategoryRecord(record);
    } catch (error: any) {
      if (error?.response) {
        return rejectWithValue(error.response.data?.message || "Failed to create category.");
      }
      const fallback = await offlineSyncService.enqueueMutation({
        method: "post",
        url: CATEGORIES,
        data: { name: payload.name, tempId, _tempId: tempId },
      } as any);
      const record = { id: tempId, name: payload.name, _offlinePending: true, tempId, ...(fallback.data?.data ?? {}) };
      return toCategoryRecord(record);
    }
  }
);

export const updateCategory = createAsyncThunk<CategoryRecord, { id: string | number; name: string }, { rejectValue: string }>(
  "category/update",
  async (payload, { rejectWithValue }) => {
    const targetId = String(payload.id);

    if (isOffline()) {
      const queued = await offlineSyncService.enqueueMutation({
        method: "put",
        url: `${CATEGORIES}/${encodeURIComponent(targetId)}`,
        data: { name: payload.name, _tempId: targetId },
      } as any);
      const record = queued.data?.data || { id: targetId, name: payload.name };
      return toCategoryRecord(record);
    }

    try {
      const response = await api.put<{ data: CategoryRecord }>(`${CATEGORIES}/${encodeURIComponent(targetId)}`, { name: payload.name });
      const record = response.data?.data ?? { id: targetId, name: payload.name };
      return toCategoryRecord(record);
    } catch (error: any) {
      if (error?.response) {
        return rejectWithValue(error.response.data?.message || "Failed to update category.");
      }
      const fallback = await offlineSyncService.enqueueMutation({
        method: "put",
        url: `${CATEGORIES}/${encodeURIComponent(targetId)}`,
        data: { name: payload.name, _tempId: targetId },
      } as any);
      const record = fallback.data?.data || { id: targetId, name: payload.name };
      return toCategoryRecord(record);
    }
  }
);

export const fetchCategories = fetchAllCategories;

export const categorySlice = createSlice({
  name: "category",
  initialState,
  reducers: {
    setReconciledId: (state, action: PayloadAction<{ tempId: string; realId: string | number; resourceUrl: string }>) => {
      const { tempId, realId } = action.payload;
      const ids = categoryAdapter.getSelectors().selectAll(state);
      const match = ids.find((item) => String(item.id) === String(tempId) || String(item.tempId) === String(tempId));

      if (match) {
        categoryAdapter.updateOne(state, {
          id: String(match.id),
          changes: {
            id: realId,
            tempId: undefined,
            _offlinePending: false,
          },
        });
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
    setCurrentRecord: (state, action: PayloadAction<CategoryRecord | null>) => {
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
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategoryNextId.pending, (state) => {
        state.apiStatus = "loading";
        state.isIdLoading = true;
      })
      .addCase(fetchCategoryNextId.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isIdLoading = false;
        state.nextId = action.payload.nextId;
        state.isNewMode = true;
        state.isEditing = true;
        state.currentRecord = null;
      })
      .addCase(fetchCategoryNextId.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isIdLoading = false;
        state.isNewMode = true;
        state.isEditing = true;
        state.currentRecord = null;
        state.apiError = action.payload ?? "Failed to fetch next category ID.";
      })
      .addCase(fetchAllCategories.pending, (state) => {
        state.apiStatus = "loading";
        state.listStatus = "loading";
        state.listError = null;
      })
      .addCase(fetchAllCategories.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.listStatus = "succeeded";
        state.pagination = action.payload.pagination;
        categoryAdapter.setAll(state, action.payload.rows);
      })
      .addCase(fetchAllCategories.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.listStatus = "failed";
        state.listError = action.payload ?? "Failed to load categories.";
        state.apiError = state.listError;
      })
      .addCase(fetchCategoryById.pending, (state) => {
        state.apiStatus = "loading";
        state.isLookingUp = true;
      })
      .addCase(fetchCategoryById.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isLookingUp = false;
        state.currentRecord = action.payload;
        state.isNewMode = false;
        state.isEditing = false;
        categoryAdapter.upsertOne(state, action.payload);
      })
      .addCase(fetchCategoryById.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isLookingUp = false;
        state.currentRecord = null;
        state.isNewMode = true;
        state.isEditing = true;
        state.apiError = action.payload ?? "Category lookup failed.";
      })
      .addCase(createCategory.pending, (state) => {
        state.apiStatus = "loading";
        state.isSubmitting = true;
      })
      .addCase(createCategory.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isSubmitting = false;
        state.currentRecord = action.payload;
        state.isNewMode = true;
        state.isEditing = true;
        categoryAdapter.upsertOne(state, action.payload);
      })
      .addCase(createCategory.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to create category.";
      })
      .addCase(updateCategory.pending, (state) => {
        state.apiStatus = "loading";
        state.isSubmitting = true;
      })
      .addCase(updateCategory.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isSubmitting = false;
        state.currentRecord = action.payload;
        state.isNewMode = false;
        state.isEditing = false;
        categoryAdapter.upsertOne(state, action.payload);
      })
      .addCase(updateCategory.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to update category.";
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
} = categorySlice.actions;

export const categoryReducer = categorySlice.reducer;
export default categorySlice.reducer;
