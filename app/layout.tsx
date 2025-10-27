import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Analyseur de skin Dofus",
  description: "Extraire les couleurs et l'équipement d'un skin Dofus en un clic.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
