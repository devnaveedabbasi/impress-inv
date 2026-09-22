"use client";

import { useEffect, useState } from "react";
import { LabeledField } from "@/components/ui/LabeledField";
import { LabeledSelect } from "@/components/ui/LabeledSelect";
import { Button } from "@/components/ui/Button";
import { useForm } from "@/hooks/useForm";
import { inwardSchema, type InwardFormValues } from "@/lib/validations/master";
import { INWARDS, PURCHASE_ORDERS } from "@/utlis/apiRoutes";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";

const defaultRow = () => ({ code: "", itemName: "", poBalQty: "", recQty: "", rejQty: "", okQty: "", packingDetail: "" });

const initialValues: InwardFormValues = {
    id: "",
    date: new Date().toISOString().split('T')[0],
    Type: "againstPO",
    purchaseOrderId: "",
    quotationId: "",
    GRIRNo: "",
    DCNo: "",
    billNO: "",
    detail: "",
    name: "",
    items: Array.from({ length: 10 }, defaultRow),
};

export default function InwardQualityControlPage() {
    const [isNewMode, setIsNewMode] = useState(true);
    const [isEditing, setIsEditing] = useState(true);
    const [purchaseOrders, setPurchaseOrders] = useState<{ label: string; value: string }[]>([]);

    const fetchOptions = async () => {
        try {
            const [poRes] = await Promise.allSettled([
                api.get(PURCHASE_ORDERS),
            ]);
            if (poRes.status === "fulfilled") {
                setPurchaseOrders((poRes.value.data.data || []).map((po: any) => ({ label: `PO-${po.id}`, value: String(po.id) })));
            }
        } catch (error) {
            console.error("Failed to fetch dropdown options", error);
        }
    };
    const { hasPermission } = usePermissions();
    const canCreate = hasPermission("inward_quality_control", "create");
    const canUpdate = hasPermission("inward_quality_control", "update");
    const canView = hasPermission("inward_quality_control", "view");


    const fetchNextId = async () => {
        try {
            const { data } = await api.get(`${INWARDS}/next-id`);
            setValues({ ...initialValues, id: String(data.data.nextId) });
            setIsNewMode(true);
            setIsEditing(true);
        } catch (error) {
            console.error("Failed to fetch next Inward ID", error);
        }
    };

    useEffect(() => {
        fetchNextId();
        fetchOptions();
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
        validationSchema: inwardSchema,
        onSubmit: async (data) => {
            const validRows = data.items.filter(r => r.code && r.itemName && r.poBalQty && r.recQty && r.rejQty && r.okQty);
            if (validRows.length === 0) {
                toast.error("Please fill at least one complete row");
                return;
            }

            const payload = {
                date: new Date(data.date).toISOString(),
                Type: data.Type,
                purchaseOrderId: data.purchaseOrderId ? Number(data.purchaseOrderId) : null,
                quotationId: data.quotationId ? Number(data.quotationId) : null,
                GRIRNo: Number(data.GRIRNo),
                DCNo: Number(data.DCNo),
                billNO: data.billNO ? Number(data.billNO) : null,
                detail: data.detail,
                
                code: validRows.map(r => Number(r.code)),
                itemName: validRows.map(r => r.itemName),
                poBalQty: validRows.map(r => Number(r.poBalQty)),
                recQty: validRows.map(r => Number(r.recQty)),
                rejQty: validRows.map(r => Number(r.rejQty)),
                okQty: validRows.map(r => Number(r.okQty)),
                packingDetail: validRows.map(r => r.packingDetail || ""),
            };

            try {
                if (isNewMode) {
                    const response = await api.post(INWARDS, payload);
                    toast.success(response.data.message || "Inward created successfully");
                } else {
                    const response = await api.put(`${INWARDS}/${data.id}`, payload);
                    toast.success(response.data.message || "Inward updated successfully");
                }
                fetchNextId();
            } catch (error: any) {
                toast.error(error.response?.data?.message || "Failed to save Inward");
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
            const { data } = await api.get(`${INWARDS}/${values.id}`);
            if (data.data) {
                const inv = data.data;
                const fetchedRows = (inv.itemName || []).map((name: string, i: number) => ({
                    code: String(inv.code?.[i] ?? ""),
                    itemName: name,
                    poBalQty: String(inv.poBalQty?.[i] ?? ""),
                    recQty: String(inv.recQty?.[i] ?? ""),
                    rejQty: String(inv.rejQty?.[i] ?? ""),
                    okQty: String(inv.okQty?.[i] ?? ""),
                    packingDetail: String(inv.packingDetail?.[i] ?? ""),
                }));

                while (fetchedRows.length < 10) fetchedRows.push(defaultRow());
                if (fetchedRows.length > 10) fetchedRows.length = 10;

                setValues({
                    id: String(inv.id),
                    date: new Date(inv.date).toISOString().split('T')[0],
                    Type: inv.Type,
                    purchaseOrderId: String(inv.purchaseOrderId || ""),
                    quotationId: String(inv.quotationId || ""),
                    GRIRNo: String(inv.GRIRNo || ""),
                    DCNo: String(inv.DCNo || ""),
                    billNO: String(inv.billNO || ""),
                    detail: inv.detail || "",
                    name: inv.purchaseOrder?.vendor?.vendorName || "",
                    items: fetchedRows,
                });
                setIsNewMode(false);
                setIsEditing(false);
                toast.success("Inward record found");
            } else {
                toast.error("Inward record not found");
                setValues({ ...initialValues, id: values.id });
                setIsNewMode(true);
            }
        } catch (error: any) {
            if (error.response?.status === 403) {
                toast.error(error.response?.data?.message || "Access denied. You do not have permission.");
            } else {
                toast.error("Inward record not found");
            }
            setValues({ ...initialValues, id: values.id });
            setIsNewMode(true);
        }
    };

    const handlePOChange = async (val: string) => {
        handleSelectChange("purchaseOrderId")(val);
        if (!val) return;
        try {
            const { data } = await api.get(`${PURCHASE_ORDERS}/${val}`);
            if (data.data) {
                const po = data.data;
                const fetchedRows = (po.itemName || []).map((name: string, i: number) => ({
                    code: String(po.code?.[i] ?? ""),
                    itemName: name,
                    poBalQty: String(po.quantity?.[i] ?? "0"),
                    recQty: "",
                    rejQty: "",
                    okQty: "",
                    packingDetail: "",
                }));
                
                while (fetchedRows.length < 10) fetchedRows.push(defaultRow());
                if (fetchedRows.length > 10) fetchedRows.length = 10;
                
                setValues(prev => ({
                    ...prev,
                    name: po.vendor?.vendorName || po.vendor?.name || "",
                    quotationId: String(po.quotationId || ""),
                    items: fetchedRows
                }));
                toast.success("PO details loaded");
            }
        } catch (error) {
            console.error("Failed to load PO details", error);
            toast.error("Failed to load PO details");
        }
    };

    const updateItemRow = (index: number, field: keyof typeof initialValues.items[0], value: string) => {
        setValues((prev) => {
            const newItems = prev.items.map((row, i) => {
                if (i === index) {
                    if (field === "itemName" && value === "") {
                        return defaultRow();
                    }
                    const newRow = { ...row, [field]: value };
                    
                    if (field === "recQty" || field === "rejQty") {
                        const rec = Number(newRow.recQty) || 0;
                        const rej = Number(newRow.rejQty) || 0;
                        const ok = rec - rej;
                        newRow.okQty = String(ok > 0 ? ok : 0);
                    }
                    
                    return newRow;
                }
                return row;
            });
            return { ...prev, items: newItems };
        });
    };

    const btnClass = "bg-white border border-zinc-400 px-6 py-1.5 text-[15px] text-black hover:bg-zinc-50 active:bg-zinc-100 min-w-[85px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center";

    return (
        <section className="mx-auto mt-10 w-full max-w-6xl bg-[#f0f0f0] p-8 shadow-sm text-black">
            <h1 className="mb-8 text-center text-4xl text-black tracking-wide">Inward / Quality Control</h1>

            <form onSubmit={handleSubmit} noValidate>
                {/* Top Section */}
                <div className="flex flex-wrap gap-4 mb-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-16">Q.C No</label>
                        <input
                            type="number"
                            value={values.id || ""}
                            onChange={handleInputChange("id")}
                            onBlur={handleIdBlur}
                            className="border border-zinc-300 px-2 py-1 outline-none w-24 bg-white"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-12 text-right">Date</label>
                        <input
                            type="date"
                            value={values.date}
                            onChange={handleInputChange("date")}
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-36 bg-white"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-10 text-right">Type</label>
                        <select
                            value={values.Type}
                            onChange={(e) => handleSelectChange("Type")(e.target.value)}
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-40 bg-white"
                        >
                            <option value="againstPO">Against PO</option>
                            <option value="againstSimple">Against Simple</option>
                            <option value="againstDealarRejection">Against Dealer Rejection</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium w-10 text-right">PO#</label>
                        <select
                            value={values.purchaseOrderId}
                            onChange={(e) => handlePOChange(e.target.value)}
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-24 bg-white"
                        >
                            <option value="">Select</option>
                            {purchaseOrders.map(po => <option key={po.value} value={po.value}>{po.value}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center">
                        <button type="button" onClick={() => handlePOChange(values.purchaseOrderId)} disabled={!isEditing} className="bg-white border border-zinc-300 px-4 py-1 text-sm hover:bg-zinc-50 disabled:opacity-50">Find Po</button>
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                    <label className="text-sm font-medium w-16">Name</label>
                    <input
                        type="text"
                        value={values.name}
                        readOnly
                        className="border border-zinc-300 px-2 py-1 outline-none flex-1 bg-white text-black font-medium"
                    />
                </div>

                <div className="flex flex-wrap gap-4 mb-4">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <label className="text-sm font-medium w-20">G.R.LR No</label>
                        <input
                            type="number"
                            value={values.GRIRNo}
                            onChange={handleInputChange("GRIRNo")}
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-full bg-white"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <label className="text-sm font-medium w-16 text-right">Dc No</label>
                        <input
                            type="number"
                            value={values.DCNo}
                            onChange={handleInputChange("DCNo")}
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-full bg-white"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <label className="text-sm font-medium w-16 text-right">Bill No</label>
                        <input
                            type="number"
                            value={values.billNO}
                            onChange={handleInputChange("billNO")}
                            disabled={!isEditing}
                            className="border border-zinc-300 px-2 py-1 outline-none w-full bg-white"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-6">
                    <label className="text-sm font-medium w-16">Details</label>
                    <input
                        type="text"
                        value={values.detail}
                        onChange={handleInputChange("detail")}
                        disabled={!isEditing}
                        className="border border-zinc-300 px-2 py-1 outline-none flex-1 bg-white"
                    />
                </div>

                {/* Table Section */}
                <div className="bg-white mb-6 overflow-x-auto border border-zinc-300">
                    <table className="w-full border-collapse text-[13px] text-black">
                        <thead>
                            <tr className="border-b border-zinc-300">
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-20">Code</th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium">Item Name</th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-24">Pol Bal Qty</th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-24">Rec Qty</th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-20">REJ</th>
                                <th className="border-r border-zinc-300 px-2 py-1 font-medium w-20">Ok</th>
                                <th className="px-2 py-1 font-medium w-48">Paking Detail</th>
                            </tr>
                        </thead>
                        <tbody>
                            {values.items.map((row, index) => (
                                <tr key={index} className="border-b border-zinc-200 last:border-b-0">
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.code}
                                            onChange={(e) => updateItemRow(index, "code", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="text"
                                            value={row.itemName}
                                            onChange={(e) => updateItemRow(index, "itemName", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.poBalQty}
                                            onChange={(e) => updateItemRow(index, "poBalQty", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.recQty}
                                            onChange={(e) => updateItemRow(index, "recQty", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.rejQty}
                                            onChange={(e) => updateItemRow(index, "rejQty", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                    <td className="border-r border-zinc-200 p-0">
                                        <input
                                            type="number"
                                            value={row.okQty}
                                            readOnly
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 text-center outline-none disabled:bg-[#f3f4f6] text-black font-medium"
                                        />
                                    </td>
                                    <td className="p-0">
                                        <input
                                            type="text"
                                            value={row.packingDetail}
                                            onChange={(e) => updateItemRow(index, "packingDetail", e.target.value)}
                                            disabled={!isEditing}
                                            className="w-full bg-transparent px-2 py-1 outline-none disabled:bg-[#f3f4f6]"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {errors.items && <p className="mb-4 text-xs text-red-500 text-center">{errors.items}</p>}

                {/* Bottom Buttons */}
                <div className="flex justify-center gap-3">
                    <button type="button" onClick={fetchNextId} className={btnClass} disabled={isSubmitting || !canCreate}>New</button>
                    <button type="button" onClick={() => setIsEditing(true)} className={btnClass} disabled={isNewMode || isEditing}>Edit</button>
                    <button type="submit" className={btnClass} disabled={!isEditing || isSubmitting}>Save</button>
                    <button type="button" className={btnClass}>Pint</button>
                </div>
            </form>
        </section>
    );
}
