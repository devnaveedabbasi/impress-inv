"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { LabeledField } from "@/components/ui/LabeledField";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { usePermissions } from "@/hooks/usePermissions";
import useDebounce from "@/hooks/useDebounce";
import { stationSchema, type StationFormValues } from "@/lib/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { isTempId } from "@/store/utils/tempId";
import {
    clearApiError,
    createStation,
    fetchAllStations,
    fetchStationById,
    fetchStationNextId,
    setCurrentRecord,
    setEditing,
    setNewMode,
    updateStation,
    type StationRecord,
} from "@/store/slices/stationSlice";
import {
    selectStationApiError,
    selectStationCurrentRecord,
    selectStationIsEditing,
    selectStationIsIdLoading,
    selectStationIsLookingUp,
    selectStationIsNewMode,
    selectStationIsSubmitting,
    selectStationList,
    selectStationListError,
    selectStationListStatus,
    selectStationNextId,
    selectStationPagination,
} from "@/store/selectors/stationSelectors";

const initialValues: StationFormValues = { id: "", name: "" };

export default function StationPage() {
    const dispatch = useAppDispatch();
    const { hasPermission } = usePermissions();
    const list = useAppSelector(selectStationList);
    const nextId = useAppSelector(selectStationNextId);
    const isNewMode = useAppSelector(selectStationIsNewMode);
    const isEditing = useAppSelector(selectStationIsEditing);
    const isIdLoading = useAppSelector(selectStationIsIdLoading);
    const isLookingUp = useAppSelector(selectStationIsLookingUp);
    const isSubmitting = useAppSelector(selectStationIsSubmitting);
    const listStatus = useAppSelector(selectStationListStatus);
    const listError = useAppSelector(selectStationListError);
    const pagination = useAppSelector(selectStationPagination);
    const currentRecord = useAppSelector(selectStationCurrentRecord);
    const apiError = useAppSelector(selectStationApiError);
    const [isViewAllOpen, setIsViewAllOpen] = useState(false);
    const canCreate = hasPermission("station", "create");
    const canUpdate = hasPermission("station", "update");
    const canView = hasPermission("station", "view");

    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } =
        useForm<StationFormValues>({ resolver: zodResolver(stationSchema), defaultValues: initialValues });
    const watchedId = watch("id");
    const debouncedId = useDebounce(watchedId, 500);

    // Initial load
    useEffect(() => {
        dispatch(fetchStationNextId());
        dispatch(fetchAllStations({ page: 1, limit: 10 }));
    }, [dispatch]);

    console.log("StationPage render", { isNewMode, isEditing, watchedId, debouncedId, nextId, currentRecord });

    // New mode mein nextId aane par form reset
    useEffect(() => {
        if (isNewMode && nextId) reset({ id: String(nextId), name: "" });
    }, [isNewMode, nextId, reset]);

    // View mode mein selected record aane par form reset
    useEffect(() => {
        if (!isNewMode && currentRecord) reset({ id: String(currentRecord.id), name: currentRecord.name });
    }, [currentRecord, isNewMode, reset]);

    // FIX #1: debounce settle hone tak wait karo (stale debouncedId se bachao)
    // FIX #2: new mode mein jis id ko hum khud set kar rahe hain usko lookup mat karo
    useEffect(() => {
        if (String(watchedId) !== String(debouncedId)) return;
        if (isNewMode && String(debouncedId) === String(nextId)) return;
        if (!debouncedId || String(debouncedId) === String(nextId) || isTempId(debouncedId) || isIdLoading) return;
        dispatch(fetchStationById(String(debouncedId))).unwrap().catch(() => setValue("name", ""));
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
            if (isNewMode) await dispatch(createStation({ name: data.name, id: String(data.id ?? "") })).unwrap();
            else await dispatch(updateStation({ id: String(data.id ?? ""), name: data.name })).unwrap();
            toast.success("Saved successfully");
            const next = await dispatch(fetchStationNextId()).unwrap();
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            reset({ id: next.nextId, name: "" });
            dispatch(fetchAllStations({ page: 1, limit: 10 }));
        } catch { /* apiError toast via effect */ }
    });

    // FIX #3: nextId already ho to API dobara mat maaro (5-7 sec delay khatam)
    const handleNew = async () => {
        if (nextId) {
            dispatch(setCurrentRecord(null));
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            reset({ id: String(nextId), name: "" });
            return;
        }
        try {
            const next = await dispatch(fetchStationNextId()).unwrap();
            dispatch(setNewMode(true));
            dispatch(setEditing(true));
            reset({ id: next.nextId, name: "" });
        } catch { /* apiError via effect */ }
    };

    const handleViewAll = () => {
        setIsViewAllOpen(true);
        if (list.length === 0) dispatch(fetchAllStations({ page: 1, limit: 10 }));
    };

    const columns: ViewAllColumn<StationRecord>[] = [
        { key: "id", header: "ID" },
        { key: "name", header: "Name" },
    ];

    return (
        <section className="mx-auto w-full max-w-[500px] rounded-xl bg-white p-4 shadow-lg sm:mt-10 sm:max-w-3xl sm:p-6">
            {/* Header — stacks on mobile */}
            <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">
                    Stations
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
                    value={isIdLoading ? "" : String(watchedId || nextId || "")}
                    min={1}
                    error={errors.id?.message}
                    disabled={isIdLoading}
                />
                <LabeledField
                    label="Name"
                    type="text"
                    {...register("name")}
                    error={errors.name?.message}
                    disabled={!isEditing}
                />
                {isLookingUp && <LoadingOverlay text="Loading station..." />}
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
                title="Stations"
                rows={list}
                columns={columns}
                searchKeys={["id", "name"]}
                isLoading={listStatus === "loading"}
                error={listError ?? undefined}
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                onPageChange={(page) => dispatch(fetchAllStations({ page, limit: pagination.limit }))}
                onRetry={() => dispatch(fetchAllStations({ page: pagination.page, limit: pagination.limit }))}
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