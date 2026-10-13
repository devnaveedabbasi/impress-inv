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
import { provinceSchema, type ProvinceFormValues } from "@/lib/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { isTempId } from "@/store/utils/tempId";
import {
  clearApiError, createProvince, fetchAllProvinces, fetchProvinceById, fetchProvinceNextId,
  setCurrentRecord, setEditing, setNewMode, updateProvince, type ProvinceRecord,
} from "@/store/slices/provinceSlice";
import {
  selectProvinceApiError, selectProvinceCurrentRecord, selectProvinceIsEditing,
  selectProvinceIsIdLoading, selectProvinceIsNewMode, selectProvinceIsSubmitting,
  selectProvinceIsLookingUp,
  selectProvinceList, selectProvinceListError, selectProvinceListStatus, selectProvinceNextId,
  selectProvincePagination,
} from "@/store/selectors/provinceSelectors";

const initialValues: ProvinceFormValues = { id: "", name: "" };

export default function ProvincePage() {
  const dispatch = useAppDispatch();
  const { hasPermission } = usePermissions();
  const list = useAppSelector(selectProvinceList);
  const nextId = useAppSelector(selectProvinceNextId);
  const isNewMode = useAppSelector(selectProvinceIsNewMode);
  const isEditing = useAppSelector(selectProvinceIsEditing);
  const isIdLoading = useAppSelector(selectProvinceIsIdLoading);
  const isSubmitting = useAppSelector(selectProvinceIsSubmitting);
  const isLookingUp = useAppSelector(selectProvinceIsLookingUp);
  const listStatus = useAppSelector(selectProvinceListStatus);
  const listError = useAppSelector(selectProvinceListError);
  const pagination = useAppSelector(selectProvincePagination);
  const currentRecord = useAppSelector(selectProvinceCurrentRecord);
  const apiError = useAppSelector(selectProvinceApiError);
  const [isViewAllOpen, setIsViewAllOpen] = useState(false);
  const canCreate = hasPermission("province", "create");
  const canUpdate = hasPermission("province", "update");
  const canView = hasPermission("province", "view");

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } =
    useForm<ProvinceFormValues>({ resolver: zodResolver(provinceSchema), defaultValues: initialValues });
  const watchedId = watch("id");
  const watchedName = watch("name");
  const debouncedId = useDebounce(watchedId, 500);

  useEffect(() => {
    dispatch(fetchProvinceNextId());
    dispatch(fetchAllProvinces({ page: 1, limit: 10 }));
  }, [dispatch]);
  useEffect(() => {
    if (isNewMode && nextId) reset({ id: String(nextId), name: "" });
  }, [isNewMode, nextId, reset]);
  useEffect(() => {
    if (!isNewMode && currentRecord) reset({ id: String(currentRecord.id), name: currentRecord.name });
  }, [currentRecord, isNewMode, reset]);
  useEffect(() => {
    if (!debouncedId || String(debouncedId) === String(nextId) || isTempId(debouncedId) || isIdLoading) return;
    dispatch(fetchProvinceById(String(debouncedId))).unwrap().catch(() => setValue("name", ""));
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
      if (isNewMode) await dispatch(createProvince(data)).unwrap();
      else await dispatch(updateProvince({ ...data, id: String(data.id ?? "") })).unwrap();
      toast.success("Saved successfully");
      dispatch(setNewMode(true));
      dispatch(setEditing(true));
      dispatch(fetchProvinceNextId());
      dispatch(fetchAllProvinces({ page: 1, limit: 10 }));
    } catch { /* apiError toast via effect */ }
  });
  const handleNew = () => {
    if (isNewMode && isTempId(String(nextId ?? "")) && !watchedName) {
      reset({ id: String(nextId), name: "" });
      return;
    }
    dispatch(setNewMode(true)); dispatch(setEditing(true)); dispatch(fetchProvinceNextId());
  };
  const handleViewAll = () => {
    setIsViewAllOpen(true);
    if (list.length === 0) dispatch(fetchAllProvinces({ page: 1, limit: 10 }));
  };
  const columns: ViewAllColumn<ProvinceRecord>[] = [{ key: "id", header: "ID" }, { key: "name", header: "Name" }];

  return (
    <section className=" mx-auto mt-10 w-full max-w-[500px] rounded-xl bg-white p-6 shadow-lg">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Provinces</h1>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={handleNew} disabled={!canCreate}>New</Button>
          <Button type="button" variant="outline" onClick={handleViewAll} disabled={!canView}>View All</Button>
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="relative space-y-4">
          <LabeledField label="ID" type={isTempId(String(watchedId || nextId || "")) ? "text" : "number"} {...register("id", { valueAsNumber: false })} value={isIdLoading ? "" : String(watchedId || nextId || "")} min={1} error={errors.id?.message} disabled={isIdLoading} />
          <LabeledField label="Name" type="text" {...register("name")} error={errors.name?.message} disabled={!isEditing} />
          {isLookingUp && <LoadingOverlay text="Loading province..." />}
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={!isEditing || isSubmitting || (isNewMode ? !canCreate : !canUpdate)} isLoading={isSubmitting}>Save</Button>
          <Button type="button" variant="secondary" onClick={() => dispatch(setEditing(true))} disabled={isSubmitting || isNewMode || isEditing || !canUpdate}>Edit</Button>
        </div>
      </form>
      <ViewAllModal isOpen={isViewAllOpen} title="Provinces" rows={list} columns={columns} searchKeys={["id", "name"]} isLoading={listStatus === "loading"} error={listError ?? undefined} page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={(page) => dispatch(fetchAllProvinces({ page, limit: pagination.limit }))} onRetry={() => dispatch(fetchAllProvinces({ page: pagination.page, limit: pagination.limit }))} onClose={() => setIsViewAllOpen(false)} onRowSelect={(row) => { dispatch(setCurrentRecord(row)); dispatch(setNewMode(false)); dispatch(setEditing(false)); setIsViewAllOpen(false); }} />
    </section>
  );
}
