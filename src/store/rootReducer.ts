import auth from "./slices/auth";
import { categoryReducer } from "@/store/slices/categorySlice";
import { provinceReducer } from "@/store/slices/provinceSlice";
import { cityReducer } from "@/store/slices/citySlice";

const rootReducer = {
  auth,
  category: categoryReducer,
  province: provinceReducer,
  city: cityReducer,
};

export default rootReducer;
