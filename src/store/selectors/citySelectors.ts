import type { RootState } from "@/store";

export const selectCityList = (state: RootState) => state.city.list;
export const selectCityStatus = (state: RootState) => state.city.listStatus;
export const selectCityNextId = (state: RootState) => state.city.nextId;
export const selectCityCurrentRecord = (state: RootState) => state.city.currentRecord;
export const selectCityIsNewMode = (state: RootState) => state.city.isNewMode;
export const selectCityIsEditing = (state: RootState) => state.city.isEditing;
export const selectCityIsIdLoading = (state: RootState) => state.city.isIdLoading;
export const selectCityIsLookingUp = (state: RootState) => state.city.isLookingUp;
export const selectCityApiError = (state: RootState) => state.city.apiError;
export const selectCityApiStatus = (state: RootState) => state.city.listStatus;
export const selectCityIsSubmitting = (state: RootState) => state.city.isSubmitting;
export const selectCityListStatus = (state: RootState) => state.city.listStatus;
export const selectCityListError = (state: RootState) => state.city.listError;
export const selectCityPagination = (state: RootState) => state.city.pagination;

export const selectCityOptionsByProvince = (
  state: RootState,
  provinceId: string
): Array<{ label: string; value: string; _offlinePending?: boolean }> =>
  (state.city.list ?? [])
    .filter((city) => String(city.provinceId) === String(provinceId))
    .map((city) => ({
      label: city._offlinePending ? `${city.name} (Pending)` : city.name,
      value: String(city.id),
      _offlinePending: city._offlinePending,
    }));
