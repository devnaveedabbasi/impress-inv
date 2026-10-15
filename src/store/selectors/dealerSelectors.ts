import type { RootState } from "@/store";
import { createSelector } from "@reduxjs/toolkit";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { DEALERS } from "@/utlis/apiRoutes";

export const selectDealerList = createSelector(
    [
        (s: RootState) => s.dealer.list,
        (s: RootState) => s.dealer.offlineQueueVersion,
    ],
    (list) => {
        const rows = [...list];
        const byId = new Set(rows.map((row) => String(row.id)));
        offlineSyncService
            .getQueueSnapshot()
            .filter((item) => item.method === "post" && item.resourceUrl === DEALERS && item.tempId)
            .forEach((item) => {
                const id = String(item.tempId);
                if (byId.has(id)) return;
                const data = (item.data ?? {}) as Record<string, unknown>;
                rows.push({
                    id,
                    dealarShipName: String(data.dealarShipName ?? ""),
                    contactNo: String(data.contactNo ?? ""),
                    address: String(data.address ?? ""),
                    saleTaxNo: String(data.saleTaxNo ?? ""),
                    NTNNo: String(data.NTNNo ?? ""),
                    name: String(data.name ?? ""),
                    provinceId: String(data.provinceId ?? ""),
                    cityId: String(data.cityId ?? ""),
                    mobileNo: String(data.mobileNo ?? ""),
                    opeaningBalance: String(data.opeaningBalance ?? ""),
                    dealarType: String(data.dealarType ?? "single"),
                    NICNo: String(data.NICNo ?? ""),
                    tempId: id,
                    _offlinePending: true,
                });
            });
        return rows;
    }
);
export const selectDealerListStatus = (s: RootState) => s.dealer.listStatus;
export const selectDealerListError = (s: RootState) => s.dealer.listError;
export const selectDealerPagination = (s: RootState) => s.dealer.pagination;
export const selectDealerNextId = (s: RootState) => s.dealer.nextId;
export const selectDealerIsNewMode = (s: RootState) => s.dealer.isNewMode;
export const selectDealerIsEditing = (s: RootState) => s.dealer.isEditing;
export const selectDealerIsIdLoading = (s: RootState) => s.dealer.isIdLoading;
export const selectDealerIsSubmitting = (s: RootState) => s.dealer.isSubmitting;
export const selectDealerIsLookingUp = (s: RootState) => s.dealer.isLookingUp;
export const selectDealerCurrentRecord = (s: RootState) => s.dealer.currentRecord;
export const selectDealerApiError = (s: RootState) => s.dealer.apiError;