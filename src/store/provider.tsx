"use client";

import { useEffect } from "react";
import { Provider } from "react-redux";
import { store } from "@/store";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { OfflineSyncManager } from "@/components/OfflineSyncManager";
import { offlineSyncService } from "@/lib/offlineSyncService";
import { CATEGORIES, CITIES, DEALERS, DEPARTMENTS, INVENTORY, PROVINCES, STATIONS, VENDORS } from "@/utils/apiRoutes";
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
  departmentSlice,
  fetchAllDepartments,
  fetchDepartmentNextId,
} from "@/store/slices/departmentSlice";
import {
  fetchAllDealers,
  fetchDealerNextId,
  dealerSlice,
} from "@/store/slices/dealerSlice";
import {
  fetchAllVendors,
  fetchVendorNextId,
  vendorSlice,
} from "@/store/slices/vendorSlice";
import {
  fetchAllInventories,
  fetchInventoryNextId,
  inventorySlice,
} from "@/store/slices/inventorySlice";

function registerReconciliationListener() {
  const onReconciled = (event: Event) => {
    const detail = (event as CustomEvent<{ tempId: string; realId: string | number; resourceUrl: string }>).detail;
    if (!detail) return;

    if (detail.resourceUrl === CATEGORIES) {
      store.dispatch(categorySlice.actions.setReconciledId(detail));
      store.dispatch(inventorySlice.actions.setReconciledId(detail));
    }

    if (detail.resourceUrl === PROVINCES) {
      store.dispatch(provinceSlice.actions.setReconciledId(detail));
      store.dispatch(citySlice.actions.setReconciledProvinceId(detail));
      store.dispatch(dealerSlice.actions.setReconciledProvinceId(detail));
      store.dispatch(vendorSlice.actions.setReconciledId(detail));
    }

    if (detail.resourceUrl === CITIES) {
      store.dispatch(citySlice.actions.setReconciledId(detail));
      store.dispatch(dealerSlice.actions.setReconciledCityId(detail));
      store.dispatch(vendorSlice.actions.setReconciledId(detail));
    }

    if (detail.resourceUrl === STATIONS) {
      store.dispatch(stationSlice.actions.setReconciledId(detail));
      store.dispatch(inventorySlice.actions.setReconciledId(detail));
    }

    if (detail.resourceUrl === DEPARTMENTS) {
      store.dispatch(departmentSlice.actions.setReconciledId(detail));
      store.dispatch(inventorySlice.actions.setReconciledId(detail));
    }

    if (detail.resourceUrl === DEALERS) {
      store.dispatch(dealerSlice.actions.setReconciledId(detail));
    }

    if (detail.resourceUrl === VENDORS) {
      store.dispatch(vendorSlice.actions.setReconciledId(detail));
    }

    if (detail.resourceUrl === INVENTORY) {
      store.dispatch(inventorySlice.actions.setReconciledId(detail));
    }
  };

  const refreshLists = () => {
    store.dispatch(fetchAllCategories({ page: 1, limit: 10 }));
    store.dispatch(fetchAllProvinces({ page: 1, limit: 100 }));
    store.dispatch(fetchAllCities({ page: 1, limit: 500 }));
    store.dispatch(fetchAllStations({ page: 1, limit: 100 }));
    store.dispatch(fetchAllDepartments({ page: 1, limit: 100 }));
    store.dispatch(fetchAllDealers({ page: 1, limit: 10 }));
    store.dispatch(fetchAllVendors({ page: 1, limit: 10 }));
    store.dispatch(fetchAllInventories({ page: 1, limit: 10 }));
  };

  const onOnline = () => {
    void offlineSyncService.processQueue().finally(() => {
      refreshLists();
      store.dispatch(fetchCategoryNextId());
      store.dispatch(fetchProvinceNextId());
      store.dispatch(fetchCityNextId());
      store.dispatch(fetchStationNextId());
      store.dispatch(fetchDepartmentNextId());
      store.dispatch(fetchDealerNextId());
      store.dispatch(fetchVendorNextId());
      store.dispatch(fetchInventoryNextId());
    });
  };

  const onOffline = () => {
    store.dispatch(fetchCategoryNextId());
    store.dispatch(fetchProvinceNextId());
    store.dispatch(fetchCityNextId());
    store.dispatch(fetchStationNextId());
    store.dispatch(fetchDepartmentNextId());
    store.dispatch(fetchDealerNextId());
    store.dispatch(fetchVendorNextId());
    store.dispatch(fetchInventoryNextId());
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