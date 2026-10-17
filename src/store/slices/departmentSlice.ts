import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { DEPARTMENTS } from "@/utils/apiRoutes";
import { createOfflineThunks, type Pagination } from "@/utils/createofflinethunks";
import type { DepartmentFormValues } from "@/validations/master";

export type DepartmentRecord = {
    id: number | string;
    name: string;
    _offlinePending?: boolean;
    tempId?: string;
};

type DepartmentState = {
    list: DepartmentRecord[];
    listStatus: "idle" | "loading" | "succeeded" | "failed";
    listError: string | null;
    pagination: Pagination;
    nextId: string;
    isNewMode: boolean;
    isEditing: boolean;
    isIdLoading: boolean;
    isSubmitting: boolean;
    isLookingUp: boolean;
    currentRecord: DepartmentRecord | null;
    apiError: string | null;
};

const initialState: DepartmentState = {
    list: [],
    listStatus: "idle",
    listError: null,
    pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    nextId: "",
    isNewMode: true,
    isEditing: true,
    isIdLoading: false,
    isSubmitting: false,
    isLookingUp: false,
    currentRecord: null,
    apiError: null,
};

/* ---------------- Thunks ---------------- */
const departmentThunks = createOfflineThunks<DepartmentRecord, DepartmentFormValues>({
    name: "department",
    url: DEPARTMENTS,
    label: "department",
    tempEntity: "dept",
    buildBody: (p) => ({
        name: p.name,
    }),
});

export const fetchDepartmentNextId = departmentThunks.fetchNextId;
export const fetchAllDepartments = departmentThunks.fetchAll;
export const fetchDepartmentById = departmentThunks.fetchById;
export const createDepartment = departmentThunks.create;
export const updateDepartment = departmentThunks.update;

/* ---------------- Slice ---------------- */

export const departmentSlice = createSlice({
    name: "department",
    initialState,
    reducers: {
        setNewMode(state, action: PayloadAction<boolean>) {
            state.isNewMode = action.payload;
            if (action.payload) state.isEditing = true;
        },
        setEditing(state, action: PayloadAction<boolean>) {
            state.isEditing = action.payload;
        },
        setCurrentRecord(state, action: PayloadAction<DepartmentRecord | null>) {
            state.currentRecord = action.payload;
        },
        resetForm(state) {
            state.isNewMode = true;
            state.isEditing = true;
            state.currentRecord = null;
        },
        clearApiError(state) {
            state.apiError = null;
        },
        setReconciledId(
            state,
            action: PayloadAction<{ tempId: string; realId: string | number }>
        ) {
            const { tempId, realId } = action.payload;

            state.list = state.list.map((row) =>
                String(row.id) === String(tempId) || String(row.tempId) === String(tempId)
                    ? { ...row, id: realId, _offlinePending: false, tempId: undefined }
                    : row
            );

            if (state.currentRecord && String(state.currentRecord.id) === String(tempId)) {
                state.currentRecord = { ...state.currentRecord, id: realId, _offlinePending: false };
            }
            if (String(state.nextId) === String(tempId)) {
                state.nextId = String(Number(realId) + 1);
            }
        },
        setNextId(state, action: PayloadAction<string>) {
            state.nextId = action.payload;
            state.isIdLoading = false;
        },
    },
    extraReducers: (builder) => {
        builder
            // Next ID
            .addCase(fetchDepartmentNextId.pending, (state) => {
                state.isIdLoading = true;
                state.apiError = null;
            })
            .addCase(fetchDepartmentNextId.fulfilled, (state, action) => {
                state.isIdLoading = false;
                state.nextId = action.payload.nextId;
            })
            .addCase(fetchDepartmentNextId.rejected, (state, action) => {
                state.isIdLoading = false;
                state.apiError = action.payload || "Failed to fetch next ID";
            })

            // Fetch All
            .addCase(fetchAllDepartments.pending, (state) => {
                state.listStatus = "loading";
                state.listError = null;
            })
            .addCase(fetchAllDepartments.fulfilled, (state, action) => {
                state.listStatus = "succeeded";
                const incoming = action.payload.data || [];
                const pendingOffline = state.list.filter(
                    (item) => item._offlinePending || (item.id && String(item.id).startsWith("temp-"))
                );
                const mergedMap = new Map<string, DepartmentRecord>();
                pendingOffline.forEach((item) => mergedMap.set(String(item.id), item));
                incoming.forEach((item) => {
                    if (!mergedMap.has(String(item.id))) {
                        mergedMap.set(String(item.id), item);
                    }
                });
                state.list = Array.from(mergedMap.values());
                state.pagination = action.payload.pagination;
            })
            .addCase(fetchAllDepartments.rejected, (state, action) => {
                state.listStatus = "failed";
                state.listError = action.payload || "Failed to fetch departments";
            })

            // Fetch By ID
            .addCase(fetchDepartmentById.pending, (state) => {
                state.isLookingUp = true;
                state.apiError = null;
            })
            .addCase(fetchDepartmentById.fulfilled, (state, action) => {
                state.isLookingUp = false;
                state.currentRecord = action.payload;
                state.isNewMode = false;
                state.isEditing = false;
            })
            .addCase(fetchDepartmentById.rejected, (state, action) => {
                state.isLookingUp = false;
                state.currentRecord = null;
                state.isNewMode = true;
                state.isEditing = true;
                if (action.payload && !String(action.payload).includes("not found")) {
                    state.apiError = action.payload;
                }
            })

            // Create
            .addCase(createDepartment.pending, (state) => {
                state.isSubmitting = true;
                state.apiError = null;
            })
            .addCase(createDepartment.fulfilled, (state, action) => {
                state.isSubmitting = false;
                const newRecord = action.payload.data;
                const existingIndex = state.list.findIndex(
                    (r) => String(r.id) === String(newRecord.id) || (newRecord.tempId && String(r.id) === String(newRecord.tempId))
                );
                if (existingIndex >= 0) {
                    state.list[existingIndex] = newRecord;
                } else {
                    state.list.unshift(newRecord);
                }
            })
            .addCase(createDepartment.rejected, (state, action) => {
                state.isSubmitting = false;
                state.apiError = action.payload || "Failed to create department";
            })

            // Update
            .addCase(updateDepartment.pending, (state) => {
                state.isSubmitting = true;
                state.apiError = null;
            })
            .addCase(updateDepartment.fulfilled, (state, action) => {
                state.isSubmitting = false;
                const updated = action.payload.data;
                const index = state.list.findIndex(
                    (r) => String(r.id) === String(updated.id) || (updated.tempId && String(r.id) === String(updated.tempId))
                );
                if (index >= 0) {
                    state.list[index] = updated;
                }
                if (state.currentRecord && String(state.currentRecord.id) === String(updated.id)) {
                    state.currentRecord = updated;
                }
            })
            .addCase(updateDepartment.rejected, (state, action) => {
                state.isSubmitting = false;
                state.apiError = action.payload || "Failed to update department";
            });
    },
});

export const {
    setNewMode,
    setEditing,
    setCurrentRecord,
    resetForm,
    clearApiError,
    setReconciledId,
    setNextId,
} = departmentSlice.actions;

export const departmentReducer = departmentSlice.reducer;
export default departmentSlice.reducer;
