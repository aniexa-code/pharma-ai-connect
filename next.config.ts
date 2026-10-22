import type { NextConfig } from "next";

// La politique de contenu (CSP), qui change à chaque requête (nonce), est posée par src/middleware.ts.
const securityHeaders = [
  // HTTPS obligatoire pendant 2 ans, sous-domaines compris : le navigateur refuse ensuite tout accès en clair.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()" },
  // Isole la fenêtre du site des onglets ouverts par d'autres sites, et ses ressources des autres origines.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Origin-Agent-Cluster", value: "?1" },
];

// Pages ouvertes par un lien secret : jamais transmises en Referer, jamais indexées, jamais mises en cache.
const secretPageHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Imports de stock (CSV / Excel) envoyés par les pharmacies : 2 Mo de fichier au plus.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/suivi/:path*", headers: secretPageHeaders },
      { source: "/demande/:path*", headers: secretPageHeaders },
    ];
  },
};

export default nextConfig;
