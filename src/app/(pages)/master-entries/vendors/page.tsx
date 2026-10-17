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
import { vendorSchema, type VendorFormValues } from "@/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { generateTempId, isTempId } from "@/utils/tempId";
import { isOffline } from "@/utils/network";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { VENDORS } from "@/utils/apiRoutes";
import {
    clearApiError,
    createVendor,
    fetchAllVendors,
    fetchVendorById,
    fetchVendorNextId,
    setCurrentRecord,
    setEditing,
    setNewMode,
    setNextId,
    updateVendor,
    type VendorRecord,
} from "@/store/slices/vendorSlice";
import {
    selectVendorApiError,
    selectVendorCurrentRecord,
    selectVendorIsEditing,
    selectVendorIsIdLoading,
    selectVendorIsLookingUp,
    selectVendorIsNewMode,
    selectVendorIsSubmitting,
    selectVendorList,
    selectVendorListError,
    selectVendorListStatus,
    selectVendorNextId,
    selectVendorPagination,
} from "@/store/selectors/vendorSelectors";
import { selectProvinceOptionsMerged, selectProvincesStatus } from "@/store/selectors/provinceSelectors";
import { selectCityOptionsByProvince } from "@/store/selectors/citySelectors";
import { fetchAllProvinces } from "@/store/slices/provinceSlice";
import { fetchAllCities } from "@/store/slices/citySlice";

const initialValues: VendorFormValues = {
    id: "",
    vendorName: "",
    address: "",
    provinceId: "",
    cityId: "",
    contactNo: "",
    saleTaxNo: "",
    NICNo: "",
    mobileNo: "",
    daysLimit: "",
    amoutLimit: "",
    NTNNo: "",
    openingBalance: "",
    CNICNo: "",
};

