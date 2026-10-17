import type { RootState } from "@/store";

export const selectDepartmentForm = (state: RootState) => ({
    currentRecord: state.department.currentRecord,
    isNewMode: state.department.isNewMode,
    isEditing: state.department.isEditing,
    isIdLoading: state.department.isIdLoading,
    isLookingUp: state.department.isLookingUp,
    nextId: state.department.nextId,
    apiError: state.department.apiError,
    apiStatus: state.department.listStatus,
});

export const selectDepartmentList = (state: RootState) => state.department.list;
export const selectDepartmentStatus = (state: RootState) => state.department.listStatus;
export const selectDepartmentNextId = (state: RootState) => state.department.nextId;
export const selectDepartmentCurrentRecord = (state: RootState) => state.department.currentRecord;
export const selectDepartmentIsNewMode = (state: RootState) => state.department.isNewMode;
export const selectDepartmentIsEditing = (state: RootState) => state.department.isEditing;
export const selectDepartmentIsIdLoading = (state: RootState) => state.department.isIdLoading;
export const selectDepartmentApiError = (state: RootState) => state.department.apiError;
export const selectDepartmentApiStatus = (state: RootState) => state.department.listStatus;
export const selectDepartmentIsSubmitting = (state: RootState) => state.department.isSubmitting;
export const selectDepartmentIsLookingUp = (state: RootState) => state.department.isLookingUp;
export const selectDepartmentListStatus = (state: RootState) => state.department.listStatus;
export const selectDepartmentListError = (state: RootState) => state.department.listError;
export const selectDepartmentPagination = (state: RootState) => state.department.pagination;

export const selectDepartmentOptions = (state: RootState) =>
    state.department.list.map((dept) => ({
        label: dept.name,
        value: String(dept.id),
        _offlinePending: dept._offlinePending,
    }));
