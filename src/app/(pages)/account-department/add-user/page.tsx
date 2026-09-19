"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { userSchema } from "@/lib/validations/account";
import { useForm } from "@/hooks/useForm";
import toast from "react-hot-toast";
import { ROLES, USERS, PERMISSIONS } from "@/utlis/apiRoutes";

import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Select } from "@/components/ui/Select";

const initialValues = { id: "", name: "", email: "", password: "", role: "", permissionIds: [] as string[] };

export default function AddUserPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);

    const [rolesData, setRolesData] = useState<any[]>([]);
    const [permissionsData, setPermissionsData] = useState<any>(null);

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
        }
    };

    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${USERS}/next-id`);
            setValues({ ...initialValues, id: String(data.data.nextId) });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next user ID", error);
        }
    };

    useEffect(() => {
        fetchNextId();
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
        validationSchema: userSchema,
        onSubmit: async (data) => {
            const payload = {
                name: data.name,
                email: data.email,
                password: data.password,
                roleId: data.role,
                permissionIds: data.permissionIds.map(Number),
            };

            try {
                if (isNewMode) {
                    const response = await api.post(USERS, payload);
                    toast.success(response.data.message || "User created successfully");
                } else {
                    const response = await api.put(`${USERS}/${data.id}`, payload);
                    toast.success(response.data.message || "User updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save user");
                throw error;
            }
        },
    });

    const handleIdBlur = async () => {
        if (!values.id) return;
        try {
            const { data } = await api.get(`${USERS}/${values.id}`);
            if (data.data) {
                const u = data.data;
                setValues({
                    id: String(u.id),
                    name: u.name,
                    email: u.email,
                    password: "", // Cannot fetch password hash, leave blank so user can change it or keep old
                    role: String(rolesData.find(r => r.name === u.role)?.id || ""),
                    permissionIds: u.permissions?.map((p: any) => String(p.id)) || [],
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("User found");
            } else {
                toast.error("User not found");
                setValues({ ...initialValues, id: values.id });
                setIsNewMode(true);
                setIsEditing(true);
            }
        } catch (error: any) {
            toast.error("Invalid User ID");
            setValues({ ...initialValues, id: values.id });
            setIsNewMode(true);
            setIsEditing(true);
        }
    };

    const [searchQuery, setSearchQuery] = useState("");

    const filteredPermissions = permissionsData ? Object.entries(permissionsData).reduce((acc: any, [key, module]: [string, any]) => {
        const groupName = formatLabel(module.operation);
        const searchLower = searchQuery.trim().toLowerCase();
        
        if (groupName.toLowerCase().includes(searchLower)) {
            acc[key] = module;
            return acc;
        }
        
        const matchedPerms = module.permissions.filter((p: any) => formatLabel(p.name).toLowerCase().includes(searchLower));
        if (matchedPerms.length > 0) {
            acc[key] = { ...module, permissions: matchedPerms };
        }
        return acc;
    }, {}) : null;

    const btnClass = "bg-white border border-zinc-400 px-6 py-1.5 text-[15px] text-black hover:bg-zinc-50 active:bg-zinc-100 min-w-[85px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

    return (
        <section className="mx-auto mt-10 w-full max-w-4xl bg-[#f0f0f0] p-8 shadow-sm">
            <h1 className="mb-10 text-center text-4xl text-black tracking-wide">User Registration</h1>

            <form onSubmit={handleSubmit} noValidate>
                {/* Top Section */}
                <div className="flex flex-col md:flex-row justify-between items-start gap-10">
                    <div className="flex-1 w-full space-y-1.5">
                        <LabeledField
                            type="number"
                            label="User ID"
                            value={values.id || ""}
                            onChange={handleInputChange("id")}
                            onBlur={handleIdBlur}
                            error={errors.id}
                            wrapperClassName="max-w-[200px]"
                        />
                        <LabeledField
                            label="Name"
                            value={values.name}
                            onChange={handleInputChange("name")}
                            error={errors.name}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            type="email"
                            label="Email"
                            value={values.email}
                            onChange={handleInputChange("email")}
                            error={errors.email}
                            disabled={!isEditing}
                        />
                        <LabeledField
                            type="password"
                            label="Password"
                            placeholder={!isNewMode ? "Leave blank to keep same" : ""}
                            value={values.password}
                            onChange={handleInputChange("password")}
                            error={errors.password}
                            disabled={!isEditing}
                        />
                        <LabeledSelect
                            label="Role"
                            options={roleOptions}
                            value={values.role}
                            onChange={(e) => handleSelectChange("role")(e)}
                            error={errors.role}
                            disabled={!isEditing}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-1 gap-2 shrink-0">
                        <button type="button" onClick={fetchNextId} className={btnClass} disabled={isSubmitting}>New</button>
                        <button type="submit" className={btnClass} disabled={!isEditing || isSubmitting}>Save</button>
                        <button type="button" onClick={() => setIsEditing(true)} className={btnClass} disabled={isEditing || isNewMode}>Edit</button>
                    </div>
                </div>

                {/* Information Divider */}
                <div className="flex items-center justify-between gap-3 mb-4 mt-6">
                    <div className="flex items-center gap-3 flex-1">
                        <span className="text-[14px] text-zinc-900 font-normal whitespace-nowrap">Extra Permissions</span>
                        <div className="flex-1 h-[1px] bg-zinc-500"></div>
                    </div>
                    <input 
                        type="text" 
                        placeholder="Search permissions..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                            }
                        }}
                        className="border border-zinc-300 px-3 py-1 outline-none text-sm w-64 text-black"
                    />
                </div>

                {/* Permissions Section */}
                <div className="bg-white p-4 border border-zinc-300 min-h-[200px]">
                    {filteredPermissions ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {Object.values(filteredPermissions).length > 0 ? Object.values(filteredPermissions).map((module: any) => {
                                const groupName = formatLabel(module.operation);
                                const lockedValues = rolesData?.find((r: any) => String(r.id) === values.role)?.permissions?.map((p: any) => String(p.permission.id)) || [];
                                
                                return (
                                    <div key={module.operation} className="border border-zinc-200 p-3 bg-zinc-50">
                                        <h3 className="font-semibold text-zinc-800 mb-2 border-b border-zinc-200 pb-1">{groupName}</h3>
                                        <div className="space-y-1.5">
                                            {module.permissions.map((p: any) => {
                                                const pid = String(p.id);
                                                const isLocked = lockedValues.includes(pid);
                                                const isChecked = values.permissionIds.includes(pid) || isLocked;
                                                return (
                                                    <label key={pid} className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            disabled={!isEditing || isLocked}
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    handleSelectChange("permissionIds")([...values.permissionIds, pid]);
                                                                } else {
                                                                    handleSelectChange("permissionIds")(values.permissionIds.filter(id => id !== pid));
                                                                }
                                                            }}
                                                            className="cursor-pointer"
                                                        />
                                                        <span className={isLocked ? "opacity-60" : ""}>{formatLabel(p.name)} {isLocked && <span className="text-[10px] text-zinc-500">(Role)</span>}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="col-span-full py-4 text-center text-sm text-zinc-500">
                                    No permissions match your search.
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-zinc-500">Loading permissions...</p>
                    )}
                    {errors.permissionIds && <p className="mt-2 text-xs text-red-500">{errors.permissionIds}</p>}
                </div>
            </form>
        </section>
    );
}
