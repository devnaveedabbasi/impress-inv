"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import { categorySchema, type CategoryFormValues } from "@/lib/validations/master";
import { CATEGORIES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import { offlineSyncService } from "@/lib/offlineSyncService";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import useDebounce from "@/hooks/useDebounce";

type CategoryRow = {
    id: number | string;
    name: string;
    _offlinePending?: boolean;
    tempId?: string;
};

type ApiResponse<T> = {
    success?: boolean;
    message?: string;
    data: T;
    _offline?: boolean;
    _tempId?: string;
};

const initialValues: CategoryFormValues = {
    id: "",
    name: "",
};

const generateTempId = () =>
    `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const isTempId = (id: string | number | undefined | null): boolean =>
    typeof id === "string" && id.startsWith("temp-");

const isOffline = () =>
    typeof navigator !== "undefined" && navigator.onLine === false;

export default function CategoryPage() {
    const { hasPermission } = usePermissions();

    const canCreate = hasPermission("category", "create");
    const canUpdate = hasPermission("category", "update");
    const canView = hasPermission("category", "view");

    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [isIdLoading, setIsIdLoading] = useState(true);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [nextId, setNextId] = useState("");
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [categories, setCategories] = useState<CategoryRow[]>([]);
    const [isCategoriesLoading, setIsCategoriesLoading] = useState(false);
    const [categoriesError, setCategoriesError] = useState("");

    const lookupSequence = useRef(0);
    const isNewModeRef = useRef(isNewMode);
    const valuesRef = useRef<CategoryFormValues>(initialValues);
    const nextIdRef = useRef("");
    const canViewRef = useRef(canView);
    const lastSyncedIdRef = useRef("");

    useEffect(() => { isNewModeRef.current = isNewMode; }, [isNewMode]);
    useEffect(() => { nextIdRef.current = nextId; }, [nextId]);
    useEffect(() => { canViewRef.current = canView; }, [canView]);

    const getCachedCategories = useCallback(async (): Promise<CategoryRow[]> => {
        try {
            const cached = await offlineSyncService.getCachedResponse(CATEGORIES);
            if (cached) {
                const list = Array.isArray(cached.data)
                    ? cached.data
                    : Array.isArray(cached)
                        ? cached
                        : [];
                return list;
            }
        } catch (error) {
            console.error("Failed to read category cache:", error);
        }
        return [];
    }, []);

    const refreshCategories = useCallback(async () => {
        try {
            const response = await api.get<ApiResponse<CategoryRow[]>>(CATEGORIES);
            const rows = Array.isArray(response.data.data) ? response.data.data : [];
            setCategories(rows);
            return rows;
        } catch (error) {
            console.error("Failed to refresh categories:", error);
            const cachedRows = await getCachedCategories();
            if (cachedRows.length > 0) {
                setCategories(cachedRows);
                return cachedRows;
            }
            return null;
        }
    }, [getCachedCategories]);

    // ✅ useForm PEHLE — taaki setValues available ho
    const {
        values,
        errors,
        isLoading: isSubmitting,
        handleInputChange,
        handleSubmit,
        setValues,
    } = useForm({
        initialValues,
        validationSchema: categorySchema,
        resetOnSuccess: false,
        onSubmit: async (data) => {
            try {
                const currentId = String(valuesRef.current.id);
                const isNew = isNewModeRef.current;
                const usingTempId = isTempId(currentId);

                if (isNew) {
                    const postBody: any = { name: data.name };
                    if (usingTempId) {
                        postBody._tempId = currentId;
                    }

                    const response = await api.post(CATEGORIES, postBody);
                    toast.success(
                        response.data.message || "Category created successfully"
                    );

                    const created = response.data?.data;
                    const realId = created?.id;
                    if (realId != null && !isTempId(realId)) {
                        const nextSuggested = String(Number(realId) + 1);
                        lastSyncedIdRef.current = nextSuggested;
                        setNextId(nextSuggested);
                        setValues({ id: nextSuggested, name: "" });
                        setIsNewMode(true);
                        setIsEditing(true);
                    } else {
                        await fetchNextIdRef.current?.();
                    }
                } else {
                    const response = await api.put(
                        `${CATEGORIES}/${encodeURIComponent(currentId)}`,
                        { name: data.name }
                    );
                    toast.success(
                        response.data.message || "Category updated successfully"
                    );
                    await refreshCategories();
                    await fetchNextIdRef.current?.();
                }
            } catch (error: any) {
                toast.error(
                    error.response?.data?.message || "Failed to save category"
                );
                throw error;
            }
        },
    });

    useEffect(() => { valuesRef.current = values; }, [values]);

    // ✅ fetchNextId AFTER useForm
    const fetchNextId = useCallback(async () => {
        setIsIdLoading(true);

        if (isOffline()) {
            const tempId = generateTempId();
            setNextId(tempId);
            setValues({ id: tempId, name: "" });
            setIsNewMode(true);
            setIsEditing(true);
            setIsIdLoading(false);
            return;
        }

        try {
            const response = await api.get<ApiResponse<{ nextId: string | number }>>(
                `${CATEGORIES}/next-id`,
                {
                    params: { _t: Date.now() },
                    headers: {
                        "Cache-Control": "no-cache",
                        Pragma: "no-cache",
                    },
                }
            );
            const fetchedId = String(response.data.data.nextId);
            lastSyncedIdRef.current = fetchedId;
            setNextId(fetchedId);
            setValues({ id: fetchedId, name: "" });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next category ID:", error);
            const tempId = generateTempId();
            setNextId(tempId);
            setValues({ id: tempId, name: "" });
            setIsNewMode(true);
            setIsEditing(true);
        } finally {
            setIsIdLoading(false);
        }
    }, [setValues]);

    // ✅ Ref so onSubmit can call it without ordering issues
    const fetchNextIdRef = useRef<typeof fetchNextId | null>(null);
    useEffect(() => {
        fetchNextIdRef.current = fetchNextId;
    }, [fetchNextId]);

    useEffect(() => {
        const handleIdReconciled = (event: Event) => {
            const customEvent = event as CustomEvent<{
                tempId: string;
                realId: string | number;
                resourceUrl: string;
            }>;
            const { tempId, realId } = customEvent.detail;

            if (String(valuesRef.current.id) === String(tempId)) {
                const realIdStr = String(realId);
                const nextSuggested = String(Number(realIdStr) + 1);
                lastSyncedIdRef.current = nextSuggested;
                setNextId(nextSuggested);
                setValues({ ...valuesRef.current, id: nextSuggested });
                setIsNewMode(true);
                setIsEditing(true);
            }

            setCategories((prev) =>
                prev.map((c) =>
                    String(c.id) === String(tempId) || String(c.tempId) === String(tempId)
                        ? { ...c, id: realId, _offlinePending: false, tempId: undefined }
                        : c
                )
            );
        };

        window.addEventListener("offline-id-reconciled", handleIdReconciled);
        return () => {
            window.removeEventListener("offline-id-reconciled", handleIdReconciled);
        };
    }, [setValues]);

    useEffect(() => {
        const handleOnline = () => {
            void fetchNextId();
            void refreshCategories();
        };
        const handleOffline = () => {
            if (isNewModeRef.current) {
                void fetchNextId();
            }
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [fetchNextId, refreshCategories]);

    const fetchAllCategories = async () => {
        setIsViewAllOpen(true);
        setIsCategoriesLoading(true);
        setCategoriesError("");

        try {
            const response = await api.get<ApiResponse<CategoryRow[]>>(CATEGORIES);
            setCategories(Array.isArray(response.data.data) ? response.data.data : []);
        } catch (error: any) {
            const cachedRows = await getCachedCategories();
            if (cachedRows.length > 0) {
                setCategories(cachedRows);
                setCategoriesError("");
            } else {
                setCategoriesError(
                    error.response?.data?.message ||
                    "No cached categories available. Connect to the internet and try again."
                );
            }
        } finally {
            setIsCategoriesLoading(false);
        }
    };

    const didPrimeRef = useRef(false);
    useEffect(() => {
        if (didPrimeRef.current) return;
        didPrimeRef.current = true;
        void refreshCategories();
        void fetchNextId();
    }, [refreshCategories, fetchNextId]);

    const debouncedId = useDebounce(values?.id, 500);

    useEffect(() => {
        const sequence = ++lookupSequence.current;
        let cancelled = false;

        const run = async () => {
            const id = String(debouncedId || "").trim();

            if (!id || isIdLoading) return;

            if (isTempId(id)) {
                try {
                    const queue = await offlineSyncService.getQueue();
                    const pendingItem = queue.find(
                        (q) =>
                            q.method === "post" &&
                            (String(q.tempId) === id ||
                                String(q.data?.id) === id ||
                                String(q.data?._tempId) === id)
                    );
                    if (cancelled || sequence !== lookupSequence.current) return;

                    if (pendingItem?.data?.name) {
                        setValues({ id, name: pendingItem.data.name });
                        setIsNewMode(false);
                        setIsEditing(true);
                    }
                    return;
                } catch {
                    return;
                }
            }

            if (id === String(nextIdRef.current)) {
                setIsNewMode(true);
                setIsEditing(true);
                return;
            }

            try {
                const queue = await offlineSyncService.getQueue();
                const pendingItem = queue.find(
                    (q) =>
                        q.method === "post" &&
                        (String(q.recordId) === id ||
                            String(q.tempId) === id ||
                            String(q.data?.id) === id)
                );
                if (pendingItem) {
                    if (cancelled || sequence !== lookupSequence.current) return;
                    if (pendingItem.data?.name) {
                        setValues({ id, name: pendingItem.data.name });
                        setIsNewMode(false);
                        setIsEditing(true);
                    }
                    return;
                }
            } catch {
                // ignore
            }

            if (!canViewRef.current) {
                setIsNewMode(true);
                setIsEditing(false);
                return;
            }

            setIsLookingUp(true);

            try {
                const response = await api.get<ApiResponse<CategoryRow>>(
                    `${CATEGORIES}/${encodeURIComponent(id)}`
                );

                if (cancelled || sequence !== lookupSequence.current) return;

                const category = response.data.data;
                if (category) {
                    setValues({ id: String(category.id), name: category.name });
                    setIsNewMode(false);
                    setIsEditing(false);
                } else {
                    if (!isNewModeRef.current) toast.error("Category not found");
                    setValues({ ...initialValues, id });
                    setIsNewMode(true);
                    setIsEditing(true);
                }
            } catch (error: any) {
                if (cancelled || sequence !== lookupSequence.current) return;

                if (error.response?.status === 403 || error.response?.status === 401) {
                    toast.error(
                        error.response?.data?.message ||
                        "You do not have permission to access this category."
                    );
                    setIsEditing(false);
                    return;
                }

                const cachedRows = await getCachedCategories();
                if (cancelled || sequence !== lookupSequence.current) return;

                const category = cachedRows.find(
                    (item) => String(item.id) === id || String(item.tempId) === id
                );

                if (category) {
                    setValues({ id: String(category.id), name: category.name });
                    setIsNewMode(false);
                    setIsEditing(false);
                } else {
                    if (!isNewModeRef.current) {
                        toast.error("Category not found in the available data.");
                    }
                    setValues({ ...initialValues, id });
                    setIsNewMode(true);
                    setIsEditing(true);
                }
            } finally {
                if (!cancelled && sequence === lookupSequence.current) {
                    setIsLookingUp(false);
                }
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [debouncedId, isIdLoading, getCachedCategories, setValues]);

    const categoryColumns: ViewAllColumn<CategoryRow>[] = [
        {
            key: "id",
            header: "Category ID",
            render: (row) => {
                const temp = row._offlinePending || isTempId(row.id);
                return (
                    <div className="flex items-center gap-1.5">
                        <span className={temp ? "italic text-amber-700" : ""}>
                            {temp ? "Pending…" : String(row.id)}
                        </span>
                        {temp && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                Offline
                            </span>
                        )}
                    </div>
                );
            },
        },
        { key: "name", header: "Category Name" },
    ];

    const handleNew = () => {
        void fetchNextId();
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-110 bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">
                Category Entry
            </h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-3">
                <LabeledField
                    type="text"
                    label="Category ID"
                    value={
                        isIdLoading
                            ? "Loading..."
                            : isTempId(values.id)
                                ? "Pending (offline)"
                                : values.id || ""
                    }
                    onChange={handleInputChange("id")}
                    error={errors.id}
                    disabled={isIdLoading || isLookingUp || isTempId(values.id)}
                />

                <LabeledField
                    label="Category Name"
                    value={values.name}
                    onChange={handleInputChange("name")}
                    error={errors.name}
                    disabled={!isEditing}
                />

                <div className="grid grid-cols-2 gap-3 pt-6 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={handleNew}
                        disabled={isSubmitting || !canCreate}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        New
                    </Button>

                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={() => void fetchAllCategories()}
                        disabled={isSubmitting || !canView}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        View All
                    </Button>

                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={() => setIsEditing(true)}
                        disabled={isSubmitting || isNewMode || isEditing || !canUpdate}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Edit
                    </Button>

                    <Button
                        type="submit"
                        variant="secondary"
                        shape="rounded"
                        isLoading={isSubmitting}
                        disabled={!isEditing || (isNewMode ? !canCreate : !canUpdate)}
                        className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
                    >
                        Save
                    </Button>
                </div>
            </form>

            <ViewAllModal
                isOpen={isViewAllOpen}
                title="All Categories"
                rows={categories}
                columns={categoryColumns}
                searchKeys={["id", "name"]}
                isLoading={isCategoriesLoading}
                error={categoriesError}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(category) => {
                    setValues({
                        id: String(category.id),
                        name: category.name,
                    });
                    setIsNewMode(false);
                    setIsEditing(false);
                    setIsViewAllOpen(false);
                }}
                onDelete={() => undefined}
            />
        </section>
    );
}