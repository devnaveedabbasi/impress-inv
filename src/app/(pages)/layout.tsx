import { ReactNode } from "react";
import { Navbar } from "@/components/layout/Navbar";
import Image from "next/image";
import { Images } from "@/utlis/images";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-screen h-auto flex-col bg-zinc-100 bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url('${Images.Background}')` }}
    >
      <Navbar />
      <main className="flex flex-1 justify-center px-4 py-8">
        <div className="absolute top-10 left-0 m-4">
          <Image src={Images.Logo} alt="Logo" width={100} height={100} />
        </div>
        <div className="w-full max-w-7x flex justify-center items-center">{children}</div>
      </main>
    </div>
  );
}
