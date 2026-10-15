import type { RootState } from "@/store";

export const selectProvinceList = (state: RootState) => state.province.list;
export const selectProvinceStatus = (state: RootState) => state.province.listStatus;
export const selectProvinceNextId = (state: RootState) => state.province.nextId;
export const selectProvinceCurrentRecord = (state: RootState) => state.province.currentRecord;
export const selectProvinceIsNewMode = (state: RootState) => state.province.isNewMode;
export const selectProvinceIsEditing = (state: RootState) => state.province.isEditing;
export const selectProvinceIsIdLoading = (state: RootState) => state.province.isIdLoading;
export const selectProvinceApiError = (state: RootState) => state.province.apiError;
export const selectProvinceApiStatus = (state: RootState) => state.province.listStatus;
export const selectProvinceIsSubmitting = (state: RootState) => state.province.isSubmitting;
export const selectProvinceIsLookingUp = (state: RootState) => state.province.isLookingUp;
export const selectProvinceListStatus = (state: RootState) => state.province.listStatus;
export const selectProvinceListError = (state: RootState) => state.province.listError;
export const selectProvincePagination = (state: RootState) => state.province.pagination;
export const selectProvincesStatus = (state: RootState) => state.province.listStatus;

export const selectProvinceOptionsMerged = (state: RootState) => {
  const merged = new Map<string, { label: string; value: string; _offlinePending?: boolean }>();

  (state.province.list ?? []).forEach((province) => {
    if (province && province.id != null) {
      merged.set(String(province.id), {
        label: String(province.name ?? province.id),
        value: String(province.id),
        _offlinePending: Boolean(province._offlinePending),
      });
    }
  });

  return Array.from(merged.values());
};
