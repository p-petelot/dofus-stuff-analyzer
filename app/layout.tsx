import "../public/styles.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Navbar } from "./components/Navbar";
import type { NavLink } from "./components/types";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "PrismForge",
  description: "Générateur de skins Dofus premium",
  icons: [{ rel: "icon", url: "/logo.svg" }],
};

const links: NavLink[] = [
  { label: "Accueil", href: "/" },
  {
    label: "Collections",
    href: "/collections",
    children: [
      {
        label: "Collection Thèmes",
        href: "/collections/themes",
        desc: "Choisissez une couleur et explorez des skins variés",
      },
    ],
  },
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
          brand={{ label: "[[NomDuSite]]", href: "/" }}
          links={links}
          enableSearch
          enableThemeToggle
        />
        <main className="layout-offset">{children}</main>
      </body>
    </html>
  );
}
