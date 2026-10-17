import { configureStore } from "@reduxjs/toolkit";
import { categoryReducer } from "@/store/slices/categorySlice";
import { provinceReducer } from "@/store/slices/provinceSlice";
import { cityReducer } from "@/store/slices/citySlice";
import stationReducer from "@/store/slices/stationSlice";
import dealerReducer from "@/store/slices/dealerSlice";
import authReducer from "@/store/slices/auth";

import { departmentReducer } from "@/store/slices/departmentSlice";
import { vendorReducer } from "@/store/slices/vendorSlice";
import { inventoryReducer } from "@/store/slices/inventorySlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    category: categoryReducer,
    province: provinceReducer,
    city: cityReducer,
    station: stationReducer,
    dealer: dealerReducer,
    department: departmentReducer,
    vendor: vendorReducer,
    inventory: inventoryReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

