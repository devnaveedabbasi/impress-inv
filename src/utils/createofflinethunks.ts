import { createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import api from "@/lib/axios";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { generateTempId, isTempId, type TempIdEntity } from "@/utils/tempId";
import { isOffline } from "@/utils/network";

/**
 * createOfflineThunks
 * -------------------
 * One place that knows how to do: "online -> server, offline -> queue + cache".
 * Every master module (dealer, city, station, category ...) calls this once
 * and gets 5 ready thunks. The slice itself contains NO offline code.
 *
 * Usage:
 *   const thunks = createOfflineThunks<DealerRecord, DealerFormValues>({
 *     name: "dealer",
 *     url: DEALERS,
 *     label: "dealer",
 *     tempEntity: "dealer",
 *     buildBody: (form) => ({ ...fields to send... }),
 *     tempRefs: { provinceId: "_tempProvinceId" },   // optional
 *   });
 */

export type Pagination = { page: number; limit: number; total: number; totalPages: number };

type Config<TForm> = {
    /** Redux action prefix, e.g. "dealer" gives "dealer/fetchAll" */
    name: string;
    /** API route, e.g. DEALERS */
    url: string;
    /** Word used in error messages, e.g. "dealer" */
    label: string;
    /** Used by generateTempId(), e.g. "dealer" gives "temp-dealer-<uuid>" */
    tempEntity: TempIdEntity;
    /** Pick the fields that go to the server */
    buildBody: (form: TForm) => Record<string, unknown>;
    /**
     * Fields that may hold the temp id of ANOTHER offline record
     * (form field name -> extra body key). Example: { provinceId: "_tempProvinceId" }
     */
    tempRefs?: Record<string, string>;
};

const hasNoResponse = (e: unknown) => axios.isAxiosError(e) && !e.response;

const messageOf = (e: unknown, fallback: string) =>
    axios.isAxiosError(e) ? (e.response?.data as any)?.message || fallback : fallback;

export function createOfflineThunks<
    TRecord extends { id: number | string },
    TForm extends object
>(config: Config<TForm>) {
    const { name, url, label, tempEntity, buildBody, tempRefs = {} } = config;

    const bodyFrom = (form: TForm) => {
        const body = buildBody(form);
        for (const [field, extraKey] of Object.entries(tempRefs)) {
            const value = (form as unknown as Record<string, unknown>)[field];
            if (isTempId(String(value ?? ""))) body[extraKey] = value;
        }
        return body;
    };

    const readCachedPage = async (page: number, limit: number) => {
        const cached = await offlineSyncService.getCachedPage(url, { page, limit });
        if (!cached) return null;
        return { data: cached.data as TRecord[], pagination: cached.meta as Pagination };
    };

    const findInCache = async (id: string) => {
        const rows = (await offlineSyncService.getCachedRows(url)) as TRecord[];
        return rows.find((r) => String(r.id) === String(id));
    };

    // ---------- next id ----------
    // Online: the server gives the real next id.
    // Offline: a temp id ("temp-dealer-<uuid>"). The server gives the real id when it syncs.
    const fetchNextId = createAsyncThunk<{ nextId: string }, void, { rejectValue: string }>(
        `${name}/fetchNextId`,
        async (_, { rejectWithValue }) => {
            const suggestOffline = async () => ({ nextId: generateTempId(tempEntity) });

            if (isOffline()) return suggestOffline();

            try {
                const res = await api.get(`${url}/next-id`, {
                    params: { _t: Date.now() },
                    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
                });
                return { nextId: String(res.data.data.nextId) };
            } catch (error) {
                // Server answered with an error: show it. No answer at all: work offline.
                if (axios.isAxiosError(error) && error.response) {
                    return rejectWithValue(
                        (error.response.data as any)?.message || `Unable to fetch the next ${label} ID.`
                    );
                }
                return suggestOffline();
            }
        }
    );

    // ---------- list ----------
    const fetchAll = createAsyncThunk<
        { data: TRecord[]; pagination: Pagination },
        { page: number; limit: number },
        { rejectValue: string }
    >(`${name}/fetchAll`, async ({ page, limit }, { rejectWithValue }) => {
        const getPendingOfflineRows = async (): Promise<TRecord[]> => {
            try {
                const queue = await offlineSyncService.getQueue();
                const cleanUrl = url.startsWith("/") ? url : `/${url}`;
                return queue
                    .filter(
                        (q) =>
                            q.method === "post" &&
                            q.status !== "failed" &&
                            !q.permanentFailure &&
                            (q.url === url || q.url === cleanUrl || q.resourceUrl === url || q.resourceUrl === cleanUrl)
                    )
                    .map((q) => {
                        const rec = (q.data && typeof q.data === "object" ? q.data : {}) as Record<string, unknown>;
                        return {
                            ...rec,
                            id: q.tempId || q.recordId || rec._tempId || rec.tempId,
                            tempId: q.tempId || rec._tempId || rec.tempId,
                            _offlinePending: true,
                        } as unknown as TRecord;
                    });
            } catch {
                return [];
            }
        };

        const mergeWithPendingQueue = async (rows: TRecord[]): Promise<TRecord[]> => {
            const pending = await getPendingOfflineRows();
            if (pending.length === 0) return rows;
            const merged = new Map<string, TRecord>();
            // Keep pending offline records at top
            pending.forEach((r) => merged.set(String(r.id), r));
            rows.forEach((r) => {
                if (!merged.has(String(r.id))) {
                    merged.set(String(r.id), r);
                }
            });
            return Array.from(merged.values());
        };

        const fromCache = async () => {
            let cached = await readCachedPage(page, limit);
            if (!cached) {
                const allRows = (await offlineSyncService.getCachedRows(url)) as TRecord[];
                if (allRows && allRows.length > 0) {
                    const start = (page - 1) * limit;
                    cached = {
                        data: allRows.slice(start, start + limit),
                        pagination: {
                            page,
                            limit,
                            total: allRows.length,
                            totalPages: Math.max(1, Math.ceil(allRows.length / limit)),
                        },
                    };
                }
            }

            const pending = await getPendingOfflineRows();
            if (!cached) {
                if (pending.length > 0) {
                    return {
                        data: pending.slice((page - 1) * limit, page * limit),
                        pagination: {
                            page,
                            limit,
                            total: pending.length,
                            totalPages: Math.max(1, Math.ceil(pending.length / limit)),
                        },
                    };
                }
                return null;
            }

            const mergedRows = await mergeWithPendingQueue(cached.data);
            return {
                data: mergedRows,
                pagination: {
                    ...cached.pagination,
                    total: Math.max(cached.pagination.total, mergedRows.length),
                },
            };
        };

        if (isOffline()) {
            const cached = await fromCache();
            if (cached) return cached;
            const pending = await getPendingOfflineRows();
            return {
                data: pending,
                pagination: { page, limit, total: pending.length, totalPages: 1 },
            };
        }

        try {
            const res = await api.get(url, { params: { page, limit } });
            const rows: TRecord[] = Array.isArray(res.data.data) ? res.data.data : [];
            const mergedRows = await mergeWithPendingQueue(rows);
            const total = Math.max(Number(res.data.meta?.total ?? rows.length), mergedRows.length);
            const pagination: Pagination = res.data.meta
                ? { ...res.data.meta, total }
                : {
                    page,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                };
            return { data: mergedRows, pagination };
        } catch (err) {
            const cached = await fromCache();
            if (cached) return cached;
            if (hasNoResponse(err) || isOffline()) {
                const pending = await getPendingOfflineRows();
                return {
                    data: pending,
                    pagination: { page, limit, total: pending.length, totalPages: 1 },
                };
            }
            return rejectWithValue(messageOf(err, `Failed to load ${label}s`));
        }
    });

    // ---------- one record ----------
    const fetchById = createAsyncThunk<TRecord, string, { rejectValue: string }>(
        `${name}/fetchById`,
        async (id, { rejectWithValue }) => {
            // Record created offline and still waiting in the queue
            if (isTempId(id)) {
                const queue = await offlineSyncService.getQueue();
                const pending = queue.find((q) => q.method === "post" && String(q.tempId) === String(id));
                if (pending?.data && typeof pending.data === "object") {
                    return {
                        id,
                        ...(pending.data as Record<string, unknown>),
                        _offlinePending: true,
                        tempId: id,
                    } as unknown as TRecord;
                }
                return rejectWithValue(`Offline: ${label} not found in queue`);
            }

            if (isOffline()) {
                const found = await findInCache(id);
                return found ?? rejectWithValue(`Offline: ${label} not found in cache`);
            }

            try {
                const res = await api.get(`${url}/${encodeURIComponent(id)}`);
                return res.data.data as TRecord;
            } catch (err) {
                if (hasNoResponse(err)) {
                    const found = await findInCache(id);
                    if (found) return found;
                }
                return rejectWithValue(messageOf(err, `Failed to fetch ${label}`));
            }
        }
    );

    // ---------- create ----------
    const create = createAsyncThunk<
        { data: TRecord; _offline: boolean },
        TForm & { id?: string },
        { rejectValue: string }
    >(`${name}/create`, async (payload, { rejectWithValue }) => {
        const body = bodyFrom(payload);
        // Same id for the online attempt and (if needed) the queued retry
        const mutationId = offlineSyncService.generateClientMutationId();

        const saveOffline = async () => {
            const tempId =
                payload.id && isTempId(payload.id) ? payload.id : generateTempId(tempEntity);
            const res = await offlineSyncService.enqueueMutation({
                method: "post",
                url,
                data: { ...body, _tempId: tempId },
                headers: { "X-Client-Mutation-Id": mutationId },
            });
            return { data: res.data.data as TRecord, _offline: true };
        };

        if (isOffline()) return saveOffline();

        try {
            const res = await api.post(url, body, {
                headers: { "X-Client-Mutation-Id": mutationId },
            });
            return { data: res.data.data as TRecord, _offline: false };
        } catch (err) {
            if (hasNoResponse(err)) return saveOffline();
            return rejectWithValue(messageOf(err, `Failed to save ${label}`));
        }
    });

    // ---------- update ----------
    const update = createAsyncThunk<
        { data: TRecord; _offline: boolean },
        TForm & { id: string },
        { rejectValue: string }
    >(`${name}/update`, async (payload, { rejectWithValue }) => {
        const body = bodyFrom(payload);
        const mutationId = offlineSyncService.generateClientMutationId();
        const target = `${url}/${payload.id}`;

        const saveOffline = async () => {
            const res = await offlineSyncService.enqueueMutation({
                method: "put",
                url: target,
                data: body,
                headers: { "X-Client-Mutation-Id": mutationId },
            });
            return { data: res.data.data as TRecord, _offline: true };
        };

        if (isTempId(payload.id) || isOffline()) return saveOffline();

        try {
            const res = await api.put(target, body, {
                headers: { "X-Client-Mutation-Id": mutationId },
            });
            return { data: res.data.data as TRecord, _offline: false };
        } catch (err) {
            if (hasNoResponse(err)) return saveOffline();
            return rejectWithValue(messageOf(err, `Failed to update ${label}`));
        }
    });

    return { fetchNextId, fetchAll, fetchById, create, update };
}