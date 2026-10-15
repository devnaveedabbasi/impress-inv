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
import { categorySchema, type CategoryFormValues } from "@/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { generateTempId, isTempId } from "@/utils/tempId";
import {
  clearApiError,
  createCategory,
  fetchAllCategories,
  fetchCategoryById,
  fetchCategoryNextId,
  setCurrentRecord,
  setEditing,
  setNewMode,
  setNextId,
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
  const debouncedId = useDebounce(watchedId, 500);
  const isBootstrapping = isIdLoading && !nextId;

  useEffect(() => {
    dispatch(fetchCategoryNextId());
    dispatch(fetchAllCategories({ page: 1, limit: 10 }));
  }, [dispatch]);
  // New mode mein nextId aane par field update karo (offline -> temp, online -> real)
  useEffect(() => {
    if (isNewMode && nextId) {
      setValue("id", String(nextId), { shouldValidate: true, shouldDirty: false });
    }
  }, [isNewMode, nextId, setValue]);

  // Instant toggle on network changes without requiring refresh:
  // Online -> immediately fetch real ID from server
  // Offline -> immediately set temp ID
  useEffect(() => {
    const handleOnline = () => {
      if (isNewMode) {
        dispatch(fetchCategoryNextId()).unwrap().then((res) => {
          setValue("id", res.nextId, { shouldValidate: true, shouldDirty: false });
        }).catch(() => {});
      }
    };
    const handleOffline = () => {
      if (isNewMode) {
        const temp = generateTempId("cat");
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
  }, [isNewMode, dispatch, setValue]);

  // Reconcile background sync
  useEffect(() => {
    const handleReconciled = (event: Event) => {
      const detail = (event as CustomEvent<{ tempId: string; realId: string | number; resourceUrl: string }>).detail;
      if (!detail) return;
      const { tempId, realId } = detail;
      if (String(watch("id")) === String(tempId)) {
        setValue("id", String(realId), { shouldDirty: false });
      }
    };
    window.addEventListener("offline-id-reconciled", handleReconciled);
    return () => window.removeEventListener("offline-id-reconciled", handleReconciled);
  }, [setValue, watch]);
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
      const next = await dispatch(fetchCategoryNextId()).unwrap();
      dispatch(setNewMode(true));
      dispatch(setEditing(true));
      reset({ id: next.nextId, name: "" });
      dispatch(fetchAllCategories({ page: 1, limit: 10 }));
    } catch { /* apiError toast via effect */ }
  });

  const handleNew = async () => {
    if (isNewMode && nextId) {
      dispatch(setEditing(true));
      reset({ id: String(nextId), name: "" });
      return;
    }
    const next = await dispatch(fetchCategoryNextId()).unwrap();
    dispatch(setNewMode(true));
    dispatch(setEditing(true));
    reset({ id: next.nextId, name: "" });
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
    <section className="mx-auto  w-full max-w-[500px] rounded-xl bg-white p-4 shadow-lg sm:mt-10 sm:max-w-3xl sm:p-6">
      {/* Header — stacks on mobile */}
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">
          Categories
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
        <LabeledField
          label="ID"
          type={isTempId(String(watchedId || nextId || "")) ? "text" : "number"}
          {...register("id", { valueAsNumber: false })}
          value={isNewMode ? String(watchedId || nextId || "") : undefined}
          onChange={(e) => {
            setValue("id", e.target.value, { shouldValidate: true, shouldDirty: true });
          }}
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
        title="Categories"
        rows={list}
        columns={columns}
        searchKeys={["id", "name"]}
        isLoading={listStatus === "loading"}
        error={listError ?? undefined}
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={(page) => dispatch(fetchAllCategories({ page, limit: pagination.limit }))}
        onRetry={() => dispatch(fetchAllCategories({ page: pagination.page, limit: pagination.limit }))}
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