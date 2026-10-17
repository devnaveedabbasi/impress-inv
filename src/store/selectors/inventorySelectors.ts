import type { RootState } from "@/store";

export const selectInventoryForm = (state: RootState) => ({
    currentRecord: state.inventory.currentRecord,
    isNewMode: state.inventory.isNewMode,
    isEditing: state.inventory.isEditing,
    isIdLoading: state.inventory.isIdLoading,
    isLookingUp: state.inventory.isLookingUp,
    nextId: state.inventory.nextId,
    apiError: state.inventory.apiError,
    apiStatus: state.inventory.listStatus,
});

export const selectInventoryList = (state: RootState) => state.inventory.list;
export const selectInventoryStatus = (state: RootState) => state.inventory.listStatus;
export const selectInventoryNextId = (state: RootState) => state.inventory.nextId;
export const selectInventoryCurrentRecord = (state: RootState) => state.inventory.currentRecord;
export const selectInventoryIsNewMode = (state: RootState) => state.inventory.isNewMode;
export const selectInventoryIsEditing = (state: RootState) => state.inventory.isEditing;
export const selectInventoryIsIdLoading = (state: RootState) => state.inventory.isIdLoading;
export const selectInventoryApiError = (state: RootState) => state.inventory.apiError;
export const selectInventoryApiStatus = (state: RootState) => state.inventory.listStatus;
export const selectInventoryIsSubmitting = (state: RootState) => state.inventory.isSubmitting;
export const selectInventoryIsLookingUp = (state: RootState) => state.inventory.isLookingUp;
export const selectInventoryListStatus = (state: RootState) => state.inventory.listStatus;
export const selectInventoryListError = (state: RootState) => state.inventory.listError;
export const selectInventoryPagination = (state: RootState) => state.inventory.pagination;

export const selectInventoryOptions = (state: RootState) =>
    state.inventory.list.map((inv) => ({
        label: inv.itemName,
        value: String(inv.id),
        _offlinePending: inv._offlinePending,
    }));
