import type { RootState } from "@/store";

export const selectVendorForm = (state: RootState) => ({
    currentRecord: state.vendor.currentRecord,
    isNewMode: state.vendor.isNewMode,
    isEditing: state.vendor.isEditing,
    isIdLoading: state.vendor.isIdLoading,
    isLookingUp: state.vendor.isLookingUp,
    nextId: state.vendor.nextId,
    apiError: state.vendor.apiError,
    apiStatus: state.vendor.listStatus,
});

export const selectVendorList = (state: RootState) => state.vendor.list;
export const selectVendorStatus = (state: RootState) => state.vendor.listStatus;
export const selectVendorNextId = (state: RootState) => state.vendor.nextId;
export const selectVendorCurrentRecord = (state: RootState) => state.vendor.currentRecord;
export const selectVendorIsNewMode = (state: RootState) => state.vendor.isNewMode;
export const selectVendorIsEditing = (state: RootState) => state.vendor.isEditing;
export const selectVendorIsIdLoading = (state: RootState) => state.vendor.isIdLoading;
export const selectVendorApiError = (state: RootState) => state.vendor.apiError;
export const selectVendorApiStatus = (state: RootState) => state.vendor.listStatus;
export const selectVendorIsSubmitting = (state: RootState) => state.vendor.isSubmitting;
export const selectVendorIsLookingUp = (state: RootState) => state.vendor.isLookingUp;
export const selectVendorListStatus = (state: RootState) => state.vendor.listStatus;
export const selectVendorListError = (state: RootState) => state.vendor.listError;
export const selectVendorPagination = (state: RootState) => state.vendor.pagination;

export const selectVendorOptions = (state: RootState) =>
    state.vendor.list.map((v) => ({
        label: v.vendorName,
        value: String(v.id),
        _offlinePending: v._offlinePending,
    }));
