import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";

// Les espaces privés et les liens secrets (suivi, demandes) ne doivent jamais apparaître dans un moteur de recherche.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/pharmacie/", "/livreur", "/compte", "/suivi", "/demande", "/panier", "/commander", "/api/"] },
    host: siteUrl(),
  };
}
