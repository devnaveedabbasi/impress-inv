import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import axios from "axios";
import api from "@/lib/axios";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { DEALERS } from "@/utlis/apiRoutes";
import { generateTempId, isTempId } from "@/store/utils/tempId";
import { isOffline } from "@/store/utils/network";
import type { DealerFormValues } from "@/lib/validations/master";

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

type Pagination = { page: number; limit: number; total: number; totalPages: number };

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
    offlineQueueVersion: number;
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
    offlineQueueVersion: 0,
};

/* ---------------- Thunks ---------------- */

export const fetchDealerNextId = createAsyncThunk<
    { nextId: string },
    void,
    { rejectValue: string }
>("dealer/fetchNextId", async (_, { rejectWithValue }) => {
    if (isOffline()) {
        const suggested = await offlineSyncService.getSuggestedNextId(DEALERS);
        return { nextId: suggested };
    }
    try {
        const res = await api.get(`${DEALERS}/next-id`, {
            params: { _t: Date.now() },
            headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        });
        return { nextId: String(res.data.data.nextId) };
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            if (error.response) {
                return rejectWithValue(
                    error.response.data?.message || "Unable to fetch the next dealer ID."
                );
            }
            if (typeof navigator !== "undefined" && navigator.onLine) {
                return rejectWithValue(
                    "Dealer next ID request failed while online. Check the API server/CORS configuration."
                );
            }
        }

        if (typeof navigator === "undefined" || navigator.onLine === false) {
            const suggested = await offlineSyncService.getSuggestedNextId(DEALERS);
            return { nextId: suggested };
        }
        return rejectWithValue("Unable to fetch the next dealer ID.");
    }
});

export const fetchAllDealers = createAsyncThunk<
    { data: DealerRecord[]; pagination: Pagination },
    { page: number; limit: number },
    { rejectValue: string }
>("dealer/fetchAll", async ({ page, limit }, { rejectWithValue }) => {
    const url = DEALERS;
    if (isOffline()) {
        const cached = await offlineSyncService.getCachedResponse(url);
        if (cached) {
            const rows: DealerRecord[] = Array.isArray(cached.data) ? cached.data : [];
            return {
                data: rows,
                pagination: cached.meta ?? {
                    page, limit, total: rows.length,
                    totalPages: Math.max(1, Math.ceil(rows.length / limit)),
                },
            };
        }
        return rejectWithValue("Offline: no cached dealers available");
    }
    try {
        const res = await api.get(url, { params: { page, limit } });
        const rows: DealerRecord[] = Array.isArray(res.data.data) ? res.data.data : [];
        const meta: Pagination = res.data.meta ?? {
            page, limit, total: rows.length,
            totalPages: Math.max(1, Math.ceil(rows.length / limit)),
        };
        return { data: rows, pagination: meta };
    } catch (err: any) {
        if (!err.response) {
            const cached = await offlineSyncService.getCachedResponse(url);
            if (cached) {
                const rows: DealerRecord[] = Array.isArray(cached.data) ? cached.data : [];
                return {
                    data: rows,
                    pagination: cached.meta ?? {
                        page, limit, total: rows.length,
                        totalPages: Math.max(1, Math.ceil(rows.length / limit)),
                    },
                };
            }
        }
        return rejectWithValue(err.response?.data?.message || "Failed to load dealers");
    }
});

export const fetchDealerById = createAsyncThunk<
    DealerRecord,
    string,
    { rejectValue: string }
>("dealer/fetchById", async (id, { rejectWithValue }) => {
    if (isTempId(id)) {
        const queue = await offlineSyncService.getQueue();
        const pending = queue.find(
            (q) => q.method === "post" && String(q.tempId) === String(id)
        );
        if (pending?.data && typeof pending.data === "object") {
            return { id, ...(pending.data as Record<string, unknown>), _offlinePending: true, tempId: id } as DealerRecord;
        }
        return rejectWithValue("Offline: dealer not found in queue");
    }
    if (isOffline()) {
        const cached = await offlineSyncService.getCachedResponse(DEALERS);
        const rows: DealerRecord[] = Array.isArray(cached?.data) ? cached.data : [];
        const found = rows.find((r) => String(r.id) === String(id));
        if (found) return found;
        return rejectWithValue("Offline: dealer not found in cache");
    }
    try {
        const res = await api.get(`${DEALERS}/${encodeURIComponent(id)}`);
        return res.data.data;
    } catch (err: unknown) {
        if (!axios.isAxiosError(err)) {
            return rejectWithValue("Failed to fetch dealer");
        }
        if (!err.response) {
            const cached = await offlineSyncService.getCachedResponse(DEALERS);
            const rows: DealerRecord[] = Array.isArray(cached?.data) ? cached.data : [];
            const found = rows.find((r) => String(r.id) === String(id));
            if (found) return found;
        }
        return rejectWithValue(err.response?.data?.message || "Failed to fetch dealer");
    }
});

