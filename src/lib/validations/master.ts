import * as z from "zod";

export const provinceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "Province Name is required" }),
});

export type ProvinceFormValues = z.infer<typeof provinceSchema>;

export const citySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "City Name is required" }),
  provinceId: z.string().min(1, { message: "Province is required" }),
});

export type CityFormValues = z.infer<typeof citySchema>;

export const stationSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "Station Name is required" }),
});

export type StationFormValues = z.infer<typeof stationSchema>;

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "Category Name is required" }),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;

export const departmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "Department Name is required" }),
});

export type DepartmentFormValues = z.infer<typeof departmentSchema>;

// Numeric value carried as a string (form inputs are always strings), with a min/max range check.
const numericRange = (label: string, min: number, max: number) =>
  z
    .string()
    .min(1, { message: `${label} is required` })
    .refine((v) => !Number.isNaN(Number(v)), { message: `${label} must be a valid number` })
    .refine((v) => Number(v) >= min, { message: `${label} must be at least ${min}` })
    .refine((v) => Number(v) <= max, { message: `${label} must be at most ${max}` });

export const vendorSchema = z.object({
  id: z.string().optional(),
  vendorName: z
    .string()
    .trim()
    .min(2, { message: "Vendor Name must be at least 2 characters" })
    .max(100, { message: "Vendor Name must be at most 100 characters" }),
  address: z
    .string()
    .trim()
    .min(5, { message: "Address must be at least 5 characters" })
    .max(255, { message: "Address must be at most 255 characters" }),
  provinceId: z.string().min(1, { message: "Province is required" }),
  cityId: z.string().min(1, { message: "City is required" }),
  contactNo: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{7,15}$/, { message: "Enter a valid contact number (7-15 digits)" }),
  saleTaxNo: z
    .string()
    .trim()
    .min(3, { message: "Sale Tax No must be at least 3 characters" })
    .max(20, { message: "Sale Tax No must be at most 20 characters" }),
  NICNo: z
    .string()
    .trim()
    .min(5, { message: "N.I.C No must be at least 5 characters" })
    .max(20, { message: "N.I.C No must be at most 20 characters" }),
  mobileNo: z
    .string()
    .trim()
    .regex(/^(\+92|0)?3\d{9}$/, { message: "Enter a valid mobile number (e.g. 03001234567)" }),
  daysLimit: numericRange("Days Limit", 0, 365),
  amoutLimit: numericRange("Account Limit", 0, 100_000_000),
  NTNNo: z
    .string()
    .trim()
    .min(5, { message: "NTN No is required" }),
  openingBalance: numericRange("Opening Balance", -100_000_000, 1_000_000_000),
  CNICNo: z
    .string()
    .trim()
    .regex(/^\d{5}-\d{7}-\d{1}$|^\d{13}$/, { message: "Enter a valid CNIC (e.g. 12345-1234567-1)" }),
});

export type VendorFormValues = z.infer<typeof vendorSchema>;

export const dealerSchema = z.object({
  id: z.string().optional(),
  dealarShipName: z
    .string()
    .trim()
    .min(2, { message: "Dealership Name must be at least 2 characters" })
    .max(100, { message: "Dealership Name must be at most 100 characters" }),
  name: z
    .string()
    .trim()
    .min(2, { message: "Name must be at least 2 characters" })
    .max(100, { message: "Name must be at most 100 characters" }),
  address: z
    .string()
    .trim()
    .min(5, { message: "Address must be at least 5 characters" })
    .max(255, { message: "Address must be at most 255 characters" }),
  provinceId: z.string().min(1, { message: "Province is required" }),
  cityId: z.string().min(1, { message: "City is required" }),
  contactNo: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{7,15}$/, { message: "Enter a valid contact number (7-15 digits)" }),
  saleTaxNo: z
    .string()
    .trim()
    .min(3, { message: "Sale Tax No must be at least 3 characters" })
    .max(20, { message: "Sale Tax No must be at most 20 characters" }),
  NTNNo: z
    .string()
    .trim()
    .min(5, { message: "NTN No is required" }),
  mobileNo: z
    .string()
    .trim()
    .regex(/^(\+92|0)?3\d{9}$/, { message: "Enter a valid mobile number (e.g. 03001234567)" }),
  NICNo: z
    .string()
    .trim()
    .regex(/^\d{5}-\d{7}-\d{1}$|^\d{13}$/, { message: "Enter a valid NIC/CNIC (e.g. 12345-1234567-1)" }),
  dealarType: z.enum(["single", "dealar"], { message: "Select a dealer type" }),
  opeaningBalance: numericRange("Opening Balance", -100_000_000, 1_000_000_000),
});

export type DealerFormValues = z.infer<typeof dealerSchema>;

export const inventorySchema = z.object({
  id: z.string().optional(),
  itemName: z
    .string()
    .trim()
    .min(2, { message: "Item Name must be at least 2 characters" })
    .max(200, { message: "Item Name must be at most 200 characters" }),
  categoryId: z.string().min(1, { message: "Category is required" }),
  departmentId: z.string().min(1, { message: "Department is required" }),
  pack: numericRange("Pack", 1, 100_000),
  rate: numericRange("Rate", 0, 100_000_000),
  unitPerBike: numericRange("Unit Per Bike", 0, 10_000),
  colorRows: z
    .array(
      z.object({
        stationId: z.string().min(1, { message: "Station is required" }),
        color: z.string().trim().min(1, { message: "Color is required" }),
        qty: z
          .string()
          .min(1, { message: "Qty is required" })
          .refine((v) => !Number.isNaN(Number(v)), { message: "Qty must be a valid number" })
          .refine((v) => Number(v) >= 0, { message: "Qty cannot be negative" }),
      })
    )
    .min(1, { message: "Add at least one color" }),
});

export type InventoryFormValues = z.infer<typeof inventorySchema>;

export const quotationSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1, { message: "Date is required" }),
  vendorId: z.string().min(1, { message: "Vendor is required" }),
  remarks: z.string().optional(),
  items: z
    .array(
      z.object({
        itemName: z.string().trim().min(1, { message: "Item Name is required" }),
        oldRate: z.string().min(1, { message: "Old Rate is required" }),
        proposedRate: z.string().min(1, { message: "Proposed Rate is required" }),
        approvedRate: z.string().min(1, { message: "Approved Rate is required" }),
      })
    )
    .min(1, "At least one item is required"),
});

export type QuotationFormValues = z.infer<typeof quotationSchema>;
