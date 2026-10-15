import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { CATEGORIES } from "@/utils/apiRoutes";
import { createOfflineThunks, type Pagination } from "@/utils/createofflinethunks";
import type { CategoryFormValues } from "@/validations/master";

export type CategoryRecord = {
  id: string | number;
  name: string;
  _offlinePending?: boolean;
  tempId?: string;
};

type CategoryState = {
  list: CategoryRecord[];
  listStatus: "idle" | "loading" | "succeeded" | "failed";
  listError: string | null;
  pagination: Pagination;
  nextId: string;
  currentRecord: CategoryRecord | null;
  isNewMode: boolean;
  isEditing: boolean;
  isIdLoading: boolean;
  isLookingUp: boolean;
  isSubmitting: boolean;
  apiError: string | null;
};

const initialState: CategoryState = {
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
const categoryThunks = createOfflineThunks<CategoryRecord, CategoryFormValues>({
  name: "category",
  url: CATEGORIES,
  label: "category",
  tempEntity: "cat",
  buildBody: (p) => ({
    name: p.name,
  }),
});

export const fetchCategoryNextId = categoryThunks.fetchNextId;
export const fetchAllCategories = categoryThunks.fetchAll;
export const fetchCategoryById = categoryThunks.fetchById;
export const createCategory = categoryThunks.create;
export const updateCategory = categoryThunks.update;
export const fetchCategories = fetchAllCategories;

/* ---------------- Slice ---------------- */

export const categorySlice = createSlice({
  name: "category",
  initialState,
  reducers: {
    setNewMode(state, action: PayloadAction<boolean>) {
      state.isNewMode = action.payload;
      if (action.payload) state.isEditing = true;
    },
    setEditing(state, action: PayloadAction<boolean>) {
      state.isEditing = action.payload;
    },
    setCurrentRecord: (state, action: PayloadAction<CategoryRecord | null>) => {
      state.currentRecord = action.payload;
    },
    resetForm: (state) => {
      state.currentRecord = null;
      state.isNewMode = true;
      state.isEditing = true;
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
      .addCase(fetchCategoryNextId.pending, (state) => {
        state.isIdLoading = true;
        state.apiError = null;
      })
      .addCase(fetchCategoryNextId.fulfilled, (state, action) => {
        state.isIdLoading = false;
        state.nextId = action.payload.nextId;
      })
      .addCase(fetchCategoryNextId.rejected, (state, action) => {
        state.isIdLoading = false;
        state.apiError = action.payload ?? "Unable to fetch the next category ID.";
      })

      /* fetchAll */
      .addCase(fetchAllCategories.pending, (state) => {
        state.listStatus = "loading";
        state.listError = null;
      })
      .addCase(fetchAllCategories.fulfilled, (state, action) => {
        state.listStatus = "succeeded";
        const incoming = action.payload.data || [];
        const pendingOffline = state.list.filter(
          (item) => item._offlinePending || (item.id && String(item.id).startsWith("temp-"))
        );
        const mergedMap = new Map<string, CategoryRecord>();
        pendingOffline.forEach((item) => mergedMap.set(String(item.id), item));
        incoming.forEach((item) => {
          if (!mergedMap.has(String(item.id))) {
            mergedMap.set(String(item.id), item);
          }
        });
        state.list = Array.from(mergedMap.values());
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchAllCategories.rejected, (state, action) => {
        state.listStatus = "failed";
        state.listError = action.payload ?? "Failed to load categories";
      })

      /* fetchById */
      .addCase(fetchCategoryById.pending, (state) => {
        state.isLookingUp = true;
        state.apiError = null;
      })
      .addCase(fetchCategoryById.fulfilled, (state, action) => {
        state.isLookingUp = false;
        state.currentRecord = action.payload;
        state.isNewMode = false;
        state.isEditing = false;
      })
      .addCase(fetchCategoryById.rejected, (state, action) => {
        state.isLookingUp = false;
        state.currentRecord = null;
        state.isNewMode = true;
        state.isEditing = true;
        if (action.payload && !String(action.payload).includes("not found")) {
          state.apiError = action.payload;
        }
      })

      /* create */
      .addCase(createCategory.pending, (state) => {
        state.isSubmitting = true;
        state.apiError = null;
      })
      .addCase(createCategory.fulfilled, (state, action) => {
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
      .addCase(createCategory.rejected, (state, action) => {
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to save category";
      })

      /* update */
      .addCase(updateCategory.pending, (state) => {
        state.isSubmitting = true;
        state.apiError = null;
      })
      .addCase(updateCategory.fulfilled, (state) => {
        state.isSubmitting = false;
        state.isEditing = false;
        state.currentRecord = null;
      })
      .addCase(updateCategory.rejected, (state, action) => {
        state.isSubmitting = false;
        state.apiError = action.payload ?? "Failed to update category";
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
} = categorySlice.actions;

export const categoryReducer = categorySlice.reducer;
export default categorySlice.reducer;
