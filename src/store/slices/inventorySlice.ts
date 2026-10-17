import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { INVENTORY } from "@/utils/apiRoutes";
import { createOfflineThunks, type Pagination } from "@/utils/createofflinethunks";
import { isTempId } from "@/utils/tempId";
import type { InventoryFormValues } from "@/validations/master";

export type InventoryRecord = {
    id: number | string;
    itemName: string;
    categoryId: number | string;
    departmentId: number | string;
    pack: number | string;
    rate: number | string;
    unitPerBike: number | string;
    stationIds?: (number | string)[];
    color?: string[];
    qty?: (number | string)[];
    category?: { id: number; name: string };
    department?: { id: number; name: string };
    _offlinePending?: boolean;
    tempId?: string;
};

type InventoryState = {
    list: InventoryRecord[];
    listStatus: "idle" | "loading" | "succeeded" | "failed";
    listError: string | null;
    pagination: Pagination;
    nextId: string;
    isNewMode: boolean;
    isEditing: boolean;
    isIdLoading: boolean;
    isSubmitting: boolean;
    isLookingUp: boolean;
    currentRecord: InventoryRecord | null;
    apiError: string | null;
};

const initialState: InventoryState = {
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
const inventoryThunks = createOfflineThunks<InventoryRecord, InventoryFormValues>({
    name: "inventory",
    url: INVENTORY,
    label: "inventory",
    tempEntity: "inv",
    tempRefs: { categoryId: "_tempCategoryId", departmentId: "_tempDepartmentId" },
    buildBody: (p) => {
        const rows = (p.colorRows || []).filter((r) => r.stationId || r.color || r.qty);
        return {
            itemName: p.itemName,
            categoryId: isTempId(String(p.categoryId)) ? p.categoryId : Number(p.categoryId),
            departmentId: isTempId(String(p.departmentId)) ? p.departmentId : Number(p.departmentId),
            pack: Number(p.pack),
            rate: Number(p.rate),
            unitPerBike: Number(p.unitPerBike),
            stationIds: rows
                .map((r) => (r.stationId ? (isTempId(String(r.stationId)) ? String(r.stationId) : Number(r.stationId)) : 0))
                .filter(Boolean),
            color: rows.map((r) => r.color || ""),
            qty: rows.map((r) => (r.qty ? Number(r.qty) : 0)),
        };
    },
});

export const fetchInventoryNextId = inventoryThunks.fetchNextId;
export const fetchAllInventories = inventoryThunks.fetchAll;
export const fetchInventoryById = inventoryThunks.fetchById;
export const createInventory = inventoryThunks.create;
export const updateInventory = inventoryThunks.update;

/* ---------------- Slice ---------------- */

export const inventorySlice = createSlice({
    name: "inventory",
    initialState,
    reducers: {
        setNewMode(state, action: PayloadAction<boolean>) {
            state.isNewMode = action.payload;
            if (action.payload) state.isEditing = true;
        },
        setEditing(state, action: PayloadAction<boolean>) {
            state.isEditing = action.payload;
        },
        setCurrentRecord(state, action: PayloadAction<InventoryRecord | null>) {
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
            action: PayloadAction<{ tempId: string; realId: string | number; resourceUrl?: string }>
        ) {
            const { tempId, realId } = action.payload;

            state.list = state.list.map((row) => {
                let updated = { ...row };
                if (String(row.id) === String(tempId) || String(row.tempId) === String(tempId)) {
                    updated = { ...updated, id: realId, _offlinePending: false, tempId: undefined };
                }
                if (String(row.categoryId) === String(tempId)) {
                    updated = { ...updated, categoryId: realId };
                }
                if (String(row.departmentId) === String(tempId)) {
                    updated = { ...updated, departmentId: realId };
                }
                if (row.stationIds && Array.isArray(row.stationIds)) {
                    updated = {
                        ...updated,
                        stationIds: row.stationIds.map((s) => (String(s) === String(tempId) ? realId : s)),
                    };
                }
                return updated;
            });

            if (state.currentRecord) {
                let updatedCurrent = { ...state.currentRecord };
                if (String(state.currentRecord.id) === String(tempId)) {
                    updatedCurrent = { ...updatedCurrent, id: realId, _offlinePending: false };
                }
                if (String(state.currentRecord.categoryId) === String(tempId)) {
                    updatedCurrent = { ...updatedCurrent, categoryId: realId };
                }
                if (String(state.currentRecord.departmentId) === String(tempId)) {
                    updatedCurrent = { ...updatedCurrent, departmentId: realId };
                }
                if (updatedCurrent.stationIds && Array.isArray(updatedCurrent.stationIds)) {
                    updatedCurrent = {
                        ...updatedCurrent,
                        stationIds: updatedCurrent.stationIds.map((s) => (String(s) === String(tempId) ? realId : s)),
                    };
                }
                state.currentRecord = updatedCurrent;
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
            .addCase(fetchInventoryNextId.pending, (state) => {
                state.isIdLoading = true;
                state.apiError = null;
            })
            .addCase(fetchInventoryNextId.fulfilled, (state, action) => {
                state.isIdLoading = false;
                state.nextId = action.payload.nextId;
            })
            .addCase(fetchInventoryNextId.rejected, (state, action) => {
                state.isIdLoading = false;
                state.apiError = action.payload || "Failed to fetch next ID";
            })

            // Fetch All
            .addCase(fetchAllInventories.pending, (state) => {
                state.listStatus = "loading";
                state.listError = null;
            })
            .addCase(fetchAllInventories.fulfilled, (state, action) => {
                state.listStatus = "succeeded";
                const incoming = action.payload.data || [];
                const pendingOffline = state.list.filter(
                    (item) => item._offlinePending || (item.id && String(item.id).startsWith("temp-"))
                );
                const mergedMap = new Map<string, InventoryRecord>();
                pendingOffline.forEach((item) => mergedMap.set(String(item.id), item));
                incoming.forEach((item) => {
                    if (!mergedMap.has(String(item.id))) {
                        mergedMap.set(String(item.id), item);
                    }
                });
                state.list = Array.from(mergedMap.values());
                state.pagination = action.payload.pagination;
            })
            .addCase(fetchAllInventories.rejected, (state, action) => {
                state.listStatus = "failed";
                state.listError = action.payload || "Failed to fetch inventories";
            })

            // Fetch By ID
            .addCase(fetchInventoryById.pending, (state) => {
                state.isLookingUp = true;
                state.apiError = null;
            })
            .addCase(fetchInventoryById.fulfilled, (state, action) => {
                state.isLookingUp = false;
                state.currentRecord = action.payload;
                state.isNewMode = false;
                state.isEditing = false;
            })
            .addCase(fetchInventoryById.rejected, (state, action) => {
                state.isLookingUp = false;
                state.currentRecord = null;
                state.isNewMode = true;
                state.isEditing = true;
                if (action.payload && !String(action.payload).includes("not found")) {
                    state.apiError = action.payload;
                }
            })

            // Create
            .addCase(createInventory.pending, (state) => {
                state.isSubmitting = true;
                state.apiError = null;
            })
            .addCase(createInventory.fulfilled, (state, action) => {
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
            .addCase(createInventory.rejected, (state, action) => {
                state.isSubmitting = false;
                state.apiError = action.payload || "Failed to create inventory item";
            })

            // Update
            .addCase(updateInventory.pending, (state) => {
                state.isSubmitting = true;
                state.apiError = null;
            })
            .addCase(updateInventory.fulfilled, (state, action) => {
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
            .addCase(updateInventory.rejected, (state, action) => {
                state.isSubmitting = false;
                state.apiError = action.payload || "Failed to update inventory item";
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
} = inventorySlice.actions;

export const inventoryReducer = inventorySlice.reducer;
export default inventorySlice.reducer;
