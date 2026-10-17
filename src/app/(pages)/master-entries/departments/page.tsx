"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { LabeledField } from "@/components/ui/LabeledField";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { usePermissions } from "@/hooks/usePermissions";
import useDebounce from "@/hooks/useDebounce";
import { departmentSchema, type DepartmentFormValues } from "@/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { generateTempId, isTempId } from "@/utils/tempId";
import { isOffline } from "@/utils/network";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { DEPARTMENTS } from "@/utils/apiRoutes";
import {
    clearApiError,
    createDepartment,
    fetchAllDepartments,
    fetchDepartmentById,
    fetchDepartmentNextId,
    setCurrentRecord,
    setEditing,
    setNewMode,
    setNextId,
    updateDepartment,
    type DepartmentRecord,
} from "@/store/slices/departmentSlice";
import {
    selectDepartmentApiError,
    selectDepartmentCurrentRecord,
    selectDepartmentIsEditing,
    selectDepartmentIsIdLoading,
    selectDepartmentIsLookingUp,
    selectDepartmentIsNewMode,
    selectDepartmentIsSubmitting,
    selectDepartmentList,
    selectDepartmentListError,
    selectDepartmentListStatus,
    selectDepartmentNextId,
    selectDepartmentPagination,
} from "@/store/selectors/departmentSelectors";

const initialValues: DepartmentFormValues = { id: "", name: "" };

