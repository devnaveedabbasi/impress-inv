import { z } from "zod";

export const roleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim()
    .min(2, "Role name must be at least 2 characters")
    .max(50, "Role name is too long")
    .regex(/^[a-zA-Z\s]+$/, "Role name can only contain letters and spaces"),
  permissionIds: z.array(z.string()).min(1, "Select at least one permission"),
});

export const userSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Full name must be at least 2 characters").max(100, "Full name is too long"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters").max(100, "Password is too long"),
  role: z.string().min(1, "Select a role"),
  permissionIds: z.array(z.string()).min(1, "Select at least one permission"),
});

export type RoleFormValues = z.infer<typeof roleSchema>;
export type UserFormValues = z.infer<typeof userSchema>;
