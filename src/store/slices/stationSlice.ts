import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { isAxiosError } from "axios";
import api from "@/lib/axios";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { STATIONS } from "@/utlis/apiRoutes";
import { generateTempId, isTempId } from "@/store/utils/tempId";
import { isOffline } from "@/store/utils/network";

export type StationRecord = {
    id: number | string;
    name: string;
    _offlinePending?: boolean;
    tempId?: string;
};

type Pagination = { page: number; limit: number; total: number; totalPages: number };

type StationState = {
    list: StationRecord[];
    listStatus: "idle" | "loading" | "succeeded" | "failed";
    listError: string | null;
    pagination: Pagination;
    nextId: string;
    isNewMode: boolean;
    isEditing: boolean;
    isIdLoading: boolean;
    isSubmitting: boolean;
    isLookingUp: boolean;
    currentRecord: StationRecord | null;
    apiError: string | null;
};

const initialState: StationState = {
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

/* ---------------- Thunks ---------------- */

export const fetchStationNextId = createAsyncThunk<
    { nextId: string },
    void,
    { rejectValue: string }
>("station/fetchNextId", async (_, { rejectWithValue }) => {
    if (isOffline()) {
        return { nextId: generateTempId("station") };
    }
    try {
        const res = await api.get(`${STATIONS}/next-id`, {
            params: { _t: Date.now() },
            headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        });
        const nextId = res.data?.data?.nextId;
        if (nextId === undefined || nextId === null) {
            return rejectWithValue("Station next ID response was invalid.");
        }
        return { nextId: String(nextId) };
    } catch (error: unknown) {
        if (isAxiosError(error)) {
            if (error.response) {
                return rejectWithValue(
                    error.response.data?.message || "Unable to fetch the next station ID."
                );
            }

            if (typeof navigator !== "undefined" && navigator.onLine) {
                return rejectWithValue(
                    "Station next ID request failed while online. Check the API server/CORS configuration."
                );
            }
        }

        if (typeof navigator === "undefined" || navigator.onLine === false) {
            return { nextId: generateTempId("station") };
        }

        return rejectWithValue("Unable to fetch the next station ID.");
    }
});

export const fetchAllStations = createAsyncThunk<
    { data: StationRecord[]; pagination: Pagination },
    { page: number; limit: number },
    { rejectValue: string }
>("station/fetchAll", async ({ page, limit }, { rejectWithValue }) => {
    const url = STATIONS;
    if (isOffline()) {
        const cached = await offlineSyncService.getCachedResponse(url);
        if (cached) {
            const rows: StationRecord[] = Array.isArray(cached.data) ? cached.data : [];
            return {
                data: rows,
                pagination: cached.meta ?? {
                    page, limit, total: rows.length,
                    totalPages: Math.max(1, Math.ceil(rows.length / limit)),
                },
            };
        }
        return rejectWithValue("Offline: no cached stations available");
    }
    try {
        const res = await api.get(url, { params: { page, limit } });
        const rows: StationRecord[] = Array.isArray(res.data.data) ? res.data.data : [];
        const meta: Pagination = res.data.meta ?? {
            page, limit, total: rows.length,
            totalPages: Math.max(1, Math.ceil(rows.length / limit)),
        };
        return { data: rows, pagination: meta };
    } catch (err: any) {
        if (!err.response) {
            const cached = await offlineSyncService.getCachedResponse(url);
            if (cached) {
                const rows: StationRecord[] = Array.isArray(cached.data) ? cached.data : [];
                return {
                    data: rows,
                    pagination: cached.meta ?? {
                        page, limit, total: rows.length,
                        totalPages: Math.max(1, Math.ceil(rows.length / limit)),
                    },
                };
            }
        }
        return rejectWithValue(err.response?.data?.message || "Failed to load stations");
    }
});

export const fetchStationById = createAsyncThunk<
    StationRecord,
    string,
    { rejectValue: string }
>("station/fetchById", async (id, { rejectWithValue }) => {
    // Temp id → look in offline queue
    if (isTempId(id)) {
        const queue = await offlineSyncService.getQueue();
        const pending = queue.find(
            (q) =>
                q.method === "post" &&
                String(q.tempId) === String(id)
        );
        if (pending?.data && typeof pending.data === "object" && "name" in pending.data) {
            return {
                id,
                name: String((pending.data as { name: unknown }).name ?? ""),
                _offlinePending: true,
                tempId: id,
            };
        }
        return rejectWithValue("Offline: station not found in queue");
    }

    // Offline → cache lookup
    if (isOffline()) {
        const cached = await offlineSyncService.getCachedResponse(STATIONS);
        const rows: StationRecord[] = Array.isArray(cached?.data) ? cached.data : [];
        const found = rows.find((r) => String(r.id) === String(id));
        if (found) return found;
        return rejectWithValue("Offline: station not found in cache");
    }

    try {
        const res = await api.get(`${STATIONS}/${encodeURIComponent(id)}`);
        return res.data.data;
    } catch (err: any) {
        return rejectWithValue(err.response?.data?.message || "Failed to fetch station");
    }
});

export const createStation = createAsyncThunk<
    { data: StationRecord; _offline: boolean },
    { name: string; id?: string },
    { rejectValue: string }
>("station/create", async (payload, { rejectWithValue }) => {
    // Offline → enqueue via enqueueMutation
    if (isOffline()) {
        const tempId =
            payload.id && isTempId(payload.id)
                ? payload.id
                : generateTempId("station");

        const res = await offlineSyncService.enqueueMutation({
            method: "post",
            url: STATIONS,
            data: { name: payload.name, _tempId: tempId },
        });

        return { data: res.data.data as StationRecord, _offline: true };
    }

    try {
        const res = await api.post(STATIONS, { name: payload.name });
        return { data: res.data.data, _offline: false };
    } catch (err: any) {
        // Network failure mid-request → enqueue
        if (!err.response) {
            const tempId =
                payload.id && isTempId(payload.id)
                    ? payload.id
                    : generateTempId("station");

            const res = await offlineSyncService.enqueueMutation({
                method: "post",
                url: STATIONS,
                data: { name: payload.name, _tempId: tempId },
            });

            return { data: res.data.data as StationRecord, _offline: true };
        }
        return rejectWithValue(err.response?.data?.message || "Failed to save station");
    }
});

export const updateStation = createAsyncThunk<
    StationRecord,
    { id: string; name: string },
    { rejectValue: string }
>("station/update", async (payload, { rejectWithValue }) => {
    // Temp id OR offline → enqueue PUT
    if (isTempId(payload.id) || isOffline()) {
        const res = await offlineSyncService.enqueueMutation({
            method: "put",
            url: `${STATIONS}/${payload.id}`,
            data: { name: payload.name },
        });

        return res.data.data as StationRecord;
    }

    try {
        const res = await api.put(`${STATIONS}/${payload.id}`, { name: payload.name });
        return res.data.data;
    } catch (err: any) {
        // Network failure mid-request → enqueue
        if (!err.response) {
            const res = await offlineSyncService.enqueueMutation({
                method: "put",
                url: `${STATIONS}/${payload.id}`,
                data: { name: payload.name },
            });
            return res.data.data as StationRecord;
        }
        return rejectWithValue(err.response?.data?.message || "Failed to update station");
    }
});

/* ---------------- Slice ---------------- */

const stationSlice = createSlice({
    name: "station",
    initialState,
    reducers: {
        setNewMode(state, action: PayloadAction<boolean>) {
            state.isNewMode = action.payload;
            if (action.payload) state.isEditing = true;
        },
        setEditing(state, action: PayloadAction<boolean>) {
            state.isEditing = action.payload;
        },
        setCurrentRecord(state, action: PayloadAction<StationRecord | null>) {
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
    },
    extraReducers: (builder) => {
        builder
            /* fetchNextId */
            .addCase(fetchStationNextId.pending, (s) => {
                s.isIdLoading = true;
            })
            .addCase(fetchStationNextId.fulfilled, (s, a) => {
                s.isIdLoading = false;
                s.nextId = a.payload.nextId;
                s.isNewMode = true;
                s.isEditing = true;
                s.currentRecord = null;
            })
            .addCase(fetchStationNextId.rejected, (s, a) => {
                s.isIdLoading = false;
                s.isNewMode = true;
                s.isEditing = true;
                s.apiError = a.payload ?? "Unable to fetch the next station ID.";
            })

            /* fetchAll */
            .addCase(fetchAllStations.pending, (s) => {
                s.listStatus = "loading";
                s.listError = null;
            })
            .addCase(fetchAllStations.fulfilled, (s, a) => {
                s.listStatus = "succeeded";
                s.list = a.payload.data;
                s.pagination = a.payload.pagination;
            })
            .addCase(fetchAllStations.rejected, (s, a) => {
                s.listStatus = "failed";
                s.listError = a.payload ?? "Failed to load stations";
            })

            /* fetchById */
            .addCase(fetchStationById.pending, (s) => {
                s.isLookingUp = true;
            })
            .addCase(fetchStationById.fulfilled, (s, a) => {
                s.isLookingUp = false;
                s.currentRecord = a.payload;
                s.isNewMode = false;
                s.isEditing = false;
            })
            .addCase(fetchStationById.rejected, (s, a) => {
                s.isLookingUp = false;
                s.currentRecord = null;
                s.isNewMode = true;
                s.isEditing = true;
                if (a.payload && !String(a.payload).includes("not found")) {
                    s.apiError = a.payload;
                }
            })

            /* create */
            .addCase(createStation.pending, (s) => {
                s.isSubmitting = true;
                s.apiError = null;
            })
            .addCase(createStation.fulfilled, (s) => {
                s.isSubmitting = false;
            })
            .addCase(createStation.rejected, (s, a) => {
                s.isSubmitting = false;
                s.apiError = a.payload ?? "Failed to save station";
            })

            /* update */
            .addCase(updateStation.pending, (s) => {
                s.isSubmitting = true;
                s.apiError = null;
            })
            .addCase(updateStation.fulfilled, (s) => {
                s.isSubmitting = false;
                s.isEditing = false;
                s.currentRecord = null;
            })
            .addCase(updateStation.rejected, (s, a) => {
                s.isSubmitting = false;
                s.apiError = a.payload ?? "Failed to update station";
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
} = stationSlice.actions;

export default stationSlice.reducer;