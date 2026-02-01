import Link from "next/link";
import { LucideGithub, LucideLinkedin, LucideMail } from "lucide-react";

export function Footer() {
  const socialLinks = [
    {
      href: "https://github.com/rakshitpoonia",
      icon: (
        <LucideGithub className="w-5 h-5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors" />
      ),
    },
    {
      href: "https://www.linkedin.com/in/rakshit-poonia/",
      icon: (
        <LucideLinkedin className="w-5 h-5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors" />
      ),
    },
    {
      href: "mailto:rakshitpoonia2006@gmail.com?subject=Regarding%20Tech%20Role&body=Hello%20RP,%0D%0A%0D%0AI%20came%20across%20your%20profile%20and%20would%20like%20to%20connect.%0D%0A%0D%0ABest%20regards,%0D%0A",
      icon: (
        <LucideMail className="w-5 h-5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors" />
      ),
    },
  ];

  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 flex flex-col items-center space-y-6 text-center">
        {/* Social Links */}
        <div className="flex gap-4">
          {socialLinks.map((link, index) => (
            <Link
              key={index}
              href={link.href || "#"}
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.icon}
            </Link>
          ))}
        </div>

        {/* Copyright Notice */}
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          &copy; {new Date().getFullYear()} VibeFlow-Rakshit Poonia. All rights
          reserved.
        </p>
      </div>
    </footer>
  );
}
