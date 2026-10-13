"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { LabeledField } from "@/components/ui/LabeledField";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";
import { usePermissions } from "@/hooks/usePermissions";
import useDebounce from "@/hooks/useDebounce";
import { categorySchema, type CategoryFormValues } from "@/lib/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { isTempId } from "@/store/utils/tempId";
import {
  clearApiError,
  createCategory,
  fetchAllCategories,
  fetchCategoryById,
  fetchCategoryNextId,
  setCurrentRecord,
  setEditing,
  setNewMode,
  updateCategory,
  type CategoryRecord,
} from "@/store/slices/categorySlice";
import {
  selectCategoryApiError,
  selectCategoryCurrentRecord,
  selectCategoryIsEditing,
  selectCategoryIsIdLoading,
  selectCategoryIsNewMode,
  selectCategoryIsSubmitting,
  selectCategoryList,
  selectCategoryListError,
  selectCategoryListStatus,
  selectCategoryNextId,
  selectCategoryPagination,
} from "@/store/selectors/categorySelectors";

const initialValues: CategoryFormValues = { id: "", name: "" };

export default function CategoryPage() {
  const dispatch = useAppDispatch();
  const { hasPermission } = usePermissions();
  const list = useAppSelector(selectCategoryList);
  const nextId = useAppSelector(selectCategoryNextId);
  const isNewMode = useAppSelector(selectCategoryIsNewMode);
  const isEditing = useAppSelector(selectCategoryIsEditing);
  const isIdLoading = useAppSelector(selectCategoryIsIdLoading);
  const isSubmitting = useAppSelector(selectCategoryIsSubmitting);
  const listStatus = useAppSelector(selectCategoryListStatus);
  const listError = useAppSelector(selectCategoryListError);
  const pagination = useAppSelector(selectCategoryPagination);
  const currentRecord = useAppSelector(selectCategoryCurrentRecord);
  const apiError = useAppSelector(selectCategoryApiError);
  const [isViewAllOpen, setIsViewAllOpen] = useState(false);
  const canCreate = hasPermission("category", "create");
  const canUpdate = hasPermission("category", "update");
  const canView = hasPermission("category", "view");

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } =
    useForm<CategoryFormValues>({ resolver: zodResolver(categorySchema), defaultValues: initialValues });
  const watchedId = watch("id");
  const watchedName = watch("name");
  const debouncedId = useDebounce(watchedId, 500);

  useEffect(() => {
    dispatch(fetchCategoryNextId());
    dispatch(fetchAllCategories({ page: 1, limit: 10 }));
  }, [dispatch]);
  useEffect(() => {
    if (isNewMode && nextId) reset({ id: String(nextId), name: "" });
  }, [isNewMode, nextId, reset]);
  useEffect(() => {
    if (!isNewMode && currentRecord) reset({ id: String(currentRecord.id), name: currentRecord.name });
  }, [currentRecord, isNewMode, reset]);
  useEffect(() => {
    if (!debouncedId || String(debouncedId) === String(nextId) || isTempId(debouncedId) || isIdLoading) return;
    dispatch(fetchCategoryById(String(debouncedId))).unwrap().catch(() => setValue("name", ""));
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
      if (isNewMode) await dispatch(createCategory(data)).unwrap();
      else await dispatch(updateCategory({ ...data, id: String(data.id ?? "") })).unwrap();
      toast.success("Saved successfully");
      dispatch(setNewMode(true));
      dispatch(setEditing(true));
      dispatch(fetchCategoryNextId());
      dispatch(fetchAllCategories({ page: 1, limit: 10 }));
    } catch { /* apiError toast via effect */ }
  });

  const handleNew = () => {
    if (isNewMode && isTempId(String(nextId ?? "")) && !watchedName) {
      reset({ id: String(nextId), name: "" });
      return;
    }
    dispatch(setNewMode(true));
    dispatch(setEditing(true));
    dispatch(fetchCategoryNextId());
  };
  const handleViewAll = () => {
    setIsViewAllOpen(true);
    if (list.length === 0) dispatch(fetchAllCategories({ page: 1, limit: 10 }));
  };
  const columns: ViewAllColumn<CategoryRecord>[] = [
    { key: "id", header: "ID" },
    { key: "name", header: "Name" },
  ];

  return (
    <section className="mx-auto mt-10 w-full max-w-3xl rounded-xl bg-white p-6 shadow-lg">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Categories</h1>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={handleNew} disabled={!canCreate}>New</Button>
          <Button type="button" variant="outline" onClick={handleViewAll} disabled={!canView}>View All</Button>
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <LabeledField label="ID" type={isTempId(String(watchedId || nextId || "")) ? "text" : "number"} {...register("id", { valueAsNumber: false })} value={isIdLoading ? "" : String(watchedId || nextId || "")} min={1} error={errors.id?.message} disabled={isIdLoading} />
        <LabeledField label="Name" type="text" {...register("name")} error={errors.name?.message} disabled={!isEditing} />
        <div className="flex gap-2">
          <Button type="submit" disabled={!isEditing || isSubmitting || (isNewMode ? !canCreate : !canUpdate)} isLoading={isSubmitting}>Save</Button>
          <Button type="button" variant="secondary" onClick={() => dispatch(setEditing(true))} disabled={isSubmitting || isNewMode || isEditing || !canUpdate}>Edit</Button>
        </div>
      </form>
      <ViewAllModal isOpen={isViewAllOpen} title="Categories" rows={list} columns={columns} searchKeys={["id", "name"]} isLoading={listStatus === "loading"} error={listError ?? undefined} page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onPageChange={(page) => dispatch(fetchAllCategories({ page, limit: pagination.limit }))} onRetry={() => dispatch(fetchAllCategories({ page: pagination.page, limit: pagination.limit }))} onClose={() => setIsViewAllOpen(false)} onRowSelect={(row) => { dispatch(setCurrentRecord(row)); dispatch(setNewMode(false)); dispatch(setEditing(false)); setIsViewAllOpen(false); }} />
    </section>
  );
}
