import type { RootState } from "@/store";

export const selectStationState = (s: RootState) => s.station;

export const selectStationList = (s: RootState) => s.station.list;
export const selectStationListStatus = (s: RootState) => s.station.listStatus;
export const selectStationListError = (s: RootState) => s.station.listError;
export const selectStationPagination = (s: RootState) => s.station.pagination;

export const selectStationNextId = (s: RootState) => s.station.nextId;
export const selectStationIsNewMode = (s: RootState) => s.station.isNewMode;
export const selectStationIsEditing = (s: RootState) => s.station.isEditing;
export const selectStationIsIdLoading = (s: RootState) => s.station.isIdLoading;
export const selectStationIsSubmitting = (s: RootState) => s.station.isSubmitting;
export const selectStationIsLookingUp = (s: RootState) => s.station.isLookingUp;
export const selectStationCurrentRecord = (s: RootState) => s.station.currentRecord;
export const selectStationApiError = (s: RootState) => s.station.apiError;