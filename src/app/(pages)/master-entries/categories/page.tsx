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
import { categorySchema, type CategoryFormValues } from "@/validations/master";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { generateTempId, isTempId } from "@/utils/tempId";
import { isOffline } from "@/utils/network";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { CATEGORIES } from "@/utils/apiRoutes";
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
  selectCategoryIsLookingUp,
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
  const isLookingUp = useAppSelector(selectCategoryIsLookingUp);
  const listStatus = useAppSelector(selectCategoryListStatus);
  const listError = useAppSelector(selectCategoryListError);
  const pagination = useAppSelector(selectCategoryPagination);
  const currentRecord = useAppSelector(selectCategoryCurrentRecord);
  const apiError = useAppSelector(selectCategoryApiError);

  const [isViewAllOpen, setIsViewAllOpen] = useState(false);
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => !isOffline());
  const [isTransitioningOnline, setIsTransitioningOnline] = useState(false);
  const [isFetchingNew, setIsFetchingNew] = useState(false);

  // Temp ID is preserved until user saves with it
  const activeTempIdRef = useRef<string | null>(null);

  const canCreate = hasPermission("category", "create");
  const canUpdate = hasPermission("category", "update");
  const canView = hasPermission("category", "view");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
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
      activeTempIdRef.current = generateTempId("cat");
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
      dispatch(fetchCategoryNextId())
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

    dispatch(fetchAllCategories({ page: 1, limit: 10 }));
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
        await offlineSyncService.processQueue().catch(() => null);
        await new Promise((resolve) => setTimeout(resolve, 300));

        const nextRes = await dispatch(fetchCategoryNextId()).unwrap();
        const serverId = String(nextRes.nextId);

        if (serverId && !isTempId(serverId)) {
          dispatch(setNextId(serverId));
          activeTempIdRef.current = null;
          const curId = String(watch("id"));
          if (isNewMode || isTempId(curId)) {
            setValue("id", serverId, { shouldValidate: true, shouldDirty: false });
          }
        }

        void dispatch(fetchAllCategories({ page: 1, limit: 10 }));
      } catch (err) {
        console.warn("Online reconnect error:", err);
      } finally {
        setIsTransitioningOnline(false);
      }
    };

    const handleOffline = () => {
      setIsNetworkOnline(false);
      const curId = String(watch("id"));

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
      if (resourceUrl === CATEGORIES && String(watch("id")) === String(tempId)) {
        setValue("id", String(realId), { shouldDirty: false });
      }
    };

    window.addEventListener("offline-id-reconciled", handleReconciled);
    return () => window.removeEventListener("offline-id-reconciled", handleReconciled);
  }, [setValue, watch]);

  // 5. Populate form when a record is selected
  useEffect(() => {
    if (!isNewMode && currentRecord) {
      reset({ id: String(currentRecord.id), name: currentRecord.name });
    }
  }, [currentRecord, isNewMode, reset]);

  // 6. Look up record when user types in the ID field
  useEffect(() => {
    if (String(watchedId) !== String(debouncedId)) return;
    const cleanId = String(debouncedId || "").trim();

    if (!cleanId || cleanId === String(nextId) || isIdLoading) return;
    if (!isNewMode && currentRecord && String(currentRecord.id) === cleanId) return;

    // A. Temp ID: NEVER call GetByID API! Search offline/local storage only
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

    // B. Numeric ID in Offline mode: Search offline list only
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
    dispatch(fetchCategoryById(cleanId))
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
        const result = await dispatch(createCategory(data)).unwrap();
        activeTempIdRef.current = null;
        toast.success(result._offline ? "Saved offline. It will sync when online." : "Saved successfully");

        if (result._offline) {
          dispatch(setCurrentRecord(result.data));
          dispatch(setNewMode(false));
          dispatch(setEditing(false));
        } else {
          const next = await dispatch(fetchCategoryNextId()).unwrap();
          dispatch(setNewMode(true));
          dispatch(setEditing(true));
          reset({ id: String(next.nextId), name: "" });
        }
        dispatch(fetchAllCategories({ page: 1, limit: 10 }));
      } else {
        const result = await dispatch(updateCategory({ ...data, id: String(data.id ?? "") })).unwrap();
        activeTempIdRef.current = null;
        toast.success(result._offline ? "Updated offline. It will sync when online." : "Saved successfully");

        if (result._offline) {
          dispatch(setCurrentRecord(result.data));
          dispatch(setEditing(false));
        } else {
          const next = await dispatch(fetchCategoryNextId()).unwrap();
          dispatch(setNewMode(true));
          dispatch(setEditing(true));
          reset({ id: String(next.nextId), name: "" });
        }
        dispatch(fetchAllCategories({ page: 1, limit: 10 }));
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
      const temp = generateTempId("cat");
      activeTempIdRef.current = temp;
      dispatch(setCurrentRecord(null));
      dispatch(setNewMode(true));
      dispatch(setEditing(true));
      dispatch(setNextId(temp));
      reset({ id: temp, name: "" });
      return;
    }

    // Online mode: immediately clear inputs and show loading state
    setIsFetchingNew(true);
    dispatch(setCurrentRecord(null));
    dispatch(setNewMode(true));
    dispatch(setEditing(true));
    reset({ id: "", name: "" });

    try {
      const next = await dispatch(fetchCategoryNextId()).unwrap();
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
    if (list.length === 0) dispatch(fetchAllCategories({ page: 1, limit: 10 }));
  };

  const columns: ViewAllColumn<CategoryRecord>[] = [
    { key: "id", header: "ID" },
    { key: "name", header: "Name" },
  ];

  return (
    <section className="mx-auto w-full max-w-[500px] rounded-xl bg-white p-4 shadow-lg sm:mt-10 sm:max-w-3xl sm:p-6">
      {/* Header — stacks on mobile */}
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">Categories</h1>
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
          <LoadingOverlay text={isTransitioningOnline ? "Syncing and loading server ID..." : "Loading category..."} />
        )}

        {/* Action buttons — full-width stack on mobile */}
        <div className="flex flex-col gap-2 sm:flex-row">
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