import { createAsyncThunk, createEntityAdapter, createSlice, type EntityState, type PayloadAction } from "@reduxjs/toolkit";
import api from "@/lib/axios";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { CITIES, PROVINCES } from "@/utlis/apiRoutes";
import { isOffline } from "@/store/utils/network";
import { generateTempId, isTempId } from "@/store/utils/tempId";

export type CityRecord = {
  id: string | number;
  name: string;
  provinceId: string | number;
  provinceName?: string;
  _offlinePending?: boolean;
  tempId?: string;
};

export type CityAsyncStatus = "idle" | "loading" | "succeeded" | "failed";
export type CityPageRequest = { page: number; limit: number };
export type CityPagination = { page: number; limit: number; total: number; totalPages: number };

interface CityState extends EntityState<CityRecord, string | number> {
  apiStatus: CityAsyncStatus;
  apiError: string | null;
  nextId: string;
  currentRecord: CityRecord | null;
  isNewMode: boolean;
  isEditing: boolean;
  isIdLoading: boolean;
  isLookingUp: boolean;
  provinceOptions: Array<{ label: string; value: string; _offlinePending?: boolean }>;
  listStatus: CityAsyncStatus;
  listError: string | null;
  pagination: CityPagination;
  isSubmitting: boolean;
  offlineQueueVersion: number;
}

const cityAdapter = createEntityAdapter<CityRecord, string | number>({
  selectId: (record: CityRecord) => String(record.id),
});

const initialState: CityState = cityAdapter.getInitialState({
  apiStatus: "idle",
  apiError: null,
  nextId: "",
  currentRecord: null,
  isNewMode: true,
  isEditing: true,
  isIdLoading: false,
  isLookingUp: false,
  provinceOptions: [],
  listStatus: "idle",
  listError: null,
  pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
  isSubmitting: false,
  offlineQueueVersion: 0,
});

const toCityRecord = (value: any): CityRecord => ({
  id: value?.id ?? value?.tempId ?? generateTempId("city"),
  name: String(value?.name ?? ""),
  provinceId: value?.provinceId ?? value?.province_id ?? "",
  provinceName: value?.provinceName ?? value?.province_name ?? undefined,
  _offlinePending: Boolean(value?._offlinePending),
  tempId: value?.tempId ?? undefined,
});

export const fetchCityNextId = createAsyncThunk<{ nextId: string; isTemp: boolean }, void, { rejectValue: string }>(
  "city/fetchNextId",
  async (_, { rejectWithValue }) => {
    if (isOffline()) {
      return { nextId: generateTempId("city"), isTemp: true };
    }

    try {
      const response = await api.get<{ data: { nextId: string | number } }>(`${CITIES}/next-id`, {
        params: { _t: Date.now() },
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      return { nextId: String(response.data.data.nextId), isTemp: false };
    } catch {
      return { nextId: generateTempId("city"), isTemp: true };
    }
  }
);

export const fetchAllCities = createAsyncThunk<{ rows: CityRecord[]; pagination: CityPagination }, CityPageRequest, { rejectValue: string }>(
  "city/fetchAll",
  async ({ page, limit }, { rejectWithValue }) => {
    if (isOffline()) {
      const cached = await offlineSyncService.getCachedResponse(CITIES);
      if (!cached) return rejectWithValue("Offline: no cached data");
      const rawRows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
      const rows = rawRows.map(toCityRecord);
      return { rows, pagination: { page, limit, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / limit)) } };
    }
    try {
      const response = await api.get<{ data: CityRecord[]; meta?: Partial<CityPagination> }>(CITIES, { params: { page, limit } });
      const rows = Array.isArray(response.data?.data) ? response.data.data.map(toCityRecord) : [];
      const meta = response.data.meta ?? {};
      return { rows, pagination: { page: meta.page ?? page, limit: meta.limit ?? limit, total: meta.total ?? rows.length, totalPages: meta.totalPages ?? Math.max(1, Math.ceil((meta.total ?? rows.length) / (meta.limit ?? limit))) } };
    } catch (error: any) {
      try {
        const cached = await offlineSyncService.getCachedResponse(CITIES);
        const rows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
        const records = rows.map(toCityRecord);
        return { rows: records, pagination: { page, limit, total: records.length, totalPages: Math.max(1, Math.ceil(records.length / limit)) } };
      } catch {
        return rejectWithValue(error?.response?.data?.message || "Failed to load cities.");
      }
    }
  }
);