export default function DepartmentPage() {
    const dispatch = useAppDispatch();
    const { hasPermission } = usePermissions();

    const list = useAppSelector(selectDepartmentList);
    const nextId = useAppSelector(selectDepartmentNextId);
    const isNewMode = useAppSelector(selectDepartmentIsNewMode);
    const isEditing = useAppSelector(selectDepartmentIsEditing);
    const isIdLoading = useAppSelector(selectDepartmentIsIdLoading);
    const isSubmitting = useAppSelector(selectDepartmentIsSubmitting);
    const isLookingUp = useAppSelector(selectDepartmentIsLookingUp);
    const listStatus = useAppSelector(selectDepartmentListStatus);
    const listError = useAppSelector(selectDepartmentListError);
    const pagination = useAppSelector(selectDepartmentPagination);
    const currentRecord = useAppSelector(selectDepartmentCurrentRecord);
    const apiError = useAppSelector(selectDepartmentApiError);

    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => !isOffline());
    const [isTransitioningOnline, setIsTransitioningOnline] = useState(false);
    const [isFetchingNew, setIsFetchingNew] = useState(false);

    // Temp ID is preserved until user saves with it
    const activeTempIdRef = useRef<string | null>(null);

    const canCreate = hasPermission("department", "create");
    const canUpdate = hasPermission("department", "update");
    const canView = hasPermission("department", "view");

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors },
    } = useForm<DepartmentFormValues>({
        resolver: zodResolver(departmentSchema),
        defaultValues: initialValues,
    });

    const watchedId = watch("id");
    const debouncedId = useDebounce(watchedId, 500);

    const isIdBusy = isIdLoading || isFetchingNew;
    const isBootstrapping = isNetworkOnline && isIdBusy && !nextId;
    const isCurrentTemp = isTempId(String(watchedId || nextId || ""));
    const isNumericMode = isNetworkOnline && !isCurrentTemp;

    const getOrCreateTempId = () => {
        if (!activeTempIdRef.current) {
            activeTempIdRef.current = generateTempId("dept");
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
            dispatch(fetchDepartmentNextId())
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

        dispatch(fetchAllDepartments({ page: 1, limit: 10 }));
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

                const next = await dispatch(fetchDepartmentNextId()).unwrap();
                const freshId = String(next.nextId);
                dispatch(setNextId(freshId));

                const curId = String(watch("id") || "");
                if (isNewMode || isTempId(curId)) {
                    activeTempIdRef.current = null;
                    setValue("id", freshId, { shouldValidate: true, shouldDirty: false });
                }
                dispatch(fetchAllDepartments({ page: 1, limit: 10 }));
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
            if (resourceUrl === DEPARTMENTS && String(watch("id")) === String(tempId)) {
                setValue("id", String(realId), { shouldDirty: false });
            }
        };

        window.addEventListener("offline-id-reconciled", handleReconciled);
        return () => window.removeEventListener("offline-id-reconciled", handleReconciled);
    }, [setValue, watch]);

    // 5. Populate form when a record is selected
    useEffect(() => {
        if (!isNewMode && currentRecord) {
            reset({
                id: String(currentRecord.id),
                name: currentRecord.name,
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
        dispatch(fetchDepartmentById(cleanId))
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
                const result = await dispatch(createDepartment(data)).unwrap();
                activeTempIdRef.current = null;
                toast.success(result._offline ? "Saved offline. It will sync when online." : "Saved successfully");

                if (result._offline) {
                    dispatch(setCurrentRecord(result.data));
                    dispatch(setNewMode(false));
                    dispatch(setEditing(false));
                } else {
                    const next = await dispatch(fetchDepartmentNextId()).unwrap();
                    dispatch(setNewMode(true));
                    dispatch(setEditing(true));
                    reset({ id: String(next.nextId), name: "" });
                }
                dispatch(fetchAllDepartments({ page: 1, limit: 10 }));
            } else {
                const result = await dispatch(updateDepartment({ ...data, id: String(data.id ?? "") })).unwrap();
                activeTempIdRef.current = null;
                toast.success(result._offline ? "Updated offline. It will sync when online." : "Saved successfully");

                if (result._offline) {
                    dispatch(setCurrentRecord(result.data));
                    dispatch(setEditing(false));
                } else {
                    const next = await dispatch(fetchDepartmentNextId()).unwrap();
                    dispatch(setNewMode(true));
                    dispatch(setEditing(true));
                    reset({ id: String(next.nextId), name: "" });
                }
                dispatch(fetchAllDepartments({ page: 1, limit: 10 }));
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
                reset({ id: activeTempIdRef.current, name: "" });
                return;
            }
            const temp = generateTempId("dept");
            activeTempIdRef.current = temp;
            dispatch(setCurrentRecord(null));
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            dispatch(setNextId(temp));
            reset({ id: temp, name: "" });
            return;
        }

        // Online mode: immediately clear inputs and show loading state on ID input
        setIsFetchingNew(true);
        dispatch(setCurrentRecord(null));
        dispatch(setNewMode(true));
        dispatch(setEditing(true));
        reset({ id: "", name: "" });

        try {
            const next = await dispatch(fetchDepartmentNextId()).unwrap();
            activeTempIdRef.current = null;
            const newId = String(next.nextId);
            dispatch(setNextId(newId));
            reset({ id: newId, name: "" });
        } catch {
            /* error handled in effect */
        } finally {
            setIsFetchingNew(false);
        }
    };

    const handleViewAll = () => {
        setIsViewAllOpen(true);
        if (list.length === 0) dispatch(fetchAllDepartments({ page: 1, limit: 10 }));
    };

    const columns: ViewAllColumn<DepartmentRecord>[] = [
        { key: "id", header: "ID" },
        { key: "name", header: "Name" },
    ];

    return (
        <section className="mx-auto w-full max-w-[500px] rounded-xl bg-white p-4 shadow-lg sm:mt-10 sm:max-w-3xl sm:p-6">
            {/* Header — stacks on mobile */}
            <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">Departments</h1>
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
                </div>
            </div>

            <form onSubmit={onSubmit} className="relative space-y-4">
                <LabeledField
                    label="ID"
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
                    label="Name"
                    type="text"
                    {...register("name")}
                    error={errors.name?.message}
                    disabled={!isEditing || isTransitioningOnline}
                />

                {(isLookingUp || isTransitioningOnline) && (
                    <LoadingOverlay text={isTransitioningOnline ? "Syncing and loading server ID..." : "Loading department..."} />
                )}

                {/* Action buttons */}
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
                title="All Departments"
                rows={list}
                columns={columns}
                searchKeys={["id", "name"]}
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
