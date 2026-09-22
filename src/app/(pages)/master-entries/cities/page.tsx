"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { useForm } from "@/hooks/useForm";
import { citySchema, type CityFormValues } from "@/lib/validations/master";
import { CITIES, PROVINCES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";

const initialValues: CityFormValues = {
    id: "",
    name: "",
    provinceId: "",
};

export default function CityPage() {
    const router = useRouter();
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [provinces, setProvinces] = useState<{ label: string, value: string }[]>([]);
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("city", "create");
    const canUpdate = hasPermission("city", "update");
    const canView = hasPermission("city", "view");


    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${CITIES}/next-id`);
            setValues({ id: String(data.data.nextId), name: "", provinceId: "" });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next ID", error);
        }
    };

    const fetchProvinces = async () => {
        try {
            const { data } = await api.get(PROVINCES);
            if (data.data) {
                const options = data.data.map((p: any) => ({
                    label: p.name,
                    value: String(p.id)
                }));
                setProvinces(options);
            }
        } catch (error) {
            console.error("Failed to fetch provinces", error);
            toast.error("Failed to load provinces");
        }
    };

    useEffect(() => {
        fetchNextId();
        fetchProvinces();
    }, []);

    const {
        values,
        errors,
        isLoading: isSubmitting,
        handleInputChange,
        handleSelectChange,
        handleSubmit,
        setValues,
    } = useForm({
        initialValues,
        validationSchema: citySchema,
        onSubmit: async (data) => {
            try {
                if (isNewMode) {
                    const response = await api.post(CITIES, { name: data.name, provinceId: Number(data.provinceId) });
                    toast.success(response.data.message || "City created successfully");
                } else {
                    const response = await api.put(`${CITIES}/${data.id}`, { name: data.name, provinceId: Number(data.provinceId) });
                    toast.success(response.data.message || "City updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save city");
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
            const { data } = await api.get(`${CITIES}/${values.id}`);
            if (data.data) {
                setValues({ 
                    id: String(data.data.id), 
                    name: data.data.name,
                    provinceId: String(data.data.provinceId)
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("City found");
            } else {
                toast.error("City not found");
                // Clear fields but keep the ID they typed
                setValues({ ...values, name: "", provinceId: "" });
                setIsNewMode(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Invalid City ID");
            }
            setValues({ ...values, name: "", provinceId: "" });
            setIsNewMode(true);
        }
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-110 bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">City Entry</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-3">
                <LabeledField
                    type="number"
                    label="City ID"
                    value={values.id || ""}
                    onChange={handleInputChange("id")}
                    onBlur={handleIdBlur}
                    error={errors.id}
                />
                <LabeledField
                    label="City Name"
                    value={values.name}
                    onChange={handleInputChange("name")}
                    error={errors.name}
                    disabled={!isEditing}
                />
                <LabeledSelect
                    label="Province"
                    options={provinces}
                    value={values.provinceId}
                    onChange={handleSelectChange("provinceId")}
                    error={errors.provinceId}
                    disabled={!isEditing}
                    placeholder="Select Province"
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

