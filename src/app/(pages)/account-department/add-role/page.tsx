"use client";

import { Icon } from "@iconify/react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import { roleSchema, type RoleFormValues } from "@/lib/validations/account";

const initialValues: RoleFormValues = {
  name: "",
};
import api from "@/lib/axios";
import { ROLES } from "@/utlis/apiRoutes";
import toast from "react-hot-toast";

export default function AddRolePage() {
  async function validateRole(data: RoleFormValues) {
    try {
      const response = await api.post(ROLES, data);
      toast.success(response.data.message || "Role created successfully");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to create role");
      throw error;
    }
  }

  const {
    values,
    errors,
    message,
    isLoading,
    handleInputChange,
    handleSubmit,
    resetForm,
  } = useForm({
    initialValues,
    validationSchema: roleSchema,
    successMessage: "Role details are valid and ready to save.",
    onSubmit: validateRole,
  });

  return (
    <section className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg sm:p-8">
      <div className="mb-7">

        <h1 className="text-2xl font-bold text-zinc-950 sm:text-3xl">Create New Role</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create a new role and assign permissions to define access levels.
        </p>
      </div>

      {message && (
        <p className="mb-5 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-700">
          {message}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">

        <Input
          placeholder="Role Name"
          icon={<Icon icon="mdi:account-outline" />}
          value={values.name}
          onChange={handleInputChange("name")}
          error={errors.name}
        />


        <div className="flex flex-wrap items-center justify-start gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={resetForm}
            disabled={isLoading}
            className="!px-8"
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading} className="!px-8">
            Create Role
          </Button>
        </div>
      </form>
    </section>
  );
}