export const fetchCityById = createAsyncThunk<CityRecord, string | number, { rejectValue: string }>(
  "city/fetchById",
  async (id, { rejectWithValue }) => {
    const normalizedId = String(id);
    if (isOffline()) {
      const cached = await offlineSyncService.getCachedResponse(`${CITIES}/${encodeURIComponent(normalizedId)}`);
      const record = cached?.data ?? cached;
      if (record) return toCityRecord(record);
      const listCache = await offlineSyncService.getCachedResponse(CITIES);
      const rows = Array.isArray(listCache?.data) ? listCache.data : Array.isArray(listCache) ? listCache : [];
      const found = rows.find((row: { id?: string | number; tempId?: string }) => String(row.id) === normalizedId || String(row.tempId) === normalizedId);
      return found ? toCityRecord(found) : rejectWithValue("Offline: no cached data");
    }

    try {
      const response = await api.get<{ data: CityRecord }>(`${CITIES}/${encodeURIComponent(normalizedId)}`);
      const record = response.data?.data ?? null;
      if (!record) return rejectWithValue("City not found.");
      return toCityRecord(record);
    } catch (error: any) {
      try {
        const cached = await offlineSyncService.getCachedResponse(CITIES);
        const rows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
        const record = rows.find((row: any) => String(row.id) === normalizedId || String(row.tempId) === normalizedId);
        if (record) return toCityRecord(record);
      } catch {
        // ignore cache fallback errors
      }
      return rejectWithValue(error?.response?.data?.message || "City not found.");
    }
  }
);

export const fetchProvinceOptions = createAsyncThunk<Array<{ label: string; value: string; _offlinePending?: boolean }>, void, { rejectValue: string }>(
  "city/fetchProvinceOptions",
  async (_, { rejectWithValue }) => {
    try {
      let serverRows: any[] = [];
      if (isOffline()) {
        const cached = await offlineSyncService.getCachedResponse(PROVINCES);
        if (!cached) return rejectWithValue("Offline: no cached data");
        serverRows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
      } else {
        try {
          const response = await api.get<{ data: any[] }>(PROVINCES);
          serverRows = Array.isArray(response.data?.data) ? response.data.data : [];
        } catch {
          const cached = await offlineSyncService.getCachedResponse(PROVINCES);
          serverRows = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
        }
      }

      const queue = await offlineSyncService.getQueue();
      const pendingProvinces = queue
        .filter((q) => q.method === "post" && q.resourceUrl === PROVINCES)
        .map((q) => ({
          label: `${q.data?.name ?? "Province"} (Pending)`,
          value: String(q.tempId ?? q.data?.tempId ?? q.data?.id ?? ""),
          _offlinePending: true,
        }))
        .filter((item) => item.value);

      const options = [
        ...serverRows.map((province) => ({
          label: province.name,
          value: String(province.id),
          _offlinePending: Boolean(province._offlinePending),
        })),
        ...pendingProvinces,
      ];

      return options;
    } catch (error: any) {
      return rejectWithValue(error?.message || "Failed to load province options.");
    }
  }
);

