"use client";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import api from "@/lib/axios";
import { userSchema } from "@/lib/validations/account";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";

import toast from "react-hot-toast";
import { ROLES, USERS, PERMISSIONS } from "@/utlis/apiRoutes";

const initialValues = { name: "", email: "", password: "", role: "", permissionIds: [] as string[] };

export default function AddUserPage() {
  const [rolesData, setRolesData] = useState<any[]>([]);
  const [isRolesLoading, setIsRolesLoading] = useState(true);
  const [permissionsData, setPermissionsData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rolesRes, permsRes] = await Promise.all([
          api.get(ROLES),
          api.get(PERMISSIONS)
        ]);
        setRolesData(rolesRes.data.data);
        setPermissionsData(permsRes.data.data);
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setIsRolesLoading(false);
      }
    };
    fetchData();
  }, []);

  const roleOptions = [
    { label: "Select a role", value: "" },
    ...(rolesData?.map((r: any) => ({ label: r.name, value: String(r.id) })) || []),
  ];

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

  async function handleCreateUser(data: typeof initialValues) {
    try {
      const response = await api.post(USERS, {
        name: data.name,
        email: data.email,
        password: data.password,
        roleId: data.role,
        permissionIds: data.permissionIds.map(Number),
      });
      toast.success(response.data.message || "User created successfully");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to create user");
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
    validationSchema: userSchema,
    successMessage: "",
    onSubmit: handleCreateUser,
  });

  return (
    <section className="w-full max-w-4xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg sm:p-7">
      <div className="mb-6">

        <h1 className="text-2xl font-bold text-zinc-950 sm:text-3xl">Add New User</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create a new user account and assign role with permissions.
        </p>
      </div>

      {message && (
        <p className="mb-5 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-700">
          {message}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            placeholder="Enter Full Name"
            icon={<Icon icon="mdi:account-outline" />}
            value={values.name}
            onChange={handleInputChange("name")}
            error={errors.name}
          />
          <Input
            type="email"
            placeholder="Enter Email Address"
            icon={<Icon icon="mdi:email-outline" />}
            value={values.email}
            onChange={handleInputChange("email")}
            error={errors.email}
          />
          <Input
            type="password"
            placeholder="Enter password"
            icon={<Icon icon="mdi:lock-outline" />}
            value={values.password}
            onChange={handleInputChange("password")}
            error={errors.password}
          />
          <Select
            options={roleOptions}
            isSearch
            placeholder="Select a role"
            icon={<Icon icon="mdi:account-group-outline" />}
            value={values.role}
            onChange={handleSelectChange("role")}
            error={errors.role}
          />
        </div>

        <Select
          options={permissionOptions}
          isSearch
          multiple
          showSelectAll
          inline
          placeholder="Select Extra Permissions (Optional)"
          icon={<Icon icon="mdi:shield-account-outline" />}
          value={values.permissionIds}
          lockedValues={rolesData?.find((r: any) => String(r.id) === values.role)?.permissions?.map((p: any) => String(p.permission.id)) || []}
          onChange={handleSelectChange("permissionIds")}
          error={errors.permissionIds as string | undefined}
        />

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="submit"
            size="md"
            variant="primary"
            isLoading={isLoading}
            className="!px-8"
          // leftIcon={<Icon icon="mdi:content-save-outline" />}
          >
            Create User
          </Button>
          <Button
            type="button"
            size="md"
            variant="outline"
            onClick={resetForm}
            disabled={isLoading}
            className="!px-8"

          // className="!px-8 !text-gray-600 !border-gray-600"
          // leftIcon={<Icon icon="mdi:refresh" />}
          >
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