export const createDealer = createAsyncThunk<
    { data: DealerRecord; _offline: boolean },
    DealerFormValues & { id?: string },
    { rejectValue: string }
>("dealer/create", async (payload, { rejectWithValue }) => {
    const body: Record<string, unknown> = {
        dealarShipName: payload.dealarShipName,
        contactNo: payload.contactNo,
        address: payload.address,
        saleTaxNo: payload.saleTaxNo,
        NTNNo: payload.NTNNo,
        name: payload.name,
        provinceId: payload.provinceId,
        cityId: payload.cityId,
        mobileNo: payload.mobileNo,
        opeaningBalance: payload.opeaningBalance,
        dealarType: payload.dealarType,
        NICNo: payload.NICNo,
    };

    if (isTempId(String(payload.provinceId))) body._tempProvinceId = payload.provinceId;
    if (isTempId(String(payload.cityId))) body._tempCityId = payload.cityId;

    if (isOffline()) {
        const tempId = payload.id && isTempId(payload.id)
            ? payload.id
            : generateTempId("dealer");
        const res = await offlineSyncService.enqueueMutation({
            method: "post",
            url: DEALERS,
            data: { ...body, _tempId: tempId },
        });
        return { data: res.data.data as DealerRecord, _offline: true };
    }

    try {
        const res = await api.post(DEALERS, body);
        return { data: res.data.data, _offline: false };
    } catch (err: any) {
        if (!err.response) {
            const tempId = payload.id && isTempId(payload.id)
                ? payload.id
                : generateTempId("dealer");
            const res = await offlineSyncService.enqueueMutation({
                method: "post",
                url: DEALERS,
                data: { ...body, _tempId: tempId },
            });
            return { data: res.data.data as DealerRecord, _offline: true };
        }
        return rejectWithValue(err.response?.data?.message || "Failed to save dealer");
    }
});

/* ⬇️⬇️⬇️ YAHAN CHANGE HUA — return shape { data, _offline } ⬇️⬇️⬇️ */
export const updateDealer = createAsyncThunk<
    { data: DealerRecord; _offline: boolean },
    DealerFormValues & { id: string },
    { rejectValue: string }
>("dealer/update", async (payload, { rejectWithValue }) => {
    const body: Record<string, unknown> = {
        dealarShipName: payload.dealarShipName,
        contactNo: payload.contactNo,
        address: payload.address,
        saleTaxNo: payload.saleTaxNo,
        NTNNo: payload.NTNNo,
        name: payload.name,
        provinceId: payload.provinceId,
        cityId: payload.cityId,
        mobileNo: payload.mobileNo,
        opeaningBalance: payload.opeaningBalance,
        dealarType: payload.dealarType,
        NICNo: payload.NICNo,
    };

    if (isTempId(String(payload.provinceId))) body._tempProvinceId = payload.provinceId;
    if (isTempId(String(payload.cityId))) body._tempCityId = payload.cityId;

    if (isTempId(payload.id) || isOffline()) {
        const res = await offlineSyncService.enqueueMutation({
            method: "put",
            url: `${DEALERS}/${payload.id}`,
            data: body,
        });
        return { data: res.data.data as DealerRecord, _offline: true };
    }

    try {
        const res = await api.put(`${DEALERS}/${payload.id}`, body);
        return { data: res.data.data, _offline: false };
    } catch (err: any) {
        if (!err.response) {
            const res = await offlineSyncService.enqueueMutation({
                method: "put",
                url: `${DEALERS}/${payload.id}`,
                data: body,
            });
            return { data: res.data.data as DealerRecord, _offline: true };
        }
        return rejectWithValue(err.response?.data?.message || "Failed to update dealer");
    }
});

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
                state.currentRecord = { ...state.currentRecord, id: realId };
            }
            if (String(state.nextId) === String(tempId)) {
                state.nextId = String(Number(realId) + 1);
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
        setOfflineQueueVersion(state, action: PayloadAction<number>) {
            state.offlineQueueVersion = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchDealerNextId.pending, (s) => { s.isIdLoading = true; })
            .addCase(fetchDealerNextId.fulfilled, (s, a) => {
                s.isIdLoading = false;
                s.nextId = a.payload.nextId;
                s.isNewMode = true;
                s.isEditing = true;
                s.currentRecord = null;
            })
            .addCase(fetchDealerNextId.rejected, (s, a) => {
                s.isIdLoading = false;
                s.isNewMode = true;
                s.isEditing = true;
                s.apiError = a.payload ?? "Unable to fetch the next dealer ID.";
            })

            .addCase(fetchAllDealers.pending, (s) => {
                s.listStatus = "loading";
                s.listError = null;
            })
            .addCase(fetchAllDealers.fulfilled, (s, a) => {
                s.listStatus = "succeeded";
                s.list = a.payload.data;
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
            .addCase(createDealer.fulfilled, (s) => { s.isSubmitting = false; })
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
    setReconciledId, setReconciledCityId, setReconciledProvinceId, setOfflineQueueVersion,
} = dealerSlice.actions;

export default dealerSlice.reducer;