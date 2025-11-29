import "../public/styles.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Navbar } from "./components/Navbar";
import type { NavLink } from "./components/types";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "KROSKIN",
  description: "Crée ton style. Maîtrise ton skin.",
  icons: [
    { rel: "icon", url: "/favicon.svg" },
    { rel: "alternate icon", url: "/favicon-dark.svg" },
  ],
};

const links: NavLink[] = [
  { label: "Générateur", href: "/" },
  { label: "Inspiration", href: "/inspiration" },
  { label: "Export", href: "/vision" },
  { label: "À propos", href: "/#kroskin-about" },
];

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <Navbar
          brand={{ label: "KROSKIN", href: "/" }}
          links={links}
          enableSearch
          enableThemeToggle
        />
        <main className="layout-offset">{children}</main>
      </body>
    </html>
  );
}
