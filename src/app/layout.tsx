import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { siteUrl } from "@/lib/config";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Pharma AI Connect — Votre médicament, au bon endroit", template: "%s | Pharma AI Connect" },
  description: "Trouvez une pharmacie, vérifiez la disponibilité et choisissez comment récupérer votre médicament. Aucun compte nécessaire pour commencer.",
};

export const viewport: Viewport = { themeColor: "#10243B", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={manrope.variable}>
      <body className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-8 pb-28 lg:pb-8">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