export default function VendorPage() {
    const dispatch = useAppDispatch();
    const { hasPermission } = usePermissions();

    const list = useAppSelector(selectVendorList);
    const nextId = useAppSelector(selectVendorNextId);
    const isNewMode = useAppSelector(selectVendorIsNewMode);
    const isEditing = useAppSelector(selectVendorIsEditing);
    const isIdLoading = useAppSelector(selectVendorIsIdLoading);
    const isSubmitting = useAppSelector(selectVendorIsSubmitting);
    const isLookingUp = useAppSelector(selectVendorIsLookingUp);
    const listStatus = useAppSelector(selectVendorListStatus);
    const listError = useAppSelector(selectVendorListError);
    const pagination = useAppSelector(selectVendorPagination);
    const currentRecord = useAppSelector(selectVendorCurrentRecord);
    const apiError = useAppSelector(selectVendorApiError);

    const provinceOptions = useAppSelector(selectProvinceOptionsMerged);
    const provincesStatus = useAppSelector(selectProvincesStatus);

    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => !isOffline());
    const [isTransitioningOnline, setIsTransitioningOnline] = useState(false);
    const [isFetchingNew, setIsFetchingNew] = useState(false);

    // Temp ID is preserved until user saves (PUT/POST) with it
    const activeTempIdRef = useRef<string | null>(null);

    const canCreate = hasPermission("vendor", "create");
    const canUpdate = hasPermission("vendor", "update");
    const canView = hasPermission("vendor", "view");

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors },
    } = useForm<VendorFormValues>({
        resolver: zodResolver(vendorSchema),
        defaultValues: initialValues,
    });

    const watchedId = watch("id");
    const watchedProvinceId = watch("provinceId");
    const debouncedId = useDebounce(watchedId, 500);

    const cityOptions = useAppSelector((s) =>
        selectCityOptionsByProvince(s, String(watchedProvinceId ?? ""))
    );
    const citiesStatus = useAppSelector((s) => s.city.listStatus);

    const isIdBusy = isIdLoading || isFetchingNew;
    const isBootstrapping = isNetworkOnline && isIdBusy && !nextId;
    const isCurrentTemp = isTempId(String(watchedId || nextId || ""));
    const isNumericMode = isNetworkOnline && !isCurrentTemp;

    const getOrCreateTempId = () => {
        if (!activeTempIdRef.current) {
            activeTempIdRef.current = generateTempId("vendor");
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
            dispatch(fetchVendorNextId())
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

        dispatch(fetchAllVendors({ page: 1, limit: 10 }));
        dispatch(fetchAllProvinces({ page: 1, limit: 100 }));
        dispatch(fetchAllCities({ page: 1, limit: 1000 }));
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

                const next = await dispatch(fetchVendorNextId()).unwrap();
                const freshId = String(next.nextId);
                dispatch(setNextId(freshId));

                const curId = String(watch("id") || "");
                if (isNewMode || isTempId(curId)) {
                    activeTempIdRef.current = null;
                    setValue("id", freshId, { shouldValidate: true, shouldDirty: false });
                }
                dispatch(fetchAllVendors({ page: 1, limit: 10 }));
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
            if (resourceUrl === VENDORS && String(watch("id")) === String(tempId)) {
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
                vendorName: currentRecord.vendorName,
                address: currentRecord.address,
                provinceId: String(currentRecord.provinceId ?? ""),
                cityId: String(currentRecord.cityId ?? ""),
                contactNo: currentRecord.contactNo,
                saleTaxNo: currentRecord.saleTaxNo,
                NICNo: currentRecord.NICNo,
                mobileNo: currentRecord.mobileNo,
                daysLimit: String(currentRecord.daysLimit ?? ""),
                amoutLimit: String(currentRecord.amoutLimit ?? ""),
                NTNNo: currentRecord.NTNNo,
                openingBalance: String(currentRecord.openingBalance ?? ""),
                CNICNo: currentRecord.CNICNo,
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
        dispatch(fetchVendorById(cleanId))
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
                    createVendor({ ...data, id: String(data.id ?? "") })
                ).unwrap();

                activeTempIdRef.current = null;
                toast.success(result._offline ? "Saved offline. It will sync when online." : "Saved successfully");

                if (result._offline) {
                    dispatch(setCurrentRecord(result.data));
                    dispatch(setNewMode(false));
                    dispatch(setEditing(false));
                } else {
                    const next = await dispatch(fetchVendorNextId()).unwrap();
                    dispatch(setNewMode(true));
                    dispatch(setEditing(true));
                    reset({ ...initialValues, id: String(next.nextId) });
                }
                dispatch(fetchAllVendors({ page: 1, limit: 10 }));
            } else {
                const result = await dispatch(
                    updateVendor({ ...data, id: String(data.id ?? "") })
                ).unwrap();

                activeTempIdRef.current = null;
                toast.success(result._offline ? "Updated offline. It will sync when online." : "Saved successfully");

                if (result._offline) {
                    dispatch(setCurrentRecord(result.data));
                    dispatch(setEditing(false));
                } else {
                    const next = await dispatch(fetchVendorNextId()).unwrap();
                    dispatch(setNewMode(true));
                    dispatch(setEditing(true));
                    reset({ ...initialValues, id: String(next.nextId) });
                }
                dispatch(fetchAllVendors({ page: 1, limit: 10 }));
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
            const temp = generateTempId("vendor");
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
            const next = await dispatch(fetchVendorNextId()).unwrap();
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
        if (list.length === 0) dispatch(fetchAllVendors({ page: 1, limit: 10 }));
    };

    const handleProvinceChange = (value: string) => {
        setValue("provinceId", value, { shouldValidate: true, shouldDirty: true });
        setValue("cityId", "", { shouldValidate: false });
    };

    const columns: ViewAllColumn<VendorRecord>[] = [
        { key: "id", header: "ID" },
        { key: "vendorName", header: "Vendor Name" },
        { key: "contactNo", header: "Contact" },
        { key: "mobileNo", header: "Mobile" },
    ];

    return (
        <section className="mx-auto mt-6 w-full max-w-[500px] rounded-xl bg-white p-4 shadow-lg sm:mt-10 sm:max-w-4xl sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">Vendors</h1>
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
                        onClick={() => window.open("/print/vendors", "_blank", "noopener,noreferrer")}
                        disabled={!canView || isTransitioningOnline}
                        className="flex-1 sm:flex-none"
                    >
                        Print
                    </Button>
                </div>
            </div>

            <form onSubmit={onSubmit} className="relative space-y-4">
                {/* Row 1: ID + Vendor Name */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="Vendor ID"
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
                        label="Vendor Name"
                        type="text"
                        {...register("vendorName")}
                        error={errors.vendorName?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Row 2: Address */}
                <LabeledField
                    label="Address"
                    type="text"
                    {...register("address")}
                    error={errors.address?.message}
                    disabled={!isEditing || isTransitioningOnline}
                />

                {/* Row 3: Province + City */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                                        ? "No provinces available"
                                        : "Select Province"
                        }
                        onChange={handleProvinceChange}
                        error={errors.provinceId?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />

                    <LabeledSelect
                        label="City"
                        value={watch("cityId") ?? ""}
                        options={cityOptions}
                        placeholder={
                            !watchedProvinceId
                                ? "Select a province first"
                                : citiesStatus === "loading" && cityOptions.length === 0
                                    ? "Loading cities..."
                                    : cityOptions.length === 0
                                        ? "No cities available"
                                        : "Select City"
                        }
                        onChange={(value) => {
                            setValue("cityId", value, { shouldValidate: true, shouldDirty: true });
                        }}
                        error={errors.cityId?.message}
                        disabled={!isEditing || !watchedProvinceId || isTransitioningOnline}
                    />
                </div>

                {/* Row 4: Contact + Mobile */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="Contact No"
                        type="text"
                        {...register("contactNo")}
                        error={errors.contactNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledField
                        label="Mobile No"
                        type="text"
                        placeholder="03001234567"
                        {...register("mobileNo")}
                        error={errors.mobileNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Row 5: Sale Tax No + NIC No */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="Sale Tax No"
                        type="text"
                        {...register("saleTaxNo")}
                        error={errors.saleTaxNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledField
                        label="N.I.C No"
                        type="text"
                        placeholder="12345-1234567-1"
                        {...register("NICNo")}
                        error={errors.NICNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Row 6: CNIC No + NTN No */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField
                        label="CNIC No"
                        type="text"
                        placeholder="12345-1234567-1"
                        {...register("CNICNo")}
                        error={errors.CNICNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledField
                        label="NTN No"
                        type="text"
                        placeholder="1234567-8"
                        {...register("NTNNo")}
                        error={errors.NTNNo?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {/* Row 7: Days Limit + Account Limit + Opening Balance */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <LabeledField
                        label="Days Limit"
                        type="number"
                        {...register("daysLimit")}
                        error={errors.daysLimit?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledField
                        label="Account Limit"
                        type="number"
                        {...register("amoutLimit")}
                        error={errors.amoutLimit?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                    <LabeledField
                        label="Opening Balance"
                        type="number"
                        {...register("openingBalance")}
                        error={errors.openingBalance?.message}
                        disabled={!isEditing || isTransitioningOnline}
                    />
                </div>

                {(isLookingUp || isTransitioningOnline) && (
                    <LoadingOverlay text={isTransitioningOnline ? "Syncing and loading server ID..." : "Loading vendor..."} />
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
                title="All Vendors"
                rows={list}
                columns={columns}
                searchKeys={["id", "vendorName", "contactNo", "mobileNo"]}
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
