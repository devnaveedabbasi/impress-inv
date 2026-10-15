import { CITIES, PROVINCES, CATEGORIES, STATIONS, DEALERS } from "@/utlis/apiRoutes";
import type { AppDispatch } from "@/store";
import {
    setReconciledId as setCategoryReconciledId,
} from "@/store/slices/categorySlice";
import {
    setReconciledId as setProvinceReconciledId,
} from "@/store/slices/provinceSlice";
import {
    setReconciledId as setCityReconciledId,
    setReconciledProvinceId as setCityReconciledProvinceId,
} from "@/store/slices/citySlice";
import {
    setReconciledId as setStationReconciledId,
} from "@/store/slices/stationSlice";
import {
    setReconciledId as setDealerReconciledId,
    setReconciledCityId as setDealerReconciledCityId,
    setReconciledProvinceId as setDealerReconciledProvinceId,
} from "@/store/slices/dealerSlice";

export function registerReconciliationListener(store: { dispatch: AppDispatch }) {
    const handler = (event: Event) => {
        const detail = (event as CustomEvent<{
            tempId: string;
            realId: string | number;
            resourceUrl: string;
        }>).detail;

        const { tempId, realId, resourceUrl } = detail;

        // Normalize url
        const url = resourceUrl.split("?")[0].replace(/\/$/, "");

        if (url === CATEGORIES) {
            store.dispatch(setCategoryReconciledId({ tempId, realId, resourceUrl: url }));
        } else if (url === PROVINCES) {
            store.dispatch(setProvinceReconciledId({ tempId, realId, resourceUrl: url }));
            store.dispatch(setCityReconciledProvinceId({ tempId, realId, resourceUrl: url }));
            store.dispatch(setDealerReconciledProvinceId({ tempId, realId }));
        } else if (url === CITIES) {
            store.dispatch(setCityReconciledId({ tempId, realId, resourceUrl: url }));
            store.dispatch(setDealerReconciledCityId({ tempId, realId }));
        } else if (url === STATIONS) {
            store.dispatch(setStationReconciledId({ tempId, realId }));
        } else if (url === DEALERS) {
            store.dispatch(setDealerReconciledId({ tempId, realId }));
        }
    };

    window.addEventListener("offline-id-reconciled", handler);
    return () => window.removeEventListener("offline-id-reconciled", handler);
}