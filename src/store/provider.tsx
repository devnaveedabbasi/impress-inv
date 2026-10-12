"use client";

import { Provider } from "react-redux";
import { store, persistor } from ".";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { PersistGate } from "redux-persist/integration/react";
import { OfflineSyncManager } from "@/components/OfflineSyncManager";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <OfflineSyncManager />
        <AuthGuard>{children}</AuthGuard>
      </PersistGate>
    </Provider>
  );
}