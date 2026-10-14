import { ReactNode } from "react";
import { Navbar } from "@/components/layout/Navbar";
import Image from "next/image";
import { Images } from "@/utlis/images";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen bg-zinc-100 bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url('${Images.Background}')` }}
    >
      <Navbar />

      <main className="relative min-h-[calc(100vh-57px)] px-3 py-6 sm:px-4 sm:py-8">
        {/* Logo — smaller on mobile, moved to top-center-left, doesn't overlap content */}
        <div className="pointer-events-none absolute left-2 top-2 w-10 sm:left-4 sm:top-4 sm:w-20">
          <Image
            src={Images.Logo}
            alt="Logo"
            width={100}
            height={100}
            className="h-auto w-full"
            priority
          />
        </div>

        {/* Content wrapper — leaves room for logo on small screens */}
        <div className="mx-auto flex w-full max-w-7xl justify-center pt-8 sm:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
}