"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
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
    selectCityIsNewMode, selectCityIsSubmitting, selectCityList, selectCityListError, selectCityListStatus, selectCityNextId,
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
    const watchedName = watch("name");
    const watchedProvinceId = watch("provinceId");
    const debouncedId = useDebounce(watchedId, 500);

    useEffect(() => {
        dispatch(fetchCityNextId());
        dispatch(fetchAllCities({ page: 1, limit: 10 }));
        dispatch(fetchAllProvinces({ page: 1, limit: 10 }));
        dispatch(fetchProvinceOptions());
    }, [dispatch]);
    useEffect(() => {
        if (isNewMode && nextId) reset({ id: String(nextId), name: "", provinceId: "" });
    }, [isNewMode, nextId, reset]);
    useEffect(() => {
        if (!isNewMode && currentRecord) reset({
            id: String(currentRecord.id), name: currentRecord.name, provinceId: String(currentRecord.provinceId ?? ""),
        });
    }, [currentRecord, isNewMode, reset]);
    useEffect(() => {
        if (!debouncedId || String(debouncedId) === String(nextId) || isTempId(debouncedId) || isIdLoading) return;
        dispatch(fetchCityById(String(debouncedId))).unwrap().catch(() => setValue("name", ""));
    }, [debouncedId, dispatch, isIdLoading, nextId, setValue]);
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
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            dispatch(fetchCityNextId());
            dispatch(fetchAllCities({ page: 1, limit: 10 }));
        } catch { /* apiError toast via effect */ }
    });
    const handleNew = () => {
        if (isNewMode && isTempId(String(nextId ?? "")) && !watchedName) {
            reset({ id: String(nextId), name: "", provinceId: "" });
            return;
        }
        dispatch(setNewMode(true)); dispatch(setEditing(true)); dispatch(fetchCityNextId());
    };
    const handleViewAll = () => {
        setIsViewAllOpen(true);
        if (list.length === 0) dispatch(fetchAllCities({ page: 1, limit: 10 }));
    };
    const columns: ViewAllColumn<CityRecord>[] = [
        { key: "id", header: "ID" }, { key: "name", header: "Name" }, { key: "provinceId", header: "Province ID" },
    ];

    return (
        <section className="mx-auto mt-10 w-full max-w-3xl rounded-xl bg-white p-6 shadow-lg">
            <div className="mb-6 flex items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold text-zinc-900">Cities</h1>
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={handleNew} disabled={!canCreate}>New</Button>
                    <Button type="button" variant="outline" onClick={handleViewAll} disabled={!canView}>View All</Button>
                </div>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
                <LabeledField label="ID" type={isTempId(String(watchedId || nextId || "")) ? "text" : "number"} {...register("id", { valueAsNumber: false })} value={isIdLoading ? "" : String(watchedId || nextId || "")} min={1} error={errors.id?.message} disabled={isIdLoading} />
                <LabeledField label="Name" type="text" {...register("name")} error={errors.name?.message} disabled={!isEditing} />
                <LabeledSelect label="Province" value={watchedProvinceId ?? ""} options={provincesStatus === "loading" ? [] : provinceOptions} placeholder={provincesStatus === "loading" ? "Loading provinces..." : provincesStatus === "failed" ? "Failed to load provinces" : "Select Province"} disabled={!isEditing || provincesStatus === "loading"} isLoading={provincesStatus === "loading"} onChange={(value) => setValue("provinceId", value, { shouldValidate: true, shouldDirty: true })} error={errors.provinceId?.message} />
                <div className="flex gap-2">
                    <Button type="submit" disabled={!isEditing || isSubmitting || (isNewMode ? !canCreate : !canUpdate)} isLoading={isSubmitting}>Save</Button>
                    <Button type="button" variant="secondary" onClick={() => dispatch(setEditing(true))} disabled={isSubmitting || isNewMode || isEditing || !canUpdate}>Edit</Button>
                </div>
            </form>
            <ViewAllModal isOpen={isViewAllOpen} title="Cities" rows={list} columns={columns} searchKeys={["id", "name", "provinceId"]} isLoading={listStatus === "loading"} error={listError ?? undefined} page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={(page) => dispatch(fetchAllCities({ page, limit: pagination.limit }))} onRetry={() => dispatch(fetchAllCities({ page: pagination.page, limit: pagination.limit }))} onClose={() => setIsViewAllOpen(false)} onRowSelect={(row) => { dispatch(setCurrentRecord(row)); dispatch(setNewMode(false)); dispatch(setEditing(false)); setIsViewAllOpen(false); }} />
        </section>
    );
}
