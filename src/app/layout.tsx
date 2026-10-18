import type { Metadata, Viewport } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { siteUrl } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Pharma AI Connect — Trouvez vos médicaments près de chez vous", template: "%s | Pharma AI Connect" },
  description: "Recherchez un médicament, vérifiez sa disponibilité, commandez et suivez votre commande, sans créer de compte.",
};

export const viewport: Viewport = { themeColor: "#0b8a6b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
