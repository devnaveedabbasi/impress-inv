import type { RootState } from "@/store";
import type { CategoryRecord } from "@/store/slices/categorySlice";
import { createSelector } from "@reduxjs/toolkit";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { CATEGORIES } from "@/utlis/apiRoutes";

export const selectCategoryForm = (state: RootState) => ({
  currentRecord: state.category.currentRecord,
  isNewMode: state.category.isNewMode,
  isEditing: state.category.isEditing,
  isIdLoading: state.category.isIdLoading,
  isLookingUp: state.category.isLookingUp,
  nextId: state.category.nextId,
  apiError: state.category.apiError,
  apiStatus: state.category.apiStatus,
});

export const selectCategoryList = createSelector(
  [
    (state: RootState) => state.category.entities,
    (state: RootState) => state.category.offlineQueueVersion,
  ],
  (entities): CategoryRecord[] => {
    const rows = Object.values(entities ?? {}).filter(
      (row): row is CategoryRecord => Boolean(row)
    );
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    offlineSyncService
      .getQueueSnapshot()
      .filter((item) => item.method === "post" && item.resourceUrl === CATEGORIES && item.tempId)
      .forEach((item) => {
        const data = (item.data ?? {}) as Record<string, unknown>;
        const id = String(item.tempId);
        if (!byId.has(id)) {
          byId.set(id, {
            id,
            name: String(data.name ?? ""),
            tempId: id,
            _offlinePending: true,
          });
        }
      });
    return Array.from(byId.values());
  }
);

export const selectCategoryStatus = (state: RootState) => state.category.apiStatus;
export const selectCategoryNextId = (state: RootState) => state.category.nextId;
export const selectCategoryCurrentRecord = (state: RootState) => state.category.currentRecord;
export const selectCategoryIsNewMode = (state: RootState) => state.category.isNewMode;
export const selectCategoryIsEditing = (state: RootState) => state.category.isEditing;
export const selectCategoryIsIdLoading = (state: RootState) => state.category.isIdLoading;
export const selectCategoryApiError = (state: RootState) => state.category.apiError;
export const selectCategoryApiStatus = (state: RootState) => state.category.apiStatus;
export const selectCategoryIsSubmitting = (state: RootState) => state.category.isSubmitting;
export const selectCategoryListStatus = (state: RootState) => state.category.listStatus;
export const selectCategoryListError = (state: RootState) => state.category.listError;
export const selectCategoryPagination = (state: RootState) => state.category.pagination;