export const createCity = createAsyncThunk<CityRecord, { id?: string | number; name: string; provinceId: string | number }, { rejectValue: string }>(
  "city/create",
  async (payload, { rejectWithValue }) => {
    const tempId = payload.id && isTempId(payload.id) ? String(payload.id) : generateTempId("city");
    const provinceTempId = isTempId(payload.provinceId) ? String(payload.provinceId) : undefined;

    if (isOffline()) {
      const queued = await offlineSyncService.enqueueMutation({
        method: "post",
        url: CITIES,
        data: { name: payload.name, provinceId: payload.provinceId, tempId, _tempId: tempId, _tempProvinceId: provinceTempId },
      } as any);
      const record = { id: tempId, name: payload.name, provinceId: payload.provinceId, _offlinePending: true, tempId, ...(queued.data?.data ?? {}) };
      return toCityRecord(record);
    }

    try {
      const response = await api.post<{ data: CityRecord }>(CITIES, {
        name: payload.name,
        provinceId: payload.provinceId,
        _tempId: tempId,
        ...(provinceTempId ? { _tempProvinceId: provinceTempId } : {}),
      });
      const record = response.data?.data ?? { id: tempId, name: payload.name, provinceId: payload.provinceId };
      return toCityRecord(record);
    } catch (error: any) {
      const fallback = await offlineSyncService.enqueueMutation({
        method: "post",
        url: CITIES,
        data: { name: payload.name, provinceId: payload.provinceId, tempId, _tempId: tempId, _tempProvinceId: provinceTempId },
      } as any);
      const record = { id: tempId, name: payload.name, provinceId: payload.provinceId, _offlinePending: true, tempId, ...(fallback.data?.data ?? {}) };
      return toCityRecord(record);
    }
  }
);

export const updateCity = createAsyncThunk<CityRecord, { id: string | number; name: string; provinceId: string | number }, { rejectValue: string }>(
  "city/update",
  async (payload, { rejectWithValue }) => {
    const targetId = String(payload.id);
    if (isOffline()) {
      const queued = await offlineSyncService.enqueueMutation({
        method: "put",
        url: `${CITIES}/${encodeURIComponent(targetId)}`,
        data: { name: payload.name, provinceId: payload.provinceId },
      } as any);
      const record = queued.data?.data || { id: targetId, name: payload.name, provinceId: payload.provinceId };
      return toCityRecord(record);
    }

    try {
      const response = await api.put<{ data: CityRecord }>(`${CITIES}/${encodeURIComponent(targetId)}`, {
        name: payload.name,
        provinceId: payload.provinceId,
      });
      const record = response.data?.data ?? { id: targetId, name: payload.name, provinceId: payload.provinceId };
      return toCityRecord(record);
    } catch (error: any) {
      const fallback = await offlineSyncService.enqueueMutation({
        method: "put",
        url: `${CITIES}/${encodeURIComponent(targetId)}`,
        data: { name: payload.name, provinceId: payload.provinceId },
      } as any);
      const record = fallback.data?.data || { id: targetId, name: payload.name, provinceId: payload.provinceId };
      return toCityRecord(record);
    }
  }
);

export const fetchCities = fetchAllCities;

