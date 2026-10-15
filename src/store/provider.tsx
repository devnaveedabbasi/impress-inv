"use client";

import { useEffect } from "react";
import { Provider } from "react-redux";
import { store } from "@/store";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { OfflineSyncManager } from "@/components/OfflineSyncManager";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { CATEGORIES, CITIES, DEALERS, PROVINCES, STATIONS } from "@/utils/apiRoutes";
import {
  categorySlice,
  fetchAllCategories,
  fetchCategoryNextId,
} from "@/store/slices/categorySlice";
import {
  provinceSlice,
  fetchAllProvinces,
  fetchProvinceNextId,
} from "@/store/slices/provinceSlice";
import {
  citySlice,
  fetchAllCities,
  fetchCityNextId,
} from "@/store/slices/citySlice";
import {
  stationSlice,
  fetchAllStations,
  fetchStationNextId,
} from "@/store/slices/stationSlice";
import {
  fetchAllDealers,
  fetchDealerNextId,
  dealerSlice,
} from "@/store/slices/dealerSlice";

function registerReconciliationListener() {
  const onReconciled = (event: Event) => {
    const detail = (event as CustomEvent<{ tempId: string; realId: string | number; resourceUrl: string }>).detail;
    if (!detail) return;

    if (detail.resourceUrl === CATEGORIES) {
      store.dispatch(categorySlice.actions.setReconciledId(detail));
    }

    if (detail.resourceUrl === PROVINCES) {
      store.dispatch(provinceSlice.actions.setReconciledId(detail));
      store.dispatch(citySlice.actions.setReconciledProvinceId(detail));
      // dealers that point to a province created offline
      store.dispatch(dealerSlice.actions.setReconciledProvinceId(detail));
    }

    if (detail.resourceUrl === CITIES) {
      store.dispatch(citySlice.actions.setReconciledId(detail));
      // dealers that point to a city created offline
      store.dispatch(dealerSlice.actions.setReconciledCityId(detail));
    }

    if (detail.resourceUrl === STATIONS) {
      store.dispatch(stationSlice.actions.setReconciledId(detail));
    }

    if (detail.resourceUrl === DEALERS) {
      store.dispatch(dealerSlice.actions.setReconciledId(detail));
    }
  };

  const refreshLists = () => {
    // Use the SAME limits as the pages (provinces 100, cities 500). With limit 10 the
    // dropdowns would only show 10 rows after the network comes back.
    store.dispatch(fetchAllCategories({ page: 1, limit: 10 }));
    store.dispatch(fetchAllProvinces({ page: 1, limit: 100 }));
    store.dispatch(fetchAllCities({ page: 1, limit: 500 }));
    store.dispatch(fetchAllStations({ page: 1, limit: 10 }));
    store.dispatch(fetchAllDealers({ page: 1, limit: 10 }));
  };

  const onOnline = () => {
    // Sync first, THEN refresh lists and fetch real next IDs from server
    void offlineSyncService.processQueue().finally(() => {
      refreshLists();
      store.dispatch(fetchCategoryNextId());
      store.dispatch(fetchProvinceNextId());
      store.dispatch(fetchCityNextId());
      store.dispatch(fetchStationNextId());
      store.dispatch(fetchDealerNextId());
    });
  };

  const onOffline = () => {
    // Prime a usable temp ID immediately on the offline transition.
    // The master-entry form effects reset their IDs from these values.
    store.dispatch(fetchCategoryNextId());
    store.dispatch(fetchProvinceNextId());
    store.dispatch(fetchCityNextId());
    store.dispatch(fetchStationNextId());
    store.dispatch(fetchDealerNextId());
  };

  window.addEventListener("offline-id-reconciled", onReconciled);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  return () => {
    window.removeEventListener("offline-id-reconciled", onReconciled);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const unregister = registerReconciliationListener();

    return () => {
      unregister();
    };
  }, []);

  return (
    <Provider store={store}>
      <OfflineSyncManager />
      <AuthGuard>{children}</AuthGuard>
    </Provider>
  );
}