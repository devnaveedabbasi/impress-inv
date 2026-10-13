import type { RootState } from "@/store";
import type { CityRecord } from "@/store/slices/citySlice";
import { createSelector } from "@reduxjs/toolkit";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { CITIES } from "@/utlis/apiRoutes";

export const selectCityList = createSelector(
  [
    (state: RootState) => state.city.entities,
    (state: RootState) => state.city.offlineQueueVersion,
  ],
  (entities): CityRecord[] => {
    const rows = Object.values(entities ?? {}).filter(
      (row): row is CityRecord => Boolean(row)
    );
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    offlineSyncService
      .getQueueSnapshot()
      .filter((item) => item.method === "post" && item.resourceUrl === CITIES && item.tempId)
      .forEach((item) => {
        const data = (item.data ?? {}) as Record<string, unknown>;
        const id = String(item.tempId);
        if (!byId.has(id)) {
          byId.set(id, {
            id,
            name: String(data.name ?? ""),
            provinceId: String(data.provinceId ?? ""),
            tempId: id,
            _offlinePending: true,
          });
        }
      });
    return Array.from(byId.values());
  }
);

export const selectCityStatus = (state: RootState) => state.city.apiStatus;
export const selectCityNextId = (state: RootState) => state.city.nextId;
export const selectCityCurrentRecord = (state: RootState) => state.city.currentRecord;
export const selectCityIsNewMode = (state: RootState) => state.city.isNewMode;
export const selectCityIsEditing = (state: RootState) => state.city.isEditing;
export const selectCityIsIdLoading = (state: RootState) => state.city.isIdLoading;
export const selectCityApiError = (state: RootState) => state.city.apiError;
export const selectCityApiStatus = (state: RootState) => state.city.apiStatus;
export const selectCityIsSubmitting = (state: RootState) => state.city.isSubmitting;
export const selectCityListStatus = (state: RootState) => state.city.listStatus;
export const selectCityListError = (state: RootState) => state.city.listError;
export const selectCityPagination = (state: RootState) => state.city.pagination;