export const citySlice = createSlice({
  name: "city",
  initialState,
  reducers: {
    setReconciledId: (state, action: PayloadAction<{ tempId: string; realId: string | number; resourceUrl: string }>) => {
      const { tempId, realId } = action.payload;
      const ids = cityAdapter.getSelectors().selectAll(state);
      const match = ids.find((item) => String(item.id) === String(tempId) || String(item.tempId) === String(tempId));

      if (match) {
        cityAdapter.updateOne(state, {
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
    setCurrentRecord: (state, action: PayloadAction<CityRecord | null>) => {
      state.currentRecord = action.payload;
      state.isNewMode = !Boolean(action.payload);
      state.isEditing = Boolean(action.payload);
    },
    setReconciledProvinceId: (state, action: PayloadAction<{ tempId: string; realId: string | number; resourceUrl: string }>) => {
      const { tempId, realId } = action.payload;
      const selected = state.provinceOptions.find((option) => String(option.value) === String(tempId));
      if (selected) {
        state.provinceOptions = state.provinceOptions.map((option) =>
          String(option.value) === String(tempId)
            ? { ...option, value: String(realId), _offlinePending: false, label: option.label.replace(" (Pending)", "") }
            : option
        );
      }

      cityAdapter.getSelectors().selectAll(state).forEach((city) => {
        if (String(city.provinceId) === String(tempId)) {
          cityAdapter.updateOne(state, {
            id: String(city.id),
            changes: { provinceId: realId },
          });
        }
      });

      if (state.currentRecord && String(state.currentRecord.provinceId) === String(tempId)) {
        state.currentRecord = { ...state.currentRecord, provinceId: realId };
      }
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
    setProvinceOptions: (state, action: PayloadAction<Array<{ label: string; value: string; _offlinePending?: boolean }>>) => {
      state.provinceOptions = action.payload;
    },
    setPendingOptions: (state, action: PayloadAction<Array<{ label: string; value: string; _offlinePending?: boolean }>>) => {
      state.provinceOptions = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCityNextId.pending, (state) => {
        state.apiStatus = "loading";
        state.isIdLoading = true;
      })
      .addCase(fetchCityNextId.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isIdLoading = false;
        state.nextId = action.payload.nextId;
        state.isNewMode = true;
        state.isEditing = true;
        state.currentRecord = null;
      })
      .addCase(fetchCityNextId.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isIdLoading = false;
        state.nextId = generateTempId("city");
        state.isNewMode = true;
        state.isEditing = true;
        state.currentRecord = null;
        state.apiError = action.payload ?? "Failed to fetch next city ID.";
      })
      .addCase(fetchAllCities.pending, (state) => {
        state.apiStatus = "loading";
        state.listStatus = "loading";
        state.listError = null;
      })
      .addCase(fetchAllCities.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.listStatus = "succeeded";
        state.pagination = action.payload.pagination;
        cityAdapter.setAll(state, action.payload.rows);
      })
      .addCase(fetchAllCities.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.listStatus = "failed";
        state.listError = action.payload ?? "Failed to load cities.";
        state.apiError = state.listError;
      })
      .addCase(fetchCityById.pending, (state) => {
        state.apiStatus = "loading";
        state.isLookingUp = true;
      })
      .addCase(fetchCityById.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isLookingUp = false;
        state.currentRecord = action.payload;
        state.isNewMode = false;
        state.isEditing = false;
        cityAdapter.upsertOne(state, action.payload);
      })
      .addCase(fetchCityById.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isLookingUp = false;
        state.currentRecord = null;
        state.isNewMode = true;
        state.isEditing = true;
        state.apiError = action.payload ?? "City lookup failed.";
      })
      .addCase(fetchProvinceOptions.fulfilled, (state, action) => {
        state.provinceOptions = action.payload;
      })
      .addCase(createCity.pending, (state) => {
        state.apiStatus = "loading";
        state.isSubmitting = true;
      })
      .addCase(createCity.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isSubmitting = false;
        state.currentRecord = action.payload;
        state.isNewMode = true;
        state.isEditing = true;
        cityAdapter.upsertOne(state, action.payload);
      })
      .addCase(createCity.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to create city.";
      })
      .addCase(updateCity.pending, (state) => {
        state.apiStatus = "loading";
        state.isSubmitting = true;
      })
      .addCase(updateCity.fulfilled, (state, action) => {
        state.apiStatus = "succeeded";
        state.isSubmitting = false;
        state.currentRecord = action.payload;
        state.isNewMode = false;
        state.isEditing = false;
        cityAdapter.upsertOne(state, action.payload);
      })
      .addCase(updateCity.rejected, (state, action) => {
        state.apiStatus = "failed";
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to update city.";
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
} = citySlice.actions;

export const cityReducer = citySlice.reducer;
export default citySlice.reducer;
