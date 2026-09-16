"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import { provinceSchema, type ProvinceFormValues } from "@/lib/validations/master";
import { PROVINCES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";

const initialValues: ProvinceFormValues = {
    id: "",
    name: "",
};

export default function ProvincePage() {
    const router = useRouter();
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);

    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${PROVINCES}/next-id`);
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
        validationSchema: provinceSchema,
        onSubmit: async (data) => {
            try {
                if (isNewMode) {
                    const response = await api.post(PROVINCES, { name: data.name });
                    toast.success(response.data.message || "Province created successfully");
                } else {
                    const response = await api.put(`${PROVINCES}/${data.id}`, { name: data.name });
                    toast.success(response.data.message || "Province updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save province");
                throw error;
            }
        },
    });

    const handleIdBlur = async () => {
        if (!values.id) return;

        try {
            const { data } = await api.get(`${PROVINCES}/${values.id}`);
            if (data.data) {
                setValues({ id: String(data.data.id), name: data.data.name });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Province found");
            } else {
                toast.error("Province not found");
                fetchNextId();
            }
        } catch (error: any) {
            toast.error("Invalid Province ID");
            fetchNextId();
        }
    };

    return (
        <section className="w-full max-w-[400px] rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg sm:p-8 mx-auto mt-10">
            <div className="mb-7">
                <h1 className="text-2xl font-bold text-zinc-950 sm:text-3xl">Province Entry</h1>
                <p className="mt-1 text-sm text-zinc-500">
                    {isNewMode ? "Create a new province." : "Edit existing province."}
                </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-2">
                <div className="flex flex-col gap-4">
                    <div className="w-full">
                        <Input
                            type="number"
                            placeholder="Province ID"
                            value={values.id || ""}
                            onChange={handleInputChange("id")}
                            onBlur={handleIdBlur}
                            error={errors.id}
                            label="ID"
                        />
                    </div>
                    <div className="w-full">
                        <Input
                            placeholder="Province Name"
                            value={values.name}
                            onChange={handleInputChange("name")}
                            error={errors.name}
                            label="Province Name"
                            disabled={!isEditing}
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-start gap-3 pt-6 border-t border-zinc-100">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={fetchNextId}
                        disabled={isSubmitting}
                        className="!px-6"
                    >
                        New
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditing(true)}
                        disabled={isSubmitting || isNewMode || isEditing}
                        className="!px-6"
                    >
                        Edit
                    </Button>

                    <Button type="submit" isLoading={isSubmitting} disabled={!isEditing} className="!px-8">
                        Save
                    </Button>
                </div>
            </form>
        </section>
    );
}
