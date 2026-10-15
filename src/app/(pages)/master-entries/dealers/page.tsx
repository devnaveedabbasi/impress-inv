"use client";

import { useEffect, useState } from "react";
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
import { dealerSchema, type DealerFormValues } from "@/lib/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { isTempId } from "@/store/utils/tempId";
import {
    clearApiError,
    createDealer,
    fetchAllDealers,
    fetchDealerById,
    fetchDealerNextId,
    setCurrentRecord,
    setEditing,
    setNewMode,
    updateDealer,
    type DealerRecord,
} from "@/store/slices/dealerSlice";
import {
    selectDealerApiError,
    selectDealerCurrentRecord,
    selectDealerIsEditing,
    selectDealerIsIdLoading,
    selectDealerIsNewMode,
    selectDealerIsSubmitting,
    selectDealerIsLookingUp,
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

    const canCreate = hasPermission("dealer", "create");
    const canUpdate = hasPermission("dealer", "update");
    const canView = hasPermission("dealer", "view");

    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } =
        useForm<DealerFormValues>({
            resolver: zodResolver(dealerSchema),
            defaultValues: initialValues,
        });

    const watchedId = watch("id");
    const watchedProvinceId = watch("provinceId");
    const debouncedId = useDebounce(watchedId, 500);

    // Load city options based on selected province (from citySlice cache)
    const cityOptions = useAppSelector((s) =>
        selectCityOptionsByProvince(s, String(watchedProvinceId ?? ""))
    );
    const citiesStatus = useAppSelector((s) => s.city.listStatus);

    // ⬇️ Bootstrapping flag: jab tak pehla nextId na aa jaye, form blank na dikhe
    const isBootstrapping = isIdLoading && !nextId;

    useEffect(() => {
        dispatch(fetchDealerNextId());
        dispatch(fetchAllDealers({ page: 1, limit: 10 }));
        dispatch(fetchAllProvinces({ page: 1, limit: 100 }));
        dispatch(fetchAllCities({ page: 1, limit: 500 }));
    }, [dispatch]);

    useEffect(() => {
        if (isNewMode && nextId) reset({ ...initialValues, id: String(nextId) });
    }, [isNewMode, nextId, reset]);

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

    useEffect(() => {
        if (String(watchedId) !== String(debouncedId)) return;
        if (isNewMode && String(debouncedId) === String(nextId)) return;
        if (!debouncedId || String(debouncedId) === String(nextId) || isTempId(debouncedId) || isIdLoading) return;
        dispatch(fetchDealerById(String(debouncedId))).unwrap().catch(() => { });
    }, [debouncedId, watchedId, isNewMode, dispatch, isIdLoading, nextId]);

    useEffect(() => {
        if (apiError) {
            toast.error(apiError);
            dispatch(clearApiError());
        }
    }, [apiError, dispatch]);

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

                // ⬇️ NAYA: offline save detect karo
                if (result._offline) {
                    toast.success("Saved offline");
                    dispatch(fetchAllDealers({ page: 1, limit: 10 }));
                    return;  // ⬅️ form reset MAT karo, wahi temp id rahegi
                }

                // Online save hua — normal flow
                toast.success("Saved successfully");
                const next = await dispatch(fetchDealerNextId()).unwrap();
                dispatch(setNewMode(true));
                dispatch(setEditing(true));
                reset({ ...initialValues, id: next.nextId });
                dispatch(fetchAllDealers({ page: 1, limit: 10 }));

            } else {
                // Update case
                const result = await dispatch(
                    updateDealer({ ...data, id: String(data.id ?? "") })
                ).unwrap();

                // ⬇️ NAYA: update bhi offline ho sakta hai
                if ((result as any)._offline) {
                    toast.success("Updated offline — internet aane pe sync hoga");
                    dispatch(fetchAllDealers({ page: 1, limit: 10 }));
                    return;  // ⬅️ form reset MAT karo
                }

                // Online update hua — normal flow
                toast.success("Saved successfully");
                const next = await dispatch(fetchDealerNextId()).unwrap();
                dispatch(setNewMode(true));
                dispatch(setEditing(true));
                reset({ ...initialValues, id: next.nextId });
                dispatch(fetchAllDealers({ page: 1, limit: 10 }));
            }
        } catch {
            /* apiError toast via effect */
        }
    });
    const handleNew = async () => {
        if (nextId) {
            dispatch(setCurrentRecord(null));
            dispatch(setEditing(true));
            dispatch(setNewMode(true));
            reset({ ...initialValues, id: String(nextId) });
            return;
        }
        const next = await dispatch(fetchDealerNextId()).unwrap();
        dispatch(setNewMode(true));
        dispatch(setEditing(true));
        reset({ ...initialValues, id: next.nextId });
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
                <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">Dealers</h1>
                <div className="flex w-full gap-2 sm:w-auto">
                    <Button type="button" variant="secondary" onClick={handleNew}
                        disabled={!canCreate || isBootstrapping} className="flex-1 sm:flex-none">
                        New
                    </Button>
                    <Button type="button" variant="outline" onClick={handleViewAll}
                        disabled={!canView} className="flex-1 sm:flex-none">
                        View All
                    </Button>

                    <Button
                        type="button"
                        variant="primary"
                        onClick={() => window.open("/print/dealers", "_blank")}
                        disabled={!canView}
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
                        type={isTempId(String(watchedId || nextId || "")) ? "text" : "number"}
                        {...register("id", { valueAsNumber: false })}
                        value={String(watchedId || nextId || "")}
                        min={1}
                        loading={isBootstrapping}
                        error={errors.id?.message}
                        disabled={isIdLoading}
                    />
                    <LabeledField
                        label="Dealership Name" type="text"
                        {...register("dealarShipName")}
                        error={errors.dealarShipName?.message}
                        disabled={!isEditing}
                    />
                </div>

                {/* Row 2: Contact + Sale Tax */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField label="Contact No" type="text"
                        {...register("contactNo")} error={errors.contactNo?.message}
                        disabled={!isEditing} />
                    <LabeledField label="Sale Tax" type="text"
                        {...register("saleTaxNo")} error={errors.saleTaxNo?.message}
                        disabled={!isEditing} />
                </div>

                {/* Row 3: Address + NTN */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField label="Address" type="text"
                        {...register("address")} error={errors.address?.message}
                        disabled={!isEditing} />
                    <LabeledField label="N.T.N.NO" type="text"
                        {...register("NTNNo")} error={errors.NTNNo?.message}
                        disabled={!isEditing} />
                </div>

                {/* Information divider */}
                <div className="flex items-center gap-3 pt-2">
                    <span className="text-sm font-medium text-zinc-700">Information</span>
                    <div className="flex-1 h-px bg-zinc-300" />
                </div>

                {/* Row 4: Name + Mobile */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField label="Name" type="text"
                        {...register("name")} error={errors.name?.message}
                        disabled={!isEditing} />
                    <LabeledField label="Mobile" type="text"
                        {...register("mobileNo")} error={errors.mobileNo?.message}
                        disabled={!isEditing} />
                </div>

                {/* Row 5: Opening Balance + Dealer Type */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField label="Opening Balance" type="number"
                        {...register("opeaningBalance")} error={errors.opeaningBalance?.message}
                        disabled={!isEditing} />
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
                        disabled={!isEditing}
                    />
                </div>

                {/* Row 6: NIC + Province */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <LabeledField label="N.I.C#" type="text" placeholder="12345-1234567-1"
                        {...register("NICNo")} error={errors.NICNo?.message}
                        disabled={!isEditing} maxLength={15} />
                    <LabeledSelect
                        label="Province"
                        value={watchedProvinceId ?? ""}
                        options={provincesStatus === "loading" ? [] : provinceOptions}
                        placeholder={
                            provincesStatus === "loading" ? "Loading provinces..."
                                : provincesStatus === "failed" ? "Failed to load provinces"
                                    : provinceOptions.length === 0 ? "No provinces found"
                                        : "Select Province"
                        }
                        disabled={!isEditing || provincesStatus === "loading"}
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
                            !watchedProvinceId ? "Select Province first"
                                : citiesStatus === "loading" ? "Loading cities..."
                                    : cityOptions.length === 0 ? "No cities found"
                                        : "Select City"
                        }
                        disabled={!isEditing || !watchedProvinceId || citiesStatus === "loading"}
                        isLoading={citiesStatus === "loading"}
                        onChange={(value) => setValue("cityId", value, { shouldValidate: true })}
                        error={errors.cityId?.message}
                    />
                </div>

                {isLookingUp && <LoadingOverlay text="Loading dealer..." />}

                {/* Buttons */}
                <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                    <Button type="submit"
                        disabled={!isEditing || isSubmitting || (isNewMode ? !canCreate : !canUpdate)}
                        isLoading={isSubmitting} className="w-full sm:w-auto">
                        Save
                    </Button>
                    <Button type="button" variant="secondary"
                        onClick={() => dispatch(setEditing(true))}
                        disabled={isSubmitting || isNewMode || isEditing || !canUpdate}
                        className="w-full sm:w-auto">
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