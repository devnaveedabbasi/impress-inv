import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { STATIONS } from "@/utils/apiRoutes";
import { createOfflineThunks, type Pagination } from "@/utils/createofflinethunks";
import type { StationFormValues } from "@/validations/master";

export type StationRecord = {
    id: number | string;
    name: string;
    _offlinePending?: boolean;
    tempId?: string;
};

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
const stationThunks = createOfflineThunks<StationRecord, StationFormValues>({
    name: "station",
    url: STATIONS,
    label: "station",
    tempEntity: "station",
    buildBody: (p) => ({
        name: p.name,
    }),
});

export const fetchStationNextId = stationThunks.fetchNextId;
export const fetchAllStations = stationThunks.fetchAll;
export const fetchStationById = stationThunks.fetchById;
export const createStation = stationThunks.create;
export const updateStation = stationThunks.update;

/* ---------------- Slice ---------------- */

export const stationSlice = createSlice({
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
            /* fetchNextId */
            .addCase(fetchStationNextId.pending, (s) => {
                s.isIdLoading = true;
            })
            .addCase(fetchStationNextId.fulfilled, (s, a) => {
                s.isIdLoading = false;
                s.nextId = a.payload.nextId;
            })
            .addCase(fetchStationNextId.rejected, (s, a) => {
                s.isIdLoading = false;
                s.apiError = a.payload ?? "Unable to fetch the next station ID.";
            })

            /* fetchAll */
            .addCase(fetchAllStations.pending, (s) => {
                s.listStatus = "loading";
                s.listError = null;
            })
            .addCase(fetchAllStations.fulfilled, (s, a) => {
                s.listStatus = "succeeded";
                const incoming = a.payload.data || [];
                const pendingOffline = s.list.filter(
                    (item) => item._offlinePending || (item.id && String(item.id).startsWith("temp-"))
                );
                const mergedMap = new Map<string, StationRecord>();
                pendingOffline.forEach((item) => mergedMap.set(String(item.id), item));
                incoming.forEach((item) => {
                    if (!mergedMap.has(String(item.id))) {
                        mergedMap.set(String(item.id), item);
                    }
                });
                s.list = Array.from(mergedMap.values());
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
            .addCase(createStation.fulfilled, (s, a) => {
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
    setNextId,
} = stationSlice.actions;

export default stationSlice.reducer;