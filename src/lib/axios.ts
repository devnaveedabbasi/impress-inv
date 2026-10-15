import axios from "axios";
import { offlineSyncService } from "./offlineSyncService";

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";
const apiBaseUrl =
  typeof window !== "undefined" &&
  (configuredApiBaseUrl.includes("localhost") || configuredApiBaseUrl.includes("127.0.0.1")) &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : configuredApiBaseUrl;

export const syncAxiosInstance = axios.create({
  baseURL: `${apiBaseUrl}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

const axiosInstance = axios.create({
  baseURL: `${apiBaseUrl}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

const authInterceptor = (config: any) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
};

axiosInstance.interceptors.request.use(authInterceptor, (error) => Promise.reject(error));
syncAxiosInstance.interceptors.request.use(authInterceptor, (error) => Promise.reject(error));

const formDataInterceptor = (config: any) => {
  if (config.data instanceof FormData) {
    config.headers["Content-Type"] = "multipart/form-data";
  }
  return config;
};

axiosInstance.interceptors.request.use(formDataInterceptor);
syncAxiosInstance.interceptors.request.use(formDataInterceptor);

// ==========================================
// CENTRALIZED OFFLINE QUEUE INTERCEPTOR
// ==========================================
axiosInstance.interceptors.request.use(
  async (config) => {
    // If online, dispatch network request normally
    if (typeof window === "undefined" || navigator.onLine) {
      return config;
    }

    const method = config.method?.toLowerCase();
    if (method && ["post", "put", "patch", "delete"].includes(method)) {
      // Delegate to centralized offlineSyncService
      const simulatedResponse = await offlineSyncService.enqueueMutation(config);

      return {
        ...config,
        adapter: () => Promise.resolve(simulatedResponse),
      } as any;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ==========================================
// CENTRALIZED RESPONSE & CACHING INTERCEPTOR
// ==========================================
axiosInstance.interceptors.response.use(
  async (response) => {
    // Cache successful GET responses in offlineStore
    if (response.config.method?.toLowerCase() === "get" && typeof window !== "undefined" && response.config.url) {
      try {
        await offlineSyncService.cacheGetResponse(response.config.url, response.data);
      } catch (e) {
        console.warn("Failed to cache GET response in axios interceptor", e);
      }
    }
    return response;
  },
  async (error) => {
    const config = error.config;

    // Offline GET fallback
    if (
      config &&
      config.method?.toLowerCase() === "get" &&
      (!navigator.onLine || error.code === "ERR_NETWORK" || !error.response)
    ) {
      try {
        const url = config.url || "";

        // Let entity thunks handle next-id network failures so they can
        // generate and render a temporary ID immediately.
        if (url.endsWith("/next-id")) {
          return Promise.reject(error);
        }

        // 1. Direct cache lookup
        let cachedData = await offlineSyncService.getCachedResponse(url);

        // 2. Fallbacks if direct cache miss
        if (!cachedData) {
          // Check if URL is a single item lookup: e.g. /categories/15 or /categories/temp-xxx
          const cleanUrl = url.startsWith("/") ? url : `/${url}`;
          const parts = cleanUrl.split("/").filter(Boolean);
          if (parts.length >= 2) {
            const targetId = parts[parts.length - 1];
            const baseUrl = "/" + parts.slice(0, parts.length - 1).join("/");

            const listCache = await offlineSyncService.getCachedResponse(baseUrl);
            const list = Array.isArray(listCache?.data)
              ? listCache.data
              : Array.isArray(listCache)
                ? listCache
                : [];

            const foundItem = list.find(
              (item: any) =>
                String(item.id) === String(targetId) ||
                String(item.tempId) === String(targetId)
            );

            if (foundItem) {
              cachedData = {
                success: true,
                message: "Retrieved from cached list offline",
                data: foundItem,
              };
            }
          }
        }

        if (cachedData) {
          return Promise.resolve({
            data: cachedData,
            status: 200,
            statusText: "OK (Cached Fallback)",
            headers: config.headers,
            config,
            request: {},
          });
        }
      } catch (e) {
        console.error("Cache read error in axios interceptor:", e);
      }
    }

    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      window.dispatchEvent(
        new CustomEvent("unauthorized", { detail: { redirect: "/auth/login" } })
      );
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;