"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { usePermissions } from "@/hooks/usePermissions";
import useDebounce from "@/hooks/useDebounce";
import { inventorySchema, type InventoryFormValues } from "@/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { generateTempId, isTempId } from "@/utils/tempId";
import { isOffline } from "@/utils/network";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { INVENTORY } from "@/utils/apiRoutes";
import {
    clearApiError,
    createInventory,
    fetchAllInventories,
    fetchInventoryById,
    fetchInventoryNextId,
    setCurrentRecord,
    setEditing,
    setNewMode,
    setNextId,
    updateInventory,
    type InventoryRecord,
} from "@/store/slices/inventorySlice";
import {
    selectInventoryApiError,
    selectInventoryCurrentRecord,
    selectInventoryIsEditing,
    selectInventoryIsIdLoading,
    selectInventoryIsLookingUp,
    selectInventoryIsNewMode,
    selectInventoryIsSubmitting,
    selectInventoryList,
    selectInventoryListError,
    selectInventoryListStatus,
    selectInventoryNextId,
    selectInventoryPagination,
} from "@/store/selectors/inventorySelectors";
import { selectCategoryList } from "@/store/selectors/categorySelectors";
import { selectDepartmentList } from "@/store/selectors/departmentSelectors";
import { selectStationList } from "@/store/selectors/stationSelectors";
import { fetchAllCategories } from "@/store/slices/categorySlice";
import { fetchAllDepartments } from "@/store/slices/departmentSlice";
import { fetchAllStations } from "@/store/slices/stationSlice";

const defaultRow = () => ({ stationId: "", color: "", qty: "" });

const initialValues: InventoryFormValues = {
    id: "",
    itemName: "",
    categoryId: "",
    departmentId: "",
    pack: "",
    rate: "",
    unitPerBike: "",
    colorRows: [defaultRow(), defaultRow(), defaultRow(), defaultRow()],
};

const COLORS_LIST = [
    { label: "Red", value: "Red" },
    { label: "Black", value: "Black" },
    { label: "Blue", value: "Blue" },
    { label: "Silver", value: "Silver" },
    { label: "Grey", value: "Grey" },
    { label: "White", value: "White" },
];

const QTY_LIST = Array.from({ length: 50 }, (_, i) => ({
    label: String(i + 1),
    value: String(i + 1),
}));

