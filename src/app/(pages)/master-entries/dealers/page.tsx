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
import { dealerSchema, type DealerFormValues } from "@/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { generateTempId, isTempId } from "@/utils/tempId";
import { isOffline } from "@/utils/network";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { DEALERS } from "@/utils/apiRoutes";
import {
    clearApiError,
    createDealer,
    fetchAllDealers,
    fetchDealerById,
    fetchDealerNextId,
    setCurrentRecord,
    setEditing,
    setNewMode,
    setNextId,
    updateDealer,
    type DealerRecord,
} from "@/store/slices/dealerSlice";
import {
    selectDealerApiError,
    selectDealerCurrentRecord,
    selectDealerIsEditing,
    selectDealerIsIdLoading,
    selectDealerIsLookingUp,
    selectDealerIsNewMode,
    selectDealerIsSubmitting,
    selectDealerList,
    selectDealerListError,
    selectDealerListStatus,
    selectDealerNextId,
    selectDealerPagination,
} from "@/store/selectors/dealerSelectors";
import {
    selectProvinceOptionsMerged,
    selectProvincesStatus,
} from "@/store/selectors/provinceSelectors";
import { selectCityOptionsByProvince } from "@/store/selectors/citySelectors";
import { fetchAllProvinces } from "@/store/slices/provinceSlice";
import { fetchAllCities } from "@/store/slices/citySlice";

const initialValues: DealerFormValues = {
    id: "",
    dealarShipName: "",
    contactNo: "",
    address: "",
    saleTaxNo: "",
    NTNNo: "",
    name: "",
    provinceId: "",
    cityId: "",
    mobileNo: "",
    opeaningBalance: "",
    dealarType: "single",
    NICNo: "",
};

