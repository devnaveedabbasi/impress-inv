import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { VENDORS } from "@/utils/apiRoutes";
import { createOfflineThunks, type Pagination } from "@/utils/createofflinethunks";
import type { VendorFormValues } from "@/validations/master";

export type VendorRecord = {
    id: number | string;
    vendorName: string;
    address: string;
    provinceId: number | string;
    cityId: number | string;
    contactNo: string;
    saleTaxNo: string;
    NICNo: string;
    mobileNo: string;
    daysLimit: number | string;
    amoutLimit: number | string;
    NTNNo: string;
    openingBalance: number | string;
    CNICNo: string;
    _offlinePending?: boolean;
    tempId?: string;
    city?: { id: number; name: string };
    province?: { id: number; name: string };
};

type VendorState = {
    list: VendorRecord[];
    listStatus: "idle" | "loading" | "succeeded" | "failed";
    listError: string | null;
    pagination: Pagination;
    nextId: string;
    isNewMode: boolean;
    isEditing: boolean;
    isIdLoading: boolean;
    isSubmitting: boolean;
    isLookingUp: boolean;
    currentRecord: VendorRecord | null;
    apiError: string | null;
};

const initialState: VendorState = {
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
const vendorThunks = createOfflineThunks<VendorRecord, VendorFormValues>({
    name: "vendor",
    url: VENDORS,
    label: "vendor",
    tempEntity: "vendor",
    tempRefs: { provinceId: "_tempProvinceId", cityId: "_tempCityId" },
    buildBody: (p) => ({
        vendorName: p.vendorName,
        address: p.address,
        provinceId: p.provinceId,
        cityId: p.cityId,
        contactNo: p.contactNo,
        saleTaxNo: p.saleTaxNo,
        NICNo: p.NICNo,
        mobileNo: p.mobileNo,
        daysLimit: Number(p.daysLimit),
        amoutLimit: Number(p.amoutLimit),
        NTNNo: p.NTNNo,
        openingBalance: Number(p.openingBalance),
        CNICNo: p.CNICNo,
    }),
});

export const fetchVendorNextId = vendorThunks.fetchNextId;
export const fetchAllVendors = vendorThunks.fetchAll;
export const fetchVendorById = vendorThunks.fetchById;
export const createVendor = vendorThunks.create;
export const updateVendor = vendorThunks.update;

/* ---------------- Slice ---------------- */

export const vendorSlice = createSlice({
    name: "vendor",
    initialState,
    reducers: {
        setNewMode(state, action: PayloadAction<boolean>) {
            state.isNewMode = action.payload;
            if (action.payload) state.isEditing = true;
        },
        setEditing(state, action: PayloadAction<boolean>) {
            state.isEditing = action.payload;
        },
        setCurrentRecord(state, action: PayloadAction<VendorRecord | null>) {
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
                if (String(row.provinceId) === String(tempId)) {
                    updated = { ...updated, provinceId: realId };
                }
                if (String(row.cityId) === String(tempId)) {
                    updated = { ...updated, cityId: realId };
                }
                return updated;
            });

            if (state.currentRecord) {
                let updatedCurrent = { ...state.currentRecord };
                if (String(state.currentRecord.id) === String(tempId)) {
                    updatedCurrent = { ...updatedCurrent, id: realId, _offlinePending: false };
                }
                if (String(state.currentRecord.provinceId) === String(tempId)) {
                    updatedCurrent = { ...updatedCurrent, provinceId: realId };
                }
                if (String(state.currentRecord.cityId) === String(tempId)) {
                    updatedCurrent = { ...updatedCurrent, cityId: realId };
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
            .addCase(fetchVendorNextId.pending, (state) => {
                state.isIdLoading = true;
                state.apiError = null;
            })
            .addCase(fetchVendorNextId.fulfilled, (state, action) => {
                state.isIdLoading = false;
                state.nextId = action.payload.nextId;
            })
            .addCase(fetchVendorNextId.rejected, (state, action) => {
                state.isIdLoading = false;
                state.apiError = action.payload || "Failed to fetch next ID";
            })

            // Fetch All
            .addCase(fetchAllVendors.pending, (state) => {
                state.listStatus = "loading";
                state.listError = null;
            })
            .addCase(fetchAllVendors.fulfilled, (state, action) => {
                state.listStatus = "succeeded";
                const incoming = action.payload.data || [];
                const pendingOffline = state.list.filter(
                    (item) => item._offlinePending || (item.id && String(item.id).startsWith("temp-"))
                );
                const mergedMap = new Map<string, VendorRecord>();
                pendingOffline.forEach((item) => mergedMap.set(String(item.id), item));
                incoming.forEach((item) => {
                    if (!mergedMap.has(String(item.id))) {
                        mergedMap.set(String(item.id), item);
                    }
                });
                state.list = Array.from(mergedMap.values());
                state.pagination = action.payload.pagination;
            })
            .addCase(fetchAllVendors.rejected, (state, action) => {
                state.listStatus = "failed";
                state.listError = action.payload || "Failed to fetch vendors";
            })

            // Fetch By ID
            .addCase(fetchVendorById.pending, (state) => {
                state.isLookingUp = true;
                state.apiError = null;
            })
            .addCase(fetchVendorById.fulfilled, (state, action) => {
                state.isLookingUp = false;
                state.currentRecord = action.payload;
                state.isNewMode = false;
                state.isEditing = false;
            })
            .addCase(fetchVendorById.rejected, (state, action) => {
                state.isLookingUp = false;
                state.currentRecord = null;
                state.isNewMode = true;
                state.isEditing = true;
                if (action.payload && !String(action.payload).includes("not found")) {
                    state.apiError = action.payload;
                }
            })

            // Create
            .addCase(createVendor.pending, (state) => {
                state.isSubmitting = true;
                state.apiError = null;
            })
            .addCase(createVendor.fulfilled, (state, action) => {
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
            .addCase(createVendor.rejected, (state, action) => {
                state.isSubmitting = false;
                state.apiError = action.payload || "Failed to create vendor";
            })

            // Update
            .addCase(updateVendor.pending, (state) => {
                state.isSubmitting = true;
                state.apiError = null;
            })
            .addCase(updateVendor.fulfilled, (state, action) => {
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
            .addCase(updateVendor.rejected, (state, action) => {
                state.isSubmitting = false;
                state.apiError = action.payload || "Failed to update vendor";
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
} = vendorSlice.actions;

export const vendorReducer = vendorSlice.reducer;
export default vendorSlice.reducer;
