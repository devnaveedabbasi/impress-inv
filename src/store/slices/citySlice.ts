import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { CITIES } from "@/utils/apiRoutes";
import { createOfflineThunks, type Pagination } from "@/utils/createofflinethunks";
import type { CityFormValues } from "@/validations/master";

export type CityRecord = {
  id: string | number;
  name: string;
  provinceId: string | number;
  provinceName?: string;
  _offlinePending?: boolean;
  tempId?: string;
};

export type CityAsyncStatus = "idle" | "loading" | "succeeded" | "failed";
export type CityPagination = Pagination;

interface CityState {
  list: CityRecord[];
  listStatus: CityAsyncStatus;
  listError: string | null;
  pagination: CityPagination;
  nextId: string;
  currentRecord: CityRecord | null;
  isNewMode: boolean;
  isEditing: boolean;
  isIdLoading: boolean;
  isLookingUp: boolean;
  provinceOptions: Array<{ label: string; value: string; _offlinePending?: boolean }>;
  isSubmitting: boolean;
  apiError: string | null;
}

const initialState: CityState = {
  list: [],
  listStatus: "idle",
  listError: null,
  pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
  nextId: "",
  currentRecord: null,
  isNewMode: true,
  isEditing: true,
  isIdLoading: false,
  isLookingUp: false,
  provinceOptions: [],
  isSubmitting: false,
  apiError: null,
};

/* ---------------- Thunks ---------------- */
const cityThunks = createOfflineThunks<CityRecord, CityFormValues>({
  name: "city",
  url: CITIES,
  label: "city",
  tempEntity: "city",
  tempRefs: { provinceId: "_tempProvinceId" },
  buildBody: (p) => ({
    name: p.name,
    provinceId: p.provinceId,
  }),
});

export const fetchCityNextId = cityThunks.fetchNextId;
export const fetchAllCities = cityThunks.fetchAll;
export const fetchCityById = cityThunks.fetchById;
export const createCity = cityThunks.create;
export const updateCity = cityThunks.update;
export const fetchCities = fetchAllCities;
export const fetchProvinceOptions = () => async () => [];

/* ---------------- Slice ---------------- */

export const citySlice = createSlice({
  name: "city",
  initialState,
  reducers: {
    setNewMode(state, action: PayloadAction<boolean>) {
      state.isNewMode = action.payload;
      if (action.payload) state.isEditing = true;
    },
    setEditing(state, action: PayloadAction<boolean>) {
      state.isEditing = action.payload;
    },
    setCurrentRecord: (state, action: PayloadAction<CityRecord | null>) => {
      state.currentRecord = action.payload;
    },
    resetForm: (state) => {
      state.currentRecord = null;
      state.isNewMode = true;
      state.isEditing = true;
      state.apiError = null;
    },
    clearApiError: (state) => {
      state.apiError = null;
    },
    setReconciledId: (state, action: PayloadAction<{ tempId: string; realId: string | number; resourceUrl?: string }>) => {
      const { tempId, realId } = action.payload;
      state.list = state.list.map((row) =>
        String(row.id) === String(tempId) || String(row.tempId) === String(tempId)
          ? { ...row, id: realId, _offlinePending: false, tempId: undefined }
          : row
      );

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
    setReconciledProvinceId: (state, action: PayloadAction<{ tempId: string; realId: string | number; resourceUrl?: string }>) => {
      const { tempId, realId } = action.payload;
      state.list = state.list.map((city) =>
        String(city.provinceId) === String(tempId) ? { ...city, provinceId: realId } : city
      );

      if (state.currentRecord && String(state.currentRecord.provinceId) === String(tempId)) {
        state.currentRecord = { ...state.currentRecord, provinceId: realId };
      }
    },
    setNextId: (state, action: PayloadAction<string>) => {
      state.nextId = action.payload;
      state.isIdLoading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      /* fetchNextId */
      .addCase(fetchCityNextId.pending, (state) => {
        state.isIdLoading = true;
        state.apiError = null;
      })
      .addCase(fetchCityNextId.fulfilled, (state, action) => {
        state.isIdLoading = false;
        state.nextId = action.payload.nextId;
      })
      .addCase(fetchCityNextId.rejected, (state, action) => {
        state.isIdLoading = false;
        state.apiError = action.payload ?? "Unable to fetch the next city ID.";
      })

      /* fetchAll */
      .addCase(fetchAllCities.pending, (state) => {
        state.listStatus = "loading";
        state.listError = null;
      })
      .addCase(fetchAllCities.fulfilled, (state, action) => {
        state.listStatus = "succeeded";
        const incoming = action.payload.data || [];
        const pendingOffline = state.list.filter(
          (item) => item._offlinePending || (item.id && String(item.id).startsWith("temp-"))
        );
        const mergedMap = new Map<string, CityRecord>();
        pendingOffline.forEach((item) => mergedMap.set(String(item.id), item));
        incoming.forEach((item) => {
          if (!mergedMap.has(String(item.id))) {
            mergedMap.set(String(item.id), item);
          }
        });
        state.list = Array.from(mergedMap.values());
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchAllCities.rejected, (state, action) => {
        state.listStatus = "failed";
        state.listError = action.payload ?? "Failed to load cities";
      })

      /* fetchById */
      .addCase(fetchCityById.pending, (state) => {
        state.isLookingUp = true;
        state.apiError = null;
      })
      .addCase(fetchCityById.fulfilled, (state, action) => {
        state.isLookingUp = false;
        state.currentRecord = action.payload;
        state.isNewMode = false;
        state.isEditing = false;
      })
      .addCase(fetchCityById.rejected, (state, action) => {
        state.isLookingUp = false;
        state.currentRecord = null;
        state.isNewMode = true;
        state.isEditing = true;
        if (action.payload && !String(action.payload).includes("not found")) {
          state.apiError = action.payload;
        }
      })

      /* create */
      .addCase(createCity.pending, (state) => {
        state.isSubmitting = true;
        state.apiError = null;
      })
      .addCase(createCity.fulfilled, (state, action) => {
        state.isSubmitting = false;
        if (action.payload?.data) {
          const item = action.payload.data;
          const exists = state.list.some(
            (r) => String(r.id) === String(item.id) || (item.tempId && String(r.tempId) === String(item.tempId))
          );
          if (!exists) {
            state.list.unshift(item);
          }
        }
      })
      .addCase(createCity.rejected, (state, action) => {
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to save city";
      })

      /* update */
      .addCase(updateCity.pending, (state) => {
        state.isSubmitting = true;
        state.apiError = null;
      })
      .addCase(updateCity.fulfilled, (state) => {
        state.isSubmitting = false;
        state.isEditing = false;
        state.currentRecord = null;
      })
      .addCase(updateCity.rejected, (state, action) => {
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to update city";
      });
  },
});

export const {
  setNewMode,
  setEditing,
  setCurrentRecord,
  resetForm,
  clearApiError,
  setReconciledId,
  setReconciledProvinceId,
  setNextId,
} = citySlice.actions;

export const cityReducer = citySlice.reducer;
export default citySlice.reducer;
