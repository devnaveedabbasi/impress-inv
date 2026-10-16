import type { RootState } from "@/store";

export const selectCategoryForm = (state: RootState) => ({
  currentRecord: state.category.currentRecord,
  isNewMode: state.category.isNewMode,
  isEditing: state.category.isEditing,
  isIdLoading: state.category.isIdLoading,
  isLookingUp: state.category.isLookingUp,
  nextId: state.category.nextId,
  apiError: state.category.apiError,
  apiStatus: state.category.listStatus,
});

export const selectCategoryList = (state: RootState) => state.category.list;
export const selectCategoryStatus = (state: RootState) => state.category.listStatus;
export const selectCategoryNextId = (state: RootState) => state.category.nextId;
export const selectCategoryCurrentRecord = (state: RootState) => state.category.currentRecord;
export const selectCategoryIsNewMode = (state: RootState) => state.category.isNewMode;
export const selectCategoryIsEditing = (state: RootState) => state.category.isEditing;
export const selectCategoryIsIdLoading = (state: RootState) => state.category.isIdLoading;
export const selectCategoryApiError = (state: RootState) => state.category.apiError;
export const selectCategoryApiStatus = (state: RootState) => state.category.listStatus;
export const selectCategoryIsSubmitting = (state: RootState) => state.category.isSubmitting;
export const selectCategoryIsLookingUp = (state: RootState) => state.category.isLookingUp;
export const selectCategoryListStatus = (state: RootState) => state.category.listStatus;
export const selectCategoryListError = (state: RootState) => state.category.listError;
export const selectCategoryPagination = (state: RootState) => state.category.pagination;