export default function DealerPage() {
    const dispatch = useAppDispatch();
    const { hasPermission } = usePermissions();

    const list = useAppSelector(selectDealerList);
    const nextId = useAppSelector(selectDealerNextId);
    const isNewMode = useAppSelector(selectDealerIsNewMode);
    const isEditing = useAppSelector(selectDealerIsEditing);
    const isIdLoading = useAppSelector(selectDealerIsIdLoading);
    const isSubmitting = useAppSelector(selectDealerIsSubmitting);
    const isLookingUp = useAppSelector(selectDealerIsLookingUp);
    const listStatus = useAppSelector(selectDealerListStatus);
    const listError = useAppSelector(selectDealerListError);
    const pagination = useAppSelector(selectDealerPagination);
    const currentRecord = useAppSelector(selectDealerCurrentRecord);
    const apiError = useAppSelector(selectDealerApiError);

    const provinceOptions = useAppSelector(selectProvinceOptionsMerged);
    const provincesStatus = useAppSelector(selectProvincesStatus);

    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => !isOffline());
    const [isTransitioningOnline, setIsTransitioningOnline] = useState(false);

    // Temp ID is preserved until user saves (PUT/POST) with it
    const activeTempIdRef = useRef<string | null>(null);

    const canCreate = hasPermission("dealer", "create");
    const canUpdate = hasPermission("dealer", "update");
    const canView = hasPermission("dealer", "view");

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors },
    } = useForm<DealerFormValues>({
        resolver: zodResolver(dealerSchema),
        defaultValues: initialValues,
    });

    const watchedId = watch("id");
    const watchedProvinceId = watch("provinceId");
    const debouncedId = useDebounce(watchedId, 500);

    const cityOptions = useAppSelector((s) =>
        selectCityOptionsByProvince(s, String(watchedProvinceId ?? ""))
    );
    const citiesStatus = useAppSelector((s) => s.city.listStatus);

    const isBootstrapping = isNetworkOnline && isIdLoading && !nextId;
    const isCurrentTemp = isTempId(String(watchedId || nextId || ""));
    // Input type: "number" when mode is online and not holding a temp ID, otherwise "text"
    const isNumericMode = isNetworkOnline && !isCurrentTemp;

    // Helper: generate temp ID only once per unsaved entry
    const getOrCreateTempId = () => {
        if (!activeTempIdRef.current) {
            activeTempIdRef.current = generateTempId("dealer");
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
            dispatch(fetchDealerNextId())
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

        dispatch(fetchAllDealers({ page: 1, limit: 10 }));
        dispatch(fetchAllProvinces({ page: 1, limit: 100 }));
        dispatch(fetchAllCities({ page: 1, limit: 500 }));
    }, [dispatch, setValue]);

    // 2. Redux nextId watcher for new mode
    useEffect(() => {
        if (isNewMode && nextId && !isTempId(nextId) && isNetworkOnline) {
            activeTempIdRef.current = null;
            setValue("id", String(nextId), { shouldValidate: true, shouldDirty: false });
        }
    }, [nextId, isNewMode, isNetworkOnline, setValue]);

    // 3. Network Events (Live instant switch without page refresh)
    useEffect(() => {
        const handleOnline = async () => {
            setIsNetworkOnline(true);
            setIsTransitioningOnline(true);

            try {
                // Process queue & wait for sync
                await offlineSyncService.processQueue().catch(() => null);
                await new Promise((resolve) => setTimeout(resolve, 300));

                // Fetch real server next ID
                const nextRes = await dispatch(fetchDealerNextId()).unwrap();
                const serverId = String(nextRes.nextId);

                if (serverId && !isTempId(serverId)) {
                    dispatch(setNextId(serverId));
                    activeTempIdRef.current = null;
                    const curId = String(watch("id"));
                    // Auto-replace temp ID with real server ID on fresh entry
                    if (isNewMode || isTempId(curId)) {
                        setValue("id", serverId, { shouldValidate: true, shouldDirty: false });
                    }
                }

                void dispatch(fetchAllDealers({ page: 1, limit: 10 }));
                toast.success("Back online. Server ID loaded.", { id: "network-status" });
            } catch (err) {
                console.warn("Online reconnect error:", err);
            } finally {
                setIsTransitioningOnline(false);
            }
        };

        const handleOffline = () => {
            setIsNetworkOnline(false);
            const curId = String(watch("id"));

            // Special Case: If user was viewing a saved record (isNewMode === false), KEEP VIEWING IT!
            // Only switch to temp ID if user was in new mode or already holding a temp ID
            if (isNewMode || isTempId(curId)) {
                const temp = getOrCreateTempId();
                dispatch(setNextId(temp));
                setValue("id", temp, { shouldValidate: true, shouldDirty: false });
                toast("Offline mode active: Using temporary ID", { id: "network-status", icon: "📡" });
            } else {
                toast("Internet connection lost. Working offline.", { id: "network-status", icon: "📡" });
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

            if (resourceUrl === DEALERS && String(watch("id")) === String(tempId)) {
                setValue("id", String(realId), { shouldDirty: false });
            }
            if (String(watch("provinceId")) === String(tempId)) {
                setValue("provinceId", String(realId), { shouldDirty: false });
            }
            if (String(watch("cityId")) === String(tempId)) {
                setValue("cityId", String(realId), { shouldDirty: false });
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
                dealarShipName: currentRecord.dealarShipName ?? "",
                contactNo: currentRecord.contactNo ?? "",
                address: currentRecord.address ?? "",
                saleTaxNo: currentRecord.saleTaxNo ?? "",
                NTNNo: currentRecord.NTNNo ?? "",
                name: currentRecord.name ?? "",
                provinceId: String(currentRecord.provinceId ?? ""),
                cityId: String(currentRecord.cityId ?? ""),
                mobileNo: currentRecord.mobileNo ?? "",
                opeaningBalance: String(currentRecord.opeaningBalance ?? ""),
                dealarType: currentRecord.dealarType === "dealar" ? "dealar" : "single",
                NICNo: currentRecord.NICNo ?? "",
            });
        }
    }, [currentRecord, isNewMode, reset]);

    // 6. Look up record when user types in the ID field
    useEffect(() => {
        if (String(watchedId) !== String(debouncedId)) return;
        const cleanId = String(debouncedId || "").trim();

        // Never look up empty ID, current record, or placeholder nextId
        if (!cleanId || cleanId === String(nextId) || isIdLoading) return;
        if (!isNewMode && currentRecord && String(currentRecord.id) === cleanId) return;

        // A. Temp ID: NEVER call GetByID API! Search offline/local storage only
        if (isTempId(cleanId)) {
            if (isNewMode && cleanId === activeTempIdRef.current) return;
            const found = list.find((d) => String(d.id) === cleanId || String(d.tempId) === cleanId);
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

        // B. Numeric ID in Offline mode: Search offline list only
        if (!isNetworkOnline) {
            const found = list.find((d) => String(d.id) === cleanId);
            if (found) {
                dispatch(setCurrentRecord(found));
                dispatch(setNewMode(false));
                dispatch(setEditing(false));
            } else {
                toast.error(`Dealer ID "${cleanId}" not found in offline records.`);
                const fallback = activeTempIdRef.current || String(nextId || "");
                setValue("id", fallback, { shouldValidate: true, shouldDirty: false });
            }
            return;
        }

        // C. Numeric ID in Online mode: Call API via slice thunk
        dispatch(fetchDealerById(cleanId))
            .unwrap()
            .catch(() => {
                dispatch(clearApiError());
                // Auto-restore server nextId (no stuck error state)
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
                    createDealer({ ...data, id: String(data.id ?? "") })
                ).unwrap();

                // Clear temp ID reference once saved with it
                activeTempIdRef.current = null;
                toast.success(result._offline ? "Saved offline. It will sync when online." : "Saved successfully");

                if (result._offline) {
                    dispatch(setCurrentRecord(result.data));
                    dispatch(setNewMode(false));
                    dispatch(setEditing(false));
                } else {
                    const next = await dispatch(fetchDealerNextId()).unwrap();
                    dispatch(setNewMode(true));
                    dispatch(setEditing(true));
                    reset({ ...initialValues, id: String(next.nextId) });
                }
                dispatch(fetchAllDealers({ page: 1, limit: 10 }));
            } else {
                const result = await dispatch(
                    updateDealer({ ...data, id: String(data.id ?? "") })
                ).unwrap();

                activeTempIdRef.current = null;
                toast.success(result._offline ? "Updated offline. It will sync when online." : "Saved successfully");

                if (result._offline) {
                    dispatch(setCurrentRecord(result.data));
                    dispatch(setEditing(false));
                } else {
                    const next = await dispatch(fetchDealerNextId()).unwrap();
                    dispatch(setNewMode(true));
                    dispatch(setEditing(true));
                    reset({ ...initialValues, id: String(next.nextId) });
                }
                dispatch(fetchAllDealers({ page: 1, limit: 10 }));
            }
        } catch {
            /* error handled in effect */
        }
    });

    // 9. New Entry
    const handleNew = async () => {
        if (!isNetworkOnline) {
            // Offline: Preserve temp ID if already in new mode
            if (isNewMode && activeTempIdRef.current) {
                dispatch(setEditing(true));
                reset({ ...initialValues, id: activeTempIdRef.current });
                return;
            }
            // Offline from saved record: generate temp ID once
            const temp = generateTempId("dealer");
            activeTempIdRef.current = temp;
            dispatch(setCurrentRecord(null));
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            dispatch(setNextId(temp));
            reset({ ...initialValues, id: temp });
            return;
        }

        // Online mode:
        if (isNewMode && nextId && !isTempId(nextId)) {
            dispatch(setEditing(true));
            reset({ ...initialValues, id: String(nextId) });
            return;
        }

        try {
            const next = await dispatch(fetchDealerNextId()).unwrap();
            activeTempIdRef.current = null;
            dispatch(setCurrentRecord(null));
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            reset({ ...initialValues, id: String(next.nextId) });
        } catch {
            /* error handled in effect */
        }
    };

    const handleViewAll = () => {
        setIsViewAllOpen(true);
        if (list.length === 0) dispatch(fetchAllDealers({ page: 1, limit: 10 }));
    };

    const handleProvinceChange = (value: string) => {
        setValue("provinceId", value, { shouldValidate: true, shouldDirty: true });
        setValue("cityId", "", { shouldValidate: false });
    };

    const columns: ViewAllColumn<DealerRecord>[] = [
        { key: "id", header: "ID" },
        { key: "dealarShipName", header: "Dealership" },
        { key: "name", header: "Contact" },
        { key: "contactNo", header: "Phone" },
    ];

    return (
        <section className="mx-auto mt-6 w-full max-w-[500px] rounded-xl bg-white p-4 shadow-lg sm:mt-10 sm:max-w-4xl sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">Dealers</h1>
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
                        disabled={!canCreate || isBootstrapping || isTransitioningOnline}
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
                        onClick={() => window.open("/print/dealers", "_blank", "noopener,noreferrer")}
                        disabled={!canView || isTransitioningOnline}
                        className="flex-1 sm:flex-none"
                    >
                        Print
                    </Button>
                </div>
            </div>

            <form onSubmit={onSubmit} className="relative space-y-4">
                {/* Row 1: ID + Dealership */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="Dealer ID"
                        type={isNumericMode ? "number" : "text"}
                        min={isNumericMode ? 1 : undefined}
                        {...register("id", { valueAsNumber: false })}
                        value={isNewMode ? String(watchedId || nextId || "") : undefined}
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
                        loading={isBootstrapping || isLookingUp || isTransitioningOnline}
                        error={errors.id?.message}
                        disabled={isIdLoading || isLookingUp || isTransitioningOnline}
                    />

                    <LabeledField
                        label="Dealership Name"
                        type="text"
                        {...register("dealarShipName")}
                        error={errors.dealarShipName?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Row 2: Contact + Sale Tax */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="Contact No"
                        type="text"
                        {...register("contactNo")}
                        error={errors.contactNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledField
                        label="Sale Tax"
                        type="text"
                        {...register("saleTaxNo")}
                        error={errors.saleTaxNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Row 3: Address + NTN */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="Address"
                        type="text"
                        {...register("address")}
                        error={errors.address?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledField
                        label="N.T.N.NO"
                        type="text"
                        {...register("NTNNo")}
                        error={errors.NTNNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Information divider */}
                <div className="flex items-center gap-3 pt-2">
                    <span className="text-sm font-medium text-zinc-700">Information</span>
                    <div className="flex-1 h-px bg-zinc-300" />
                </div>

                {/* Row 4: Name + Mobile */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="Name"
                        type="text"
                        {...register("name")}
                        error={errors.name?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledField
                        label="Mobile"
                        type="text"
                        {...register("mobileNo")}
                        error={errors.mobileNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Row 5: Opening Balance + Dealer Type */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="Opening Balance"
                        type="number"
                        {...register("opeaningBalance")}
                        error={errors.opeaningBalance?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledSelect
                        label="Dealer Type"
                        value={watch("dealarType") ?? "single"}
                        options={[
                            { label: "Single", value: "single" },
                            { label: "Dealer", value: "dealar" },
                        ]}
                        onChange={(value) => {
                            if (value === "single" || value === "dealar") {
                                setValue("dealarType", value, { shouldValidate: true });
                            }
                        }}
                        error={errors.dealarType?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Row 6: NIC + Province */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="N.I.C#"
                        type="text"
                        placeholder="12345-1234567-1"
                        {...register("NICNo")}
                        error={errors.NICNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                        maxLength={15}
                    />
                    <LabeledSelect
                        label="Province"
                        value={watchedProvinceId ?? ""}
                        options={provinceOptions}
                        placeholder={
                            provincesStatus === "loading" && provinceOptions.length === 0
                                ? "Loading provinces..."
                                : provincesStatus === "failed" && provinceOptions.length === 0
                                    ? "Failed to load provinces"
                                    : provinceOptions.length === 0
                                        ? "No provinces found"
                                        : "Select Province"
                        }
                        disabled={!isEditing || (provincesStatus === "loading" && provinceOptions.length === 0) || isTransitioningOnline}
                        isLoading={provincesStatus === "loading"}
                        onChange={handleProvinceChange}
                        error={errors.provinceId?.message}
                    />
                </div>

                {/* Row 7: City */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledSelect
                        label="City"
                        value={watch("cityId") ?? ""}
                        options={!watchedProvinceId ? [] : cityOptions}
                        placeholder={
                            !watchedProvinceId
                                ? "Select Province first"
                                : citiesStatus === "loading"
                                    ? "Loading cities..."
                                    : cityOptions.length === 0
                                        ? "No cities found"
                                        : "Select City"
                        }
                        disabled={!isEditing || !watchedProvinceId || citiesStatus === "loading" || isTransitioningOnline}
                        isLoading={citiesStatus === "loading"}
                        onChange={(value) => setValue("cityId", value, { shouldValidate: true })}
                        error={errors.cityId?.message}
                    />
                </div>

                {(isLookingUp || isTransitioningOnline) && (
                    <LoadingOverlay text={isTransitioningOnline ? "Syncing and loading server ID..." : "Loading dealer..."} />
                )}

                {/* Action buttons */}
                <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                    <Button
                        type="submit"
                        disabled={!isEditing || isSubmitting || isTransitioningOnline || (isNewMode ? !canCreate : !canUpdate)}
                        isLoading={isSubmitting}
                        className="w-full sm:w-auto"
                    >
                        Save
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => dispatch(setEditing(true))}
                        disabled={isSubmitting || isNewMode || isEditing || !canUpdate || isTransitioningOnline}
                        className="w-full sm:w-auto"
                    >
                        Edit
                    </Button>
                </div>
            </form>

            <ViewAllModal
                isOpen={isViewAllOpen}
                title="Dealers"
                rows={list}
                columns={columns}
                searchKeys={["id", "dealarShipName", "name", "contactNo"]}
                isLoading={listStatus === "loading"}
                error={listError ?? undefined}
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                onPageChange={(page) => dispatch(fetchAllDealers({ page, limit: pagination.limit }))}
                onRetry={() => dispatch(fetchAllDealers({ page: pagination.page, limit: pagination.limit }))}
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