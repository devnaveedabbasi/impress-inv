import type { RootState } from "@/store";

export const selectDealerList = (s: RootState) => s.dealer.list;
export const selectDealerListStatus = (s: RootState) => s.dealer.listStatus;
export const selectDealerListError = (s: RootState) => s.dealer.listError;
export const selectDealerPagination = (s: RootState) => s.dealer.pagination;
export const selectDealerNextId = (s: RootState) => s.dealer.nextId;
export const selectDealerIsNewMode = (s: RootState) => s.dealer.isNewMode;
export const selectDealerIsEditing = (s: RootState) => s.dealer.isEditing;
export const selectDealerIsIdLoading = (s: RootState) => s.dealer.isIdLoading;
export const selectDealerIsSubmitting = (s: RootState) => s.dealer.isSubmitting;
export const selectDealerIsLookingUp = (s: RootState) => s.dealer.isLookingUp;
export const selectDealerCurrentRecord = (s: RootState) => s.dealer.currentRecord;
export const selectDealerApiError = (s: RootState) => s.dealer.apiError;