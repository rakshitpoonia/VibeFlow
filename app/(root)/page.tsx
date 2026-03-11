import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import UserButton from "@/modules/auth/components/user-button";

export default async function Home() {
  const session = await auth();
  const isSignedIn = !!session?.user;
  const redirectUrl = isSignedIn ? "/dashboard" : "/auth/sign-in";

  return (
    <div className=" z-20 flex flex-col items-center justify-start min-h-screen py-2 mt-10">
      <div className="flex flex-col justify-center items-center my-5">
        <Image
          src={"/hero.svg"}
          alt="Hero-Section"
          height={400}
          width={400}
          className="h-auto"
        />

        <h1
          className=" z-20 text-5xl mt-5 font-extrabold text-center bg-clip-text text-transparent bg-gradient-to-r 
from-amber-500 via-orange-400 to-orange-300 
dark:from-amber-400 dark:via-orange-300 dark:to-orange-200
 "
        >
          Vibe Code With Intelligence
        </h1>
      </div>

      <p className="mt-2 text-lg text-center text-gray-600 dark:text-gray-400 px-5 py-10 max-w-2xl">
        VibeFlow is a high performance web based AI first code editor that
        enhances your coding experience with advanced features and seamless
        integration. It is designed to help you write, debug, and optimize your
        code efficiently.
      </p>
      <Link href={redirectUrl}>
        <Button variant={"brand"} className="mb-4" size={"lg"}>
          Get Started
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Button>
      </Link>
    </div>
  );
}
