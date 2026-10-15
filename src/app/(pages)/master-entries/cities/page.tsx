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
import { citySchema, type CityFormValues } from "@/lib/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { isTempId } from "@/store/utils/tempId";
import {
    clearApiError, createCity, fetchAllCities, fetchCityById, fetchCityNextId, fetchProvinceOptions,
    setCurrentRecord, setEditing, setNewMode, updateCity, type CityRecord,
} from "@/store/slices/citySlice";
import { fetchAllProvinces } from "@/store/slices/provinceSlice";
import {
    selectCityApiError, selectCityCurrentRecord, selectCityIsEditing, selectCityIsIdLoading,
    selectCityIsLookingUp, selectCityIsNewMode, selectCityIsSubmitting,
    selectCityList, selectCityListError, selectCityListStatus, selectCityNextId,
    selectCityPagination,
} from "@/store/selectors/citySelectors";
import { selectProvinceOptionsMerged, selectProvincesStatus } from "@/store/selectors/provinceSelectors";

const initialValues: CityFormValues = { id: "", name: "", provinceId: "" };

export default function CityPage() {
    const dispatch = useAppDispatch();
    const { hasPermission } = usePermissions();
    const list = useAppSelector(selectCityList);
    const nextId = useAppSelector(selectCityNextId);
    const isNewMode = useAppSelector(selectCityIsNewMode);
    const isEditing = useAppSelector(selectCityIsEditing);
    const isIdLoading = useAppSelector(selectCityIsIdLoading);
    const isLookingUp = useAppSelector(selectCityIsLookingUp);
    const isSubmitting = useAppSelector(selectCityIsSubmitting);
    const listStatus = useAppSelector(selectCityListStatus);
    const listError = useAppSelector(selectCityListError);
    const pagination = useAppSelector(selectCityPagination);
    const currentRecord = useAppSelector(selectCityCurrentRecord);
    const apiError = useAppSelector(selectCityApiError);
    const provinceOptions = useAppSelector(selectProvinceOptionsMerged);
    const provincesStatus = useAppSelector(selectProvincesStatus);
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const canCreate = hasPermission("city", "create");
    const canUpdate = hasPermission("city", "update");
    const canView = hasPermission("city", "view");

    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } =
        useForm<CityFormValues>({ resolver: zodResolver(citySchema), defaultValues: initialValues });
    const watchedId = watch("id");
    const watchedProvinceId = watch("provinceId");
    const debouncedId = useDebounce(watchedId, 500);
    const isBootstrapping = isIdLoading && !nextId;
    // Initial load
    useEffect(() => {
        dispatch(fetchCityNextId());
        dispatch(fetchAllCities({ page: 1, limit: 10 }));
        dispatch(fetchAllProvinces({ page: 1, limit: 10 }));
        dispatch(fetchProvinceOptions());
    }, [dispatch]);

    // New mode mein nextId aane par reset
    useEffect(() => {
        if (isNewMode && nextId) reset({ id: String(nextId), name: "", provinceId: "" });
    }, [isNewMode, nextId, reset]);

    // View mode mein selected record aane par reset
    useEffect(() => {
        if (!isNewMode && currentRecord) reset({
            id: String(currentRecord.id),
            name: currentRecord.name,
            provinceId: String(currentRecord.provinceId ?? ""),
        });
    }, [currentRecord, isNewMode, reset]);

    // FIX #1: debounce settle hone tak wait karo (stale debouncedId se bachao)
    // FIX #2: new mode mein khud ka set kiya nextId lookup mat karo
    useEffect(() => {
        if (String(watchedId) !== String(debouncedId)) return;
        if (isNewMode && String(debouncedId) === String(nextId)) return;
        if (!debouncedId || String(debouncedId) === String(nextId) || isTempId(debouncedId) || isIdLoading) return;
        dispatch(fetchCityById(String(debouncedId))).unwrap().catch(() => {
            setValue("name", "");
            setValue("provinceId", "");
        });
    }, [debouncedId, watchedId, isNewMode, dispatch, isIdLoading, nextId, setValue]);

    // API error toast
    useEffect(() => {
        if (apiError) { toast.error(apiError); dispatch(clearApiError()); }
    }, [apiError, dispatch]);

    const onSubmit = handleSubmit(async (data) => {
        if (!isEditing) {
            toast.error("Click Edit first to modify");
            return;
        }
        try {
            if (isNewMode) await dispatch(createCity(data)).unwrap();
            else await dispatch(updateCity({ ...data, id: String(data.id ?? "") })).unwrap();
            toast.success("Saved successfully");
            const next = await dispatch(fetchCityNextId()).unwrap();
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            reset({ id: next.nextId, name: "", provinceId: "" });
            dispatch(fetchAllCities({ page: 1, limit: 10 }));
        } catch { /* apiError toast via effect */ }
    });

    // FIX #3: nextId already ho to API dobara mat maaro (5-7 sec delay khatam)
    const handleNew = async () => {
        if (nextId) {
            dispatch(setCurrentRecord(null));
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            reset({ id: String(nextId), name: "", provinceId: "" });
            return;
        }
        try {
            const next = await dispatch(fetchCityNextId()).unwrap();
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            reset({ id: next.nextId, name: "", provinceId: "" });
        } catch { /* apiError via effect */ }
    };

    const handleViewAll = () => {
        setIsViewAllOpen(true);
        if (list.length === 0) dispatch(fetchAllCities({ page: 1, limit: 10 }));
    };

    const columns: ViewAllColumn<CityRecord>[] = [
        { key: "id", header: "ID" },
        { key: "name", header: "Name" },
        { key: "provinceId", header: "Province ID" },
    ];

    return (
        <section className="mx-auto w-full max-w-[500px] rounded-xl bg-white p-4 shadow-lg sm:mt-10 sm:max-w-3xl sm:p-6">
            {/* Header — stacks on mobile */}
            <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">
                    Cities9
                </h1>
                <div className="flex w-full gap-2 sm:w-auto">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleNew}
                        disabled={!canCreate}
                        className="flex-1 sm:flex-none"
                    >
                        New
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleViewAll}
                        disabled={!canView}
                        className="flex-1 sm:flex-none"
                    >
                        View All
                    </Button>
                </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
                <div className="relative space-y-4">
                    <LabeledField
                        label="ID"
                        type={isTempId(String(watchedId || nextId || "")) ? "text" : "number"}
                        {...register("id", { valueAsNumber: false })}
                        value={String(watchedId || nextId)}
                        min={1}
                        loading={isBootstrapping}
                        error={errors.id?.message}
                        disabled={isIdLoading || isBootstrapping}
                    />
                    <LabeledField
                        label="Name"
                        type="text"
                        {...register("name")}
                        error={errors.name?.message}
                        disabled={!isEditing}
                    />
                    <LabeledSelect
                        label="Province"
                        value={watchedProvinceId ?? ""}
                        options={provincesStatus === "loading" ? [] : provinceOptions}
                        placeholder={
                            provincesStatus === "loading"
                                ? "Loading provinces..."
                                : provincesStatus === "failed"
                                    ? "Failed to load provinces"
                                    : "Select Province"
                        }
                        disabled={!isEditing || provincesStatus === "loading"}
                        isLoading={provincesStatus === "loading"}
                        onChange={(value) =>
                            setValue("provinceId", value, { shouldValidate: true, shouldDirty: true })
                        }
                        error={errors.provinceId?.message}
                    />
                    {Boolean(isLookingUp) && <LoadingOverlay text="Loading city..." />}
                </div>

                {/* Action buttons — full-width stack on mobile */}
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                        type="submit"
                        disabled={!isEditing || isSubmitting || (isNewMode ? !canCreate : !canUpdate)}
                        isLoading={isSubmitting}
                        className="w-full sm:w-auto"
                    >
                        Save
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => dispatch(setEditing(true))}
                        disabled={isSubmitting || isNewMode || isEditing || !canUpdate}
                        className="w-full sm:w-auto"
                    >
                        Edit
                    </Button>
                </div>
            </form>

            <ViewAllModal
                isOpen={isViewAllOpen}
                title="Cities"
                rows={list}
                columns={columns}
                searchKeys={["id", "name", "provinceId"]}
                isLoading={listStatus === "loading"}
                error={listError ?? undefined}
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                onPageChange={(page) => dispatch(fetchAllCities({ page, limit: pagination.limit }))}
                onRetry={() => dispatch(fetchAllCities({ page: pagination.page, limit: pagination.limit }))}
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