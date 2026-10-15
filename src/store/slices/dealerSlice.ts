import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { DEALERS } from "@/utils/apiRoutes";
import { createOfflineThunks, type Pagination } from "@/utils/createofflinethunks";
import type { DealerFormValues } from "@/validations/master";

export type DealerRecord = {
    id: number | string;
    dealarShipName: string;
    contactNo: string;
    address: string;
    saleTaxNo: string;
    NTNNo: string;
    name: string;
    provinceId: number | string;
    cityId: number | string;
    mobileNo: string;
    opeaningBalance: number | string;
    dealarType: string;
    NICNo: string;
    _offlinePending?: boolean;
    tempId?: string;
};

type DealerState = {
    list: DealerRecord[];
    listStatus: "idle" | "loading" | "succeeded" | "failed";
    listError: string | null;
    pagination: Pagination;
    nextId: string;
    isNewMode: boolean;
    isEditing: boolean;
    isIdLoading: boolean;
    isSubmitting: boolean;
    isLookingUp: boolean;
    currentRecord: DealerRecord | null;
    apiError: string | null;
};

const initialState: DealerState = {
    list: [],
    listStatus: "idle",
    listError: null,
    pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    nextId: "",
    isNewMode: true,
    isEditing: true,
    isIdLoading: true,
    isSubmitting: false,
    isLookingUp: false,
    currentRecord: null,
    apiError: null,
};

/* ---------------- Thunks ----------------
 * All online/offline logic lives in createOfflineThunks.
 * Here we only say WHICH fields a dealer sends to the server.
 */
const dealerThunks = createOfflineThunks<DealerRecord, DealerFormValues>({
    name: "dealer",
    url: DEALERS,
    label: "dealer",
    tempEntity: "dealer",
    // Province / city may be records that were also created offline (temp ids)
    tempRefs: { provinceId: "_tempProvinceId", cityId: "_tempCityId" },
    buildBody: (p) => ({
        dealarShipName: p.dealarShipName,
        contactNo: p.contactNo,
        address: p.address,
        saleTaxNo: p.saleTaxNo,
        NTNNo: p.NTNNo,
        name: p.name,
        provinceId: p.provinceId,
        cityId: p.cityId,
        mobileNo: p.mobileNo,
        opeaningBalance: p.opeaningBalance,
        dealarType: p.dealarType,
        NICNo: p.NICNo,
    }),
});

// Same export names as before, so the page and other files do not change
export const fetchDealerNextId = dealerThunks.fetchNextId;
export const fetchAllDealers = dealerThunks.fetchAll;
export const fetchDealerById = dealerThunks.fetchById;
export const createDealer = dealerThunks.create;
export const updateDealer = dealerThunks.update;

/* ---------------- Slice ---------------- */

export const dealerSlice = createSlice({
    name: "dealer",
    initialState,
    reducers: {
        setNewMode(state, action: PayloadAction<boolean>) {
            state.isNewMode = action.payload;
            if (action.payload) state.isEditing = true;
        },
        setEditing(state, action: PayloadAction<boolean>) {
            state.isEditing = action.payload;
        },
        setCurrentRecord(state, action: PayloadAction<DealerRecord | null>) {
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
        },
        setReconciledCityId(
            state,
            action: PayloadAction<{ tempId: string; realId: string | number }>
        ) {
            const { tempId, realId } = action.payload;
            state.list = state.list.map((row) =>
                String(row.cityId) === String(tempId) ? { ...row, cityId: realId } : row
            );
            if (state.currentRecord && String(state.currentRecord.cityId) === String(tempId)) {
                state.currentRecord = { ...state.currentRecord, cityId: realId };
            }
        },
        setReconciledProvinceId(
            state,
            action: PayloadAction<{ tempId: string; realId: string | number }>
        ) {
            const { tempId, realId } = action.payload;
            state.list = state.list.map((row) =>
                String(row.provinceId) === String(tempId) ? { ...row, provinceId: realId } : row
            );
            if (state.currentRecord && String(state.currentRecord.provinceId) === String(tempId)) {
                state.currentRecord = { ...state.currentRecord, provinceId: realId };
            }
        },
        setNextId(state, action: PayloadAction<string>) {
            state.nextId = action.payload;
            state.isIdLoading = false;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchDealerNextId.pending, (s) => { s.isIdLoading = true; })
            // Only stores the id. It must NOT switch to "new" mode here, because this thunk
            // also runs in the background when the network goes on/off (see Providers) and
            // would wipe the record the user is currently viewing or editing.
            // The page switches to new mode itself (startNewEntry).
            .addCase(fetchDealerNextId.fulfilled, (s, a) => {
                s.isIdLoading = false;
                s.nextId = a.payload.nextId;
            })
            .addCase(fetchDealerNextId.rejected, (s, a) => {
                s.isIdLoading = false;
                s.apiError = a.payload ?? "Unable to fetch the next dealer ID.";
            })

            .addCase(fetchAllDealers.pending, (s) => {
                s.listStatus = "loading";
                s.listError = null;
            })
            .addCase(fetchAllDealers.fulfilled, (s, a) => {
                s.listStatus = "succeeded";
                const incoming = a.payload.data || [];
                const pendingOffline = s.list.filter(
                    (item) => item._offlinePending || (item.id && String(item.id).startsWith("temp-"))
                );
                const mergedMap = new Map<string, DealerRecord>();
                pendingOffline.forEach((item) => mergedMap.set(String(item.id), item));
                incoming.forEach((item) => {
                    if (!mergedMap.has(String(item.id))) {
                        mergedMap.set(String(item.id), item);
                    }
                });
                s.list = Array.from(mergedMap.values());
                s.pagination = a.payload.pagination;
            })
            .addCase(fetchAllDealers.rejected, (s, a) => {
                s.listStatus = "failed";
                s.listError = a.payload ?? "Failed to load dealers";
            })

            .addCase(fetchDealerById.pending, (s) => { s.isLookingUp = true; })
            .addCase(fetchDealerById.fulfilled, (s, a) => {
                s.isLookingUp = false;
                s.currentRecord = a.payload;
                s.isNewMode = false;
                s.isEditing = false;
            })
            .addCase(fetchDealerById.rejected, (s, a) => {
                s.isLookingUp = false;
                s.currentRecord = null;
                s.isNewMode = true;
                s.isEditing = true;
                if (a.payload && !String(a.payload).includes("not found")) {
                    s.apiError = a.payload;
                }
            })

            .addCase(createDealer.pending, (s) => { s.isSubmitting = true; s.apiError = null; })
            .addCase(createDealer.fulfilled, (s, a) => {
                s.isSubmitting = false;
                if (a.payload?.data) {
                    const item = a.payload.data;
                    const exists = s.list.some(
                        (r) => String(r.id) === String(item.id) || (item.tempId && String(r.tempId) === String(item.tempId))
                    );
                    if (!exists) {
                        s.list.unshift(item);
                    }
                }
            })
            .addCase(createDealer.rejected, (s, a) => {
                s.isSubmitting = false;
                s.apiError = a.payload ?? "Failed to save dealer";
            })

            .addCase(updateDealer.pending, (s) => { s.isSubmitting = true; s.apiError = null; })
            .addCase(updateDealer.fulfilled, (s) => {
                s.isSubmitting = false;
                s.isEditing = false;
                s.currentRecord = null;
            })
            .addCase(updateDealer.rejected, (s, a) => {
                s.isSubmitting = false;
                s.apiError = a.payload ?? "Failed to update dealer";
            });
    },
});

export const {
    setNewMode, setEditing, setCurrentRecord, resetForm, clearApiError,
    setReconciledId, setReconciledCityId, setReconciledProvinceId, setNextId,
} = dealerSlice.actions;

export default dealerSlice.reducer;