import { configureStore } from "@reduxjs/toolkit";
import { categoryReducer } from "@/store/slices/categorySlice";
import { provinceReducer } from "@/store/slices/provinceSlice";
import { cityReducer } from "@/store/slices/citySlice";
import stationReducer from "@/store/slices/stationSlice";
import dealerReducer from "@/store/slices/dealerSlice";
import authReducer from "@/store/slices/auth";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    category: categoryReducer,
    province: provinceReducer,
    city: cityReducer,
    station: stationReducer,
    dealer: dealerReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

