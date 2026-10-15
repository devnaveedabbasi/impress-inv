"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import api from "@/lib/axios";
import { USER_DETAILS } from "@/utils/apiRoutes";
import { setCredentials, logoutUser } from "@/store/slices/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        if (pathname !== "/auth/login") {
          dispatch(logoutUser());
          router.push("/auth/login");
        }
        setLoading(false);
        return;
      }

      // If we already have user in Redux, skip fetching
      if (isAuthenticated) {
        if (pathname === "/auth/login") {
          router.push("/");
        }
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get(USER_DETAILS);
        dispatch(setCredentials({ user: data.data, token }));
        localStorage.setItem("user", JSON.stringify(data.data));

        if (pathname === "/auth/login") {
          router.push("/");
        }
      } catch (error: any) {
        // Agar network band hai ya server reachable nahi hai (offline state)
        if (!navigator.onLine || error.code === "ERR_NETWORK" || !error.response) {
          const cachedUserStr = localStorage.getItem("user");
          if (cachedUserStr) {
            try {
              const cachedUser = JSON.parse(cachedUserStr);
              dispatch(setCredentials({ user: cachedUser, token }));
              if (pathname === "/auth/login") router.push("/");
              return;
            } catch {
              // fallback to normal
            }
          }
        }

        // Sirf tab logout karo jab server ne explicitly 401 Unauthorized bola ho
        if (error.response?.status === 401) {
          console.error("Session expired", error);
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          dispatch(logoutUser());
          if (pathname !== "/auth/login") {
            router.push("/auth/login");
          }
        }
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [dispatch, router, pathname, isAuthenticated]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
      </div>
    );
  }

  // Prevent flashing protected content if not authenticated and not on login page
  if (!isAuthenticated && pathname !== "/auth/login") {
    return null;
  }

  return <>{children}</>;
}
