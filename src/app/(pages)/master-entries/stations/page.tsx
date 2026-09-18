"use client";

import { useEffect, useState } from "react";
import { LabeledField } from "@/components/ui/LabeledField";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import { stationSchema, type StationFormValues } from "@/lib/validations/master";
import { STATIONS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";

const initialValues: StationFormValues = {
    id: "",
    name: "",
};

export default function StationPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);

    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${STATIONS}/next-id`);
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
        validationSchema: stationSchema,
        onSubmit: async (data) => {
            try {
                if (isNewMode) {
                    const response = await api.post(STATIONS, { name: data.name });
                    toast.success(response.data.message || "Station created successfully");
                } else {
                    const response = await api.put(`${STATIONS}/${data.id}`, { name: data.name });
                    toast.success(response.data.message || "Station updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save station");
                throw error;
            }
        },
    });

    const handleIdBlur = async () => {
        if (!values.id) return;

        try {
            const { data } = await api.get(`${STATIONS}/${values.id}`);
            if (data.data) {
                setValues({ id: String(data.data.id), name: data.data.name });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Station found");
            } else {
                toast.error("Station not found");
                setValues({ ...values, name: "" });
                setIsNewMode(true);
            }
        } catch (error: any) {
            toast.error("Invalid Station ID");
            setValues({ ...values, name: "" });
            setIsNewMode(true);
        }
    };

    return (
        <section className="mx-auto mt-10 w-full max-w-110 bg-form-bg p-6 shadow-xl sm:p-8">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900 sm:text-3xl">Station Entry</h1>

            <form onSubmit={handleSubmit} noValidate className="space-y-3">
                <LabeledField
                    type="number"
                    label="Station ID"
                    value={values.id || ""}
                    onChange={handleInputChange("id")}
                    onBlur={handleIdBlur}
                    error={errors.id}
                />
                <LabeledField
                    label="Station Name"
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
                        disabled={isSubmitting}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        New
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        shape="rounded"
                        onClick={() => setIsEditing(true)}
                        disabled={isSubmitting || isNewMode || isEditing}
                        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
                    >
                        Edit
                    </Button>

                    <Button
                        type="submit"
                        variant="secondary"
                        shape="rounded"
                        isLoading={isSubmitting}
                        disabled={!isEditing}
                        className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
                    >
                        Save
                    </Button>
                </div>
            </form>
        </section>
    );
}

