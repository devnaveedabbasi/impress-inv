"use client";

import { Icon } from "@iconify/react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import { roleSchema, type RoleFormValues } from "@/lib/validations/account";

import { Select } from "@/components/ui/Select";
import { useEffect, useState } from "react";
import { PERMISSIONS, ROLES } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";

const initialValues: RoleFormValues = {
  name: "",
  permissionIds: [],
};

export default function AddRolePage() {
  const [permissionsData, setPermissionsData] = useState<any>(null);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const { data } = await api.get(PERMISSIONS);
        setPermissionsData(data.data);
      } catch (error) {
        console.error("Failed to fetch permissions", error);
      }
    };
    fetchPermissions();
  }, []);

  const formatLabel = (str: string) => {
    if (!str) return "";
    return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  const permissionOptions = permissionsData
    ? Object.values(permissionsData).flatMap((module: any) =>
      module.permissions.map((p: any) => ({
        label: formatLabel(p.name),
        value: String(p.id),
        group: formatLabel(module.operation),
      }))
    )
    : [];

  async function validateRole(data: RoleFormValues) {
    try {
      const response = await api.post(ROLES, {
        name: data.name,
        permissionIds: data.permissionIds.map(Number),
      });
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
    handleSelectChange,
    handleSubmit,
    resetForm,
  } = useForm({
    initialValues,
    validationSchema: roleSchema,
    successMessage: "",
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

        <Select
          options={permissionOptions}
          isSearch
          multiple
          showSelectAll
          inline
          placeholder="Select Role Permissions"
          icon={<Icon icon="mdi:shield-account-outline" />}
          value={values.permissionIds}
          onChange={handleSelectChange("permissionIds")}
          error={errors.permissionIds as string | undefined}
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

