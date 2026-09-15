"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setCredentials } from "@/store/slices/auth";
import { Icon } from "@iconify/react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { loginSchema } from "@/lib/validations/auth";
import { useForm } from "@/hooks/useForm";
import { Images } from "@/utlis/images";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/axios";
import { LOGIN } from "@/utlis/apiRoutes";
import Cookies from "js-cookie";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const loginMutation = useMutation({
    // Yeh "try" block hai (API call yahan hoti hai)
    mutationFn: async (credentials: Record<string, any>) => {
      const { data } = await api.post(LOGIN, credentials);
      return data.data;
    },
    // Yeh try ke andar success hone ke baad ka code hai
    onSuccess: (data) => {
      Cookies.set("token", data.token, { expires: 7 });
      dispatch(setCredentials({ user: data.user, token: data.token }));
      toast.success("Login Successful!");
      router.push("/");
    },
    // Yeh "catch" block hai (Error aane par yeh chalta hai)
    onError: (error: any) => {
      const errorMessage = error.response?.data?.message || "Login failed";
      toast.error(errorMessage);
      console.error("Error:", errorMessage);
    }
  });

  const {
    values,
    errors,
    handleInputChange,
    handleSubmit,
  } = useForm({
    initialValues: { email: "", password: "" },
    validationSchema: loginSchema,
    onSubmit: async (data) => {
      await loginMutation.mutateAsync(data);
    },
  });

  const isLoading = loginMutation.isPending;
  const error = loginMutation.isError
    ? (loginMutation.error as any).response?.data?.message || (loginMutation.error as Error).message || "Login failed"
    : null;

  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl sm:p-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image
          src={Images.Logo}
          alt="Logo"
          width={100}
          height={100}
          className="mb-4 w-auto h-auto"
          priority
        />
      </div>

      <h1 className="text-center text-2xl font-bold text-zinc-900">
        Login to your account
      </h1>
      <p className="mt-1 text-center text-sm text-zinc-500">
        Access your dashboard to manage orders and menu.
      </p>

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <Input
          type="text"
          placeholder="Email or phone number"
          icon={<Icon icon="mdi:email-outline" className="h-5 w-5" />}
          value={values.email}
          onChange={handleInputChange("email")}
          error={errors.email}
        />

        <Input
          type="password"
          placeholder="Password"
          icon={<Icon icon="mdi:lock-outline" className="h-5 w-5" />}
          value={values.password}
          onChange={handleInputChange("password")}
          error={errors.password}
        />


        <Button type="submit" isLoading={isLoading} className="mt-2 w-full">
          {isLoading ? "Signing in..." : "Login"}
        </Button>
      </form>


    </div>
  );
}