export default function InventoryPage() {
    const dispatch = useAppDispatch();
    const { hasPermission } = usePermissions();

    const list = useAppSelector(selectInventoryList);
    const nextId = useAppSelector(selectInventoryNextId);
    const isNewMode = useAppSelector(selectInventoryIsNewMode);
    const isEditing = useAppSelector(selectInventoryIsEditing);
    const isIdLoading = useAppSelector(selectInventoryIsIdLoading);
    const isSubmitting = useAppSelector(selectInventoryIsSubmitting);
    const isLookingUp = useAppSelector(selectInventoryIsLookingUp);
    const listStatus = useAppSelector(selectInventoryListStatus);
    const listError = useAppSelector(selectInventoryListError);
    const pagination = useAppSelector(selectInventoryPagination);
    const currentRecord = useAppSelector(selectInventoryCurrentRecord);
    const apiError = useAppSelector(selectInventoryApiError);

    const categories = useAppSelector(selectCategoryList);
    const departments = useAppSelector(selectDepartmentList);
    const stations = useAppSelector(selectStationList);

    const categoryOptions = categories.map((c) => ({
        label: c._offlinePending ? `${c.name} (Pending)` : (c.name || String(c.id)),
        value: String(c.id),
    }));
    const departmentOptions = departments.map((d) => ({
        label: d._offlinePending ? `${d.name} (Pending)` : (d.name || String(d.id)),
        value: String(d.id),
    }));
    const stationOptions = stations.map((s) => ({
        label: s._offlinePending ? `${s.name} (Pending)` : (s.name || String(s.id)),
        value: String(s.id),
    }));

    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => !isOffline());
    const [isTransitioningOnline, setIsTransitioningOnline] = useState(false);
    const [isFetchingNew, setIsFetchingNew] = useState(false);

    // Temp ID is preserved until user saves (PUT/POST) with it
    const activeTempIdRef = useRef<string | null>(null);

    const canCreate = hasPermission("inventory", "create");
    const canUpdate = hasPermission("inventory", "update");
    const canView = hasPermission("inventory", "view");

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors },
    } = useForm<InventoryFormValues>({
        resolver: zodResolver(inventorySchema),
        defaultValues: initialValues,
    });

    const watchedId = watch("id");
    const watchedCategoryId = watch("categoryId");
    const watchedDepartmentId = watch("departmentId");
    const watchedColorRows = watch("colorRows") || [];
    const debouncedId = useDebounce(watchedId, 500);

    const isIdBusy = isIdLoading || isFetchingNew;
    const isBootstrapping = isNetworkOnline && isIdBusy && !nextId;
    const isCurrentTemp = isTempId(String(watchedId || nextId || ""));
    const isNumericMode = isNetworkOnline && !isCurrentTemp;

    const getOrCreateTempId = () => {
        if (!activeTempIdRef.current) {
            activeTempIdRef.current = generateTempId("inv");
        }
        return activeTempIdRef.current;
    };

    // 1. Initial Data Load
    useEffect(() => {
        const offline = isOffline() || !navigator.onLine;
        setIsNetworkOnline(!offline);

        if (offline) {
            const temp = getOrCreateTempId();
            dispatch(setNextId(temp));
            setValue("id", temp, { shouldValidate: true, shouldDirty: false });
        } else {
            dispatch(fetchInventoryNextId())
                .unwrap()
                .then((res) => {
                    const id = String(res.nextId);
                    if (!isTempId(id)) {
                        activeTempIdRef.current = null;
                        dispatch(setNextId(id));
                        setValue("id", id, { shouldValidate: true, shouldDirty: false });
                    }
                })
                .catch(() => {
                    const temp = getOrCreateTempId();
                    dispatch(setNextId(temp));
                    setValue("id", temp, { shouldValidate: true, shouldDirty: false });
                });
        }

        dispatch(fetchAllInventories({ page: 1, limit: 10 }));
        dispatch(fetchAllCategories({ page: 1, limit: 100 }));
        dispatch(fetchAllDepartments({ page: 1, limit: 100 }));
        dispatch(fetchAllStations({ page: 1, limit: 100 }));
    }, [dispatch, setValue]);

    // 2. Redux nextId watcher for new mode
    useEffect(() => {
        if (isNewMode && nextId && !isTempId(nextId) && isNetworkOnline) {
            activeTempIdRef.current = null;
            setValue("id", String(nextId), { shouldValidate: true, shouldDirty: false });
        }
    }, [nextId, isNewMode, isNetworkOnline, setValue]);

    // 3. Online / Offline window events
    useEffect(() => {
        const handleOnline = async () => {
            setIsNetworkOnline(true);
            setIsTransitioningOnline(true);

            try {
                await offlineSyncService.processQueue();
                await new Promise((r) => setTimeout(r, 300));

                const next = await dispatch(fetchInventoryNextId()).unwrap();
                const freshId = String(next.nextId);
                dispatch(setNextId(freshId));

                const curId = String(watch("id") || "");
                if (isNewMode || isTempId(curId)) {
                    activeTempIdRef.current = null;
                    setValue("id", freshId, { shouldValidate: true, shouldDirty: false });
                }
                dispatch(fetchAllInventories({ page: 1, limit: 10 }));
            } catch {
                /* handled gracefully */
            } finally {
                setIsTransitioningOnline(false);
            }
        };

        const handleOffline = () => {
            setIsNetworkOnline(false);

            const curId = String(watch("id") || "");
            if (isNewMode || isTempId(curId)) {
                const temp = getOrCreateTempId();
                dispatch(setNextId(temp));
                setValue("id", temp, { shouldValidate: true, shouldDirty: false });
            }
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [isNewMode, dispatch, setValue, watch]);

    // 4. Background Sync ID Reconciliation
    useEffect(() => {
        const handleReconciled = (event: Event) => {
            const detail = (event as CustomEvent<{ tempId: string; realId: string | number; resourceUrl: string }>).detail;
            if (!detail) return;
            const { tempId, realId, resourceUrl } = detail;
            if (resourceUrl === INVENTORY && String(watch("id")) === String(tempId)) {
                setValue("id", String(realId), { shouldDirty: false });
            }
            if (String(watch("categoryId")) === String(tempId)) {
                setValue("categoryId", String(realId), { shouldDirty: false });
            }
            if (String(watch("departmentId")) === String(tempId)) {
                setValue("departmentId", String(realId), { shouldDirty: false });
            }
            const currentRows = watch("colorRows") || [];
            let updated = false;
            const nextRows = currentRows.map((r) => {
                if (String(r.stationId) === String(tempId)) {
                    updated = true;
                    return { ...r, stationId: String(realId) };
                }
                return r;
            });
            if (updated) {
                setValue("colorRows", nextRows, { shouldDirty: false });
            }
        };

        window.addEventListener("offline-id-reconciled", handleReconciled);
        return () => window.removeEventListener("offline-id-reconciled", handleReconciled);
    }, [setValue, watch]);

    // 5. Populate form when a record is selected
    useEffect(() => {
        if (!isNewMode && currentRecord) {
            const rows = (currentRecord.stationIds || []).map((sId, idx) => ({
                stationId: String(sId),
                color: currentRecord.color?.[idx] || "",
                qty: String(currentRecord.qty?.[idx] || ""),
            }));
            while (rows.length < 4) {
                rows.push(defaultRow());
            }

            reset({
                id: String(currentRecord.id),
                itemName: currentRecord.itemName,
                categoryId: String(currentRecord.categoryId ?? ""),
                departmentId: String(currentRecord.departmentId ?? ""),
                pack: String(currentRecord.pack ?? ""),
                rate: String(currentRecord.rate ?? ""),
                unitPerBike: String(currentRecord.unitPerBike ?? ""),
                colorRows: rows,
            });
        }
    }, [currentRecord, isNewMode, reset]);

    // 6. Look up record when user types in the ID field
    useEffect(() => {
        if (String(watchedId) !== String(debouncedId)) return;
        const cleanId = String(debouncedId || "").trim();

        if (!cleanId || cleanId === String(nextId) || isIdLoading) return;
        if (!isNewMode && currentRecord && String(currentRecord.id) === cleanId) return;

        // A. Temp ID: search local list only
        if (isTempId(cleanId)) {
            if (isNewMode && cleanId === activeTempIdRef.current) return;
            const found = list.find((item) => String(item.id) === cleanId || String(item.tempId) === cleanId);
            if (found) {
                dispatch(setCurrentRecord(found));
                dispatch(setNewMode(false));
                dispatch(setEditing(false));
            } else {
                const fallback = activeTempIdRef.current || String(nextId || "");
                setValue("id", fallback, { shouldValidate: true, shouldDirty: false });
            }
            return;
        }

        // B. Numeric ID in Offline mode: search offline list only
        if (!isNetworkOnline) {
            const found = list.find((item) => String(item.id) === cleanId);
            if (found) {
                dispatch(setCurrentRecord(found));
                dispatch(setNewMode(false));
                dispatch(setEditing(false));
            } else {
                const fallback = activeTempIdRef.current || String(nextId || "");
                setValue("id", fallback, { shouldValidate: true, shouldDirty: false });
            }
            return;
        }

        // C. Numeric ID in Online mode: Call API via slice thunk
        dispatch(fetchInventoryById(cleanId))
            .unwrap()
            .catch(() => {
                dispatch(clearApiError());
                setValue("id", String(nextId || ""), { shouldValidate: true, shouldDirty: false });
            });
    }, [debouncedId, watchedId, nextId, isNetworkOnline, isNewMode, currentRecord, isIdLoading, list, dispatch, setValue]);

    // 7. Error toast
    useEffect(() => {
        if (apiError) {
            toast.error(apiError);
            dispatch(clearApiError());
        }
    }, [apiError, dispatch]);

    // 8. Submit (Create / Update)
    const onSubmit = handleSubmit(async (data) => {
        if (!isEditing) {
            toast.error("Click Edit first to modify");
            return;
        }
        try {
            if (isNewMode) {
                const result = await dispatch(
                    createInventory({ ...data, id: String(data.id ?? "") })
                ).unwrap();

                activeTempIdRef.current = null;
                toast.success(result._offline ? "Saved offline. It will sync when online." : "Saved successfully");

                if (result._offline) {
                    dispatch(setCurrentRecord(result.data));
                    dispatch(setNewMode(false));
                    dispatch(setEditing(false));
                } else {
                    const next = await dispatch(fetchInventoryNextId()).unwrap();
                    dispatch(setNewMode(true));
                    dispatch(setEditing(true));
                    reset({ ...initialValues, id: String(next.nextId) });
                }
                dispatch(fetchAllInventories({ page: 1, limit: 10 }));
            } else {
                const result = await dispatch(
                    updateInventory({ ...data, id: String(data.id ?? "") })
                ).unwrap();

                activeTempIdRef.current = null;
                toast.success(result._offline ? "Updated offline. It will sync when online." : "Saved successfully");

                if (result._offline) {
                    dispatch(setCurrentRecord(result.data));
                    dispatch(setEditing(false));
                } else {
                    const next = await dispatch(fetchInventoryNextId()).unwrap();
                    dispatch(setNewMode(true));
                    dispatch(setEditing(true));
                    reset({ ...initialValues, id: String(next.nextId) });
                }
                dispatch(fetchAllInventories({ page: 1, limit: 10 }));
            }
        } catch {
            /* error handled in effect */
        }
    });

    // 9. New Entry
    const handleNew = async () => {
        if (!isNetworkOnline) {
            if (isNewMode && activeTempIdRef.current) {
                dispatch(setEditing(true));
                reset({ ...initialValues, id: activeTempIdRef.current });
                return;
            }
            const temp = generateTempId("inv");
            activeTempIdRef.current = temp;
            dispatch(setCurrentRecord(null));
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            dispatch(setNextId(temp));
            reset({ ...initialValues, id: temp });
            return;
        }

        // Online mode: immediately clear inputs and show loading state
        setIsFetchingNew(true);
        dispatch(setCurrentRecord(null));
        dispatch(setNewMode(true));
        dispatch(setEditing(true));
        reset(initialValues);

        try {
            const next = await dispatch(fetchInventoryNextId()).unwrap();
            activeTempIdRef.current = null;
            const newId = String(next.nextId);
            dispatch(setNextId(newId));
            reset({ ...initialValues, id: newId });
        } catch {
            /* error handled in effect */
        } finally {
            setIsFetchingNew(false);
        }
    };

    const handleViewAll = () => {
        setIsViewAllOpen(true);
        if (list.length === 0) dispatch(fetchAllInventories({ page: 1, limit: 10 }));
    };

    const updateColorRow = (index: number, field: "stationId" | "color" | "qty", value: string) => {
        const nextRows = watchedColorRows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
        setValue("colorRows", nextRows, { shouldValidate: true, shouldDirty: true });
    };

    const isRowDisabled = (index: number) => {
        if (!isEditing || isTransitioningOnline) return true;
        if (index === 0) return false;
        const prev = watchedColorRows[index - 1];
        return !(prev && prev.stationId && prev.color && prev.qty);
    };

    const columns: ViewAllColumn<InventoryRecord>[] = [
        { key: "id", header: "ID" },
        { key: "itemName", header: "Item Name" },
        { key: "pack", header: "Pack" },
        { key: "rate", header: "Rate" },
    ];

    return (
        <section className="mx-auto mt-6 w-full max-w-[500px] rounded-xl bg-white p-4 shadow-lg sm:mt-10 sm:max-w-4xl sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">Inventory</h1>
                    {!isNetworkOnline && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Offline
                        </span>
                    )}
                </div>

                <div className="flex w-full gap-2 sm:w-auto">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleNew}
                        disabled={!canCreate || isIdBusy || isTransitioningOnline}
                        className="flex-1 sm:flex-none"
                    >
                        New
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleViewAll}
                        disabled={!canView || isTransitioningOnline}
                        className="flex-1 sm:flex-none"
                    >
                        View All
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        onClick={() => window.open("/print/inventory", "_blank", "noopener,noreferrer")}
                        disabled={!canView || isTransitioningOnline}
                        className="flex-1 sm:flex-none"
                    >
                        Print
                    </Button>
                </div>
            </div>

            <form onSubmit={onSubmit} className="relative space-y-4">
                {/* Row 1: ID + Item Name */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="Inventory ID"
                        type={isNumericMode ? "number" : "text"}
                        min={isNumericMode ? 1 : undefined}
                        placeholder={isIdBusy ? "Loading ID..." : undefined}
                        {...register("id", { valueAsNumber: false })}
                        value={isNewMode ? (isIdBusy ? "" : String(watchedId || nextId || "")) : undefined}
                        onChange={(e) => {
                            setValue("id", e.target.value, { shouldValidate: true, shouldDirty: true });
                        }}
                        onBlur={() => {
                            if (!watchedId || !String(watchedId).trim()) {
                                const fallback = !isNetworkOnline
                                    ? (activeTempIdRef.current || String(nextId || ""))
                                    : String(nextId || "");
                                setValue("id", fallback, { shouldValidate: true, shouldDirty: false });
                            }
                        }}
                        loading={isIdBusy || isLookingUp || isTransitioningOnline}
                        error={errors.id?.message}
                        disabled={isIdBusy || isLookingUp || isTransitioningOnline}
                    />

                    <LabeledField
                        label="Item Name"
                        type="text"
                        {...register("itemName")}
                        error={errors.itemName?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Row 2: Category + Department */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledSelect
                        label="Category"
                        value={watchedCategoryId ?? ""}
                        options={categoryOptions}
                        placeholder="Select Category"
                        onChange={(val) => setValue("categoryId", val, { shouldValidate: true, shouldDirty: true })}
                        error={errors.categoryId?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />

                    <LabeledSelect
                        label="Department"
                        value={watchedDepartmentId ?? ""}
                        options={departmentOptions}
                        placeholder="Select Department"
                        onChange={(val) => setValue("departmentId", val, { shouldValidate: true, shouldDirty: true })}
                        error={errors.departmentId?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Row 3: Unit Per Bike + Pack + Rate */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <LabeledField
                        label="Unit Per Bike"
                        type="number"
                        {...register("unitPerBike")}
                        error={errors.unitPerBike?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledField
                        label="Pack"
                        type="number"
                        {...register("pack")}
                        error={errors.pack?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledField
                        label="Rate"
                        type="number"
                        {...register("rate")}
                        error={errors.rate?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Color Rows Table */}
                <div className="max-h-[300px] overflow-y-auto rounded-lg border border-zinc-200 bg-white">
                    <table className="w-full border-collapse text-sm text-zinc-900">
                        <thead className="sticky top-0 z-10 bg-zinc-50 border-b border-zinc-200">
                            <tr>
                                <th className="border-r border-zinc-200 px-3 py-2 text-left font-medium w-1/2">Station</th>
                                <th className="border-r border-zinc-200 px-3 py-2 text-left font-medium w-1/4">Color</th>
                                <th className="px-3 py-2 text-left font-medium w-1/4">Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                            {watchedColorRows.map((row, index) => (
                                <tr key={index} className="border-b border-zinc-100 last:border-b-0">
                                    <td className="border-r border-zinc-100 p-1">
                                        <select
                                            value={row.stationId || ""}
                                            onChange={(e) => updateColorRow(index, "stationId", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            className="w-full rounded bg-transparent px-2 py-1.5 text-xs text-zinc-800 outline-none focus:bg-primary-50 disabled:bg-zinc-50 disabled:text-zinc-400"
                                        >
                                            <option value="">Select Station</option>
                                            {stationOptions.map((s) => (
                                                <option key={s.value} value={s.value}>
                                                    {s.label}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="border-r border-zinc-100 p-1">
                                        <select
                                            value={row.color || ""}
                                            onChange={(e) => updateColorRow(index, "color", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            className="w-full rounded bg-transparent px-2 py-1.5 text-xs text-zinc-800 outline-none focus:bg-primary-50 disabled:bg-zinc-50 disabled:text-zinc-400"
                                        >
                                            <option value="">Select Color</option>
                                            {COLORS_LIST.map((c) => (
                                                <option key={c.value} value={c.value}>
                                                    {c.label}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="p-1">
                                        <select
                                            value={row.qty || ""}
                                            onChange={(e) => updateColorRow(index, "qty", e.target.value)}
                                            disabled={isRowDisabled(index)}
                                            className="w-full rounded bg-transparent px-2 py-1.5 text-xs text-zinc-800 outline-none focus:bg-primary-50 disabled:bg-zinc-50 disabled:text-zinc-400"
                                        >
                                            <option value="">Select Qty</option>
                                            {QTY_LIST.map((q) => (
                                                <option key={q.value} value={q.value}>
                                                    {q.label}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {(isLookingUp || isTransitioningOnline) && (
                    <LoadingOverlay text={isTransitioningOnline ? "Syncing and loading server ID..." : "Loading inventory..."} />
                )}

                {/* Actions */}
                <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => dispatch(setEditing(true))}
                        disabled={!canUpdate || isEditing || isNewMode || isTransitioningOnline}
                        className="w-full sm:w-auto"
                    >
                        Edit
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        isLoading={isSubmitting}
                        disabled={
                            !isEditing ||
                            (isNewMode ? !canCreate : !canUpdate) ||
                            isBootstrapping ||
                            isTransitioningOnline
                        }
                        className="w-full sm:w-auto"
                    >
                        Save
                    </Button>
                </div>
            </form>

            <ViewAllModal
                isOpen={isViewAllOpen}
                title="All Inventory Items"
                rows={list}
                columns={columns}
                searchKeys={["id", "itemName", "pack", "rate"]}
                isLoading={listStatus === "loading"}
                error={listError || ""}
                onClose={() => setIsViewAllOpen(false)}
                onRowSelect={(row) => {
                    dispatch(setCurrentRecord(row));
                    dispatch(setNewMode(false));
                    dispatch(setEditing(false));
                    setIsViewAllOpen(false);
                }}
            />
        </section>
    );
}
