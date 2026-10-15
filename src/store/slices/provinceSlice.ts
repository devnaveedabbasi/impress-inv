import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { PROVINCES } from "@/utils/apiRoutes";
import { createOfflineThunks, type Pagination } from "@/utils/createofflinethunks";
import type { ProvinceFormValues } from "@/validations/master";

export type ProvinceRecord = {
  id: string | number;
  name: string;
  _offlinePending?: boolean;
  tempId?: string;
};

export type ProvinceAsyncStatus = "idle" | "loading" | "succeeded" | "failed";
export type ProvincePagination = Pagination;

interface ProvinceState {
  list: ProvinceRecord[];
  listStatus: ProvinceAsyncStatus;
  listError: string | null;
  pagination: ProvincePagination;
  nextId: string;
  currentRecord: ProvinceRecord | null;
  isNewMode: boolean;
  isEditing: boolean;
  isIdLoading: boolean;
  isLookingUp: boolean;
  isSubmitting: boolean;
  apiError: string | null;
}

const initialState: ProvinceState = {
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
  isSubmitting: false,
  apiError: null,
};

/* ---------------- Thunks ---------------- */
const provinceThunks = createOfflineThunks<ProvinceRecord, ProvinceFormValues>({
  name: "province",
  url: PROVINCES,
  label: "province",
  tempEntity: "prov",
  buildBody: (p) => ({
    name: p.name,
  }),
});

export const fetchProvinceNextId = provinceThunks.fetchNextId;
export const fetchAllProvinces = provinceThunks.fetchAll;
export const fetchProvinceById = provinceThunks.fetchById;
export const createProvince = provinceThunks.create;
export const updateProvince = provinceThunks.update;
export const fetchProvinces = fetchAllProvinces;

/* ---------------- Slice ---------------- */

export const provinceSlice = createSlice({
  name: "province",
  initialState,
  reducers: {
    setNewMode(state, action: PayloadAction<boolean>) {
      state.isNewMode = action.payload;
      if (action.payload) state.isEditing = true;
    },
    setEditing(state, action: PayloadAction<boolean>) {
      state.isEditing = action.payload;
    },
    setCurrentRecord: (state, action: PayloadAction<ProvinceRecord | null>) => {
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
    setNextId: (state, action: PayloadAction<string>) => {
      state.nextId = action.payload;
      state.isIdLoading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      /* fetchNextId */
      .addCase(fetchProvinceNextId.pending, (state) => {
        state.isIdLoading = true;
        state.apiError = null;
      })
      .addCase(fetchProvinceNextId.fulfilled, (state, action) => {
        state.isIdLoading = false;
        state.nextId = action.payload.nextId;
      })
      .addCase(fetchProvinceNextId.rejected, (state, action) => {
        state.isIdLoading = false;
        state.apiError = action.payload ?? "Unable to fetch the next province ID.";
      })

      /* fetchAll */
      .addCase(fetchAllProvinces.pending, (state) => {
        state.listStatus = "loading";
        state.listError = null;
      })
      .addCase(fetchAllProvinces.fulfilled, (state, action) => {
        state.listStatus = "succeeded";
        const incoming = action.payload.data || [];
        const pendingOffline = state.list.filter(
          (item) => item._offlinePending || (item.id && String(item.id).startsWith("temp-"))
        );
        const mergedMap = new Map<string, ProvinceRecord>();
        // Add pending offline items first
        pendingOffline.forEach((item) => mergedMap.set(String(item.id), item));
        // Add incoming items (will not overwrite pending temp IDs)
        incoming.forEach((item) => {
          if (!mergedMap.has(String(item.id))) {
            mergedMap.set(String(item.id), item);
          }
        });
        state.list = Array.from(mergedMap.values());
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchAllProvinces.rejected, (state, action) => {
        state.listStatus = "failed";
        state.listError = action.payload ?? "Failed to load provinces";
      })

      /* fetchById */
      .addCase(fetchProvinceById.pending, (state) => {
        state.isLookingUp = true;
        state.apiError = null;
      })
      .addCase(fetchProvinceById.fulfilled, (state, action) => {
        state.isLookingUp = false;
        state.currentRecord = action.payload;
        state.isNewMode = false;
        state.isEditing = false;
      })
      .addCase(fetchProvinceById.rejected, (state, action) => {
        state.isLookingUp = false;
        state.currentRecord = null;
        state.isNewMode = true;
        state.isEditing = true;
        if (action.payload && !String(action.payload).includes("not found")) {
          state.apiError = action.payload;
        }
      })

      /* create */
      .addCase(createProvince.pending, (state) => {
        state.isSubmitting = true;
        state.apiError = null;
      })
      .addCase(createProvince.fulfilled, (state, action) => {
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
      .addCase(createProvince.rejected, (state, action) => {
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to save province";
      })

      /* update */
      .addCase(updateProvince.pending, (state) => {
        state.isSubmitting = true;
        state.apiError = null;
      })
      .addCase(updateProvince.fulfilled, (state) => {
        state.isSubmitting = false;
        state.isEditing = false;
        state.currentRecord = null;
      })
      .addCase(updateProvince.rejected, (state, action) => {
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to update province";
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
  setNextId,
} = provinceSlice.actions;

export const provinceReducer = provinceSlice.reducer;
export default provinceSlice.reducer;
