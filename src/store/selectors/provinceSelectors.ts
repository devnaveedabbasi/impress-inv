import type { RootState } from "@/store";
import type { ProvinceRecord } from "@/store/slices/provinceSlice";
import { createSelector } from "@reduxjs/toolkit";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { PROVINCES } from "@/utlis/apiRoutes";

export const selectProvinceList = createSelector(
  [
    (state: RootState) => state.province.entities,
    (state: RootState) => state.province.offlineQueueVersion,
  ],
  (entities): ProvinceRecord[] => {
    const rows = Object.values(entities ?? {}).filter(
      (row): row is ProvinceRecord => Boolean(row)
    );
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    offlineSyncService
      .getQueueSnapshot()
      .filter((item) => item.method === "post" && item.resourceUrl === PROVINCES && item.tempId)
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

export const selectProvinceStatus = (state: RootState) => state.province.apiStatus;
export const selectProvinceNextId = (state: RootState) => state.province.nextId;
export const selectProvinceCurrentRecord = (state: RootState) => state.province.currentRecord;
export const selectProvinceIsNewMode = (state: RootState) => state.province.isNewMode;
export const selectProvinceIsEditing = (state: RootState) => state.province.isEditing;
export const selectProvinceIsIdLoading = (state: RootState) => state.province.isIdLoading;
export const selectProvinceApiError = (state: RootState) => state.province.apiError;
export const selectProvinceApiStatus = (state: RootState) => state.province.apiStatus;
export const selectProvinceIsSubmitting = (state: RootState) => state.province.isSubmitting;
export const selectProvinceIsLookingUp = (state: RootState) => state.province.isLookingUp;
export const selectProvinceListStatus = (state: RootState) => state.province.listStatus;
export const selectProvinceListError = (state: RootState) => state.province.listError;
export const selectProvincePagination = (state: RootState) => state.province.pagination;
export const selectProvincesStatus = (state: RootState) => state.province.listStatus;

export const selectProvinceOptionsMerged = (state: RootState) => {
  const merged = new Map<string, { label: string; value: string; _offlinePending?: boolean }>();

  Object.values(state.province.entities ?? {}).forEach((province) => {
    if (province && province.id != null) {
      merged.set(String(province.id), {
        label: String(province.name ?? province.id),
        value: String(province.id),
        _offlinePending: Boolean(province._offlinePending),
      });
    }
  });

  (state.province.pendingOptions ?? []).forEach((option) => {
    merged.set(option.value, option);
  });

  (state.city.provinceOptions ?? []).forEach((option) => {
    merged.set(option.value, option);
  });

  return Array.from(merged.values());
};
