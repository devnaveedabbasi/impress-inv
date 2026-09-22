"use client";

import { useEffect, useState } from "react";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import { departmentSchema, type DepartmentFormValues } from "@/lib/validations/master";
import { DEPARTMENTS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";

const initialValues: DepartmentFormValues = {
    id: "",
    name: "",
};

export default function DepartmentPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("department", "create");
    const canUpdate = hasPermission("department", "update");
    const canView = hasPermission("department", "view");


    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${DEPARTMENTS}/next-id`);
            setValues({ id: String(data.data.nextId), name: "" });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next ID", error);
        }
    };

    useEffect(() => {
        fetchNextId();
    }, []);

    const {
        values,
        errors,
        isLoading: isSubmitting,
        handleInputChange,
        handleSubmit,
        setValues,
    } = useForm({
        initialValues,
        validationSchema: departmentSchema,
        onSubmit: async (data) => {
            try {
                if (isNewMode) {
                    const response = await api.post(DEPARTMENTS, { name: data.name });
                    toast.success(response.data.message || "Department created successfully");
                } else {
                    const response = await api.put(`${DEPARTMENTS}/${data.id}`, { name: data.name });
                    toast.success(response.data.message || "Department updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save department");
                throw error;
            }
        },
    });

    const handleIdBlur = async () => {
        if (!values.id) return;

        if (!canView) {
            toast.error("You do not have permission to view or search for this record.");
            setValues({ ...initialValues, id: values.id });
            setIsNewMode(true);
            setIsEditing(true);
            return;
        }

        try {
            const { data } = await api.get(`${DEPARTMENTS}/${values.id}`);
            if (data.data) {
                setValues({ id: String(data.data.id), name: data.data.name });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Department found");
            } else {
                toast.error("Department not found");
                setValues({ ...values, name: "" });
                setIsNewMode(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Invalid Department ID");
            }
            setValues({ ...values, name: "" });
            setIsNewMode(true);
        }
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-110 bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">Department Entry</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-3">
                <LabeledField
                    type="number"
                    label="Department ID"
                    value={values.id || ""}
                    onChange={handleInputChange("id")}
                    onBlur={handleIdBlur}
                    error={errors.id}
                />
                <LabeledField
                    label="Department Name"
                    value={values.name}
                    onChange={handleInputChange("name")}
                    error={errors.name}
                    disabled={!isEditing}
                />

                <div className="flex flex-wrap items-center justify-center gap-3 pt-6">
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={fetchNextId}
                        disabled={isSubmitting || !canCreate}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        New
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={() => setIsEditing(true)}
                        disabled={isSubmitting || isNewMode || isEditing || !canUpdate}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Edit
                    </Button>

                    <Button
                        type="submit"
                        variant="secondary"
                        shape="rounded"
                        isLoading={isSubmitting}
                        disabled={!isEditing || (isNewMode ? !canCreate : !canUpdate)}
                        className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
                    >
                        Save
                    </Button>
                </div>
            </form>
        </section>
    );
}

