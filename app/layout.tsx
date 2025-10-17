import '../public/styles.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Prismforge',
  description: 'Outils pour analyser les skins Dofus',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

