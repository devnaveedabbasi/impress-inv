import * as z from "zod";

export const provinceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "Province Name is required" }),
});

export type ProvinceFormValues = z.infer<typeof provinceSchema>;
