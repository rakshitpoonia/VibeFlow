import { cn } from "@/lib/utils";
import Header from "@/modules/home/header";
import Footer from "@/modules/home/footer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "VibeFlow ",
    default: "Code Editor For Vibe Coding - VibeFlow",
  },
};
export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="z-20 relative w-full pt-0">{children}</main>
      <Footer />
    </>
  );
}
