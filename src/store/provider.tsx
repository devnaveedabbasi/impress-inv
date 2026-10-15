"use client";

import { useEffect } from "react";
import { Provider } from "react-redux";
import { store } from "@/store";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { OfflineSyncManager } from "@/components/OfflineSyncManager";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { CATEGORIES, CITIES, DEALERS, PROVINCES } from "@/utlis/apiRoutes";
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
    }

    if (detail.resourceUrl === CITIES) {
      store.dispatch(citySlice.actions.setReconciledId(detail));
    }

    if (detail.resourceUrl === DEALERS) {
      store.dispatch(dealerSlice.actions.setReconciledId(detail));
    }
  };

  const onNetwork = () => {
    if (navigator.onLine) {
      void offlineSyncService.processQueue();
      store.dispatch(fetchAllCategories({ page: 1, limit: 10 }));
      store.dispatch(fetchAllProvinces({ page: 1, limit: 10 }));
      store.dispatch(fetchAllCities({ page: 1, limit: 10 }));
      store.dispatch(fetchCategoryNextId());
      store.dispatch(fetchProvinceNextId());
      store.dispatch(fetchCityNextId());
      store.dispatch(fetchStationNextId());
      store.dispatch(fetchDealerNextId());
      store.dispatch(fetchAllStations({ page: 1, limit: 10 }));
      store.dispatch(fetchAllDealers({ page: 1, limit: 10 }));
    } else {
      // Prime a usable temp ID immediately on the offline transition.
      // The master-entry form effects reset their IDs from these values.
      store.dispatch(fetchCategoryNextId());
      store.dispatch(fetchProvinceNextId());
      store.dispatch(fetchCityNextId());
      store.dispatch(fetchStationNextId());
      store.dispatch(fetchDealerNextId());
    }
  };

  window.addEventListener("offline-id-reconciled", onReconciled);
  window.addEventListener("online", onNetwork);
  window.addEventListener("offline", onNetwork);

  return () => {
    window.removeEventListener("offline-id-reconciled", onReconciled);
    window.removeEventListener("online", onNetwork);
    window.removeEventListener("offline", onNetwork);
  };
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const unregister = registerReconciliationListener();
    const unsubscribeQueue = offlineSyncService.subscribeQueue(() => {
      const version = Date.now();
      store.dispatch(categorySlice.actions.setOfflineQueueVersion(version));
      store.dispatch(provinceSlice.actions.setOfflineQueueVersion(version));
      store.dispatch(citySlice.actions.setOfflineQueueVersion(version));
      store.dispatch(dealerSlice.actions.setOfflineQueueVersion(version));
    });

    return () => {
      unregister();
      unsubscribeQueue();
    };
  }, []);

  return (
    <Provider store={store}>
      <OfflineSyncManager />
      <AuthGuard>{children}</AuthGuard>
    </Provider>
  );
}