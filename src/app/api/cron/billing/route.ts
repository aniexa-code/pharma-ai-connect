import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { runBilling } from "@/lib/services/billing";

export const dynamic = "force-dynamic";

/** Tâche quotidienne (Vercel Cron) : factures, retards et suspensions. Protégée par CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  // Comparaison à temps constant : la durée de la réponse ne révèle pas combien de caractères sont justes.
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  return NextResponse.json(await runBilling(), { headers: { "Cache-Control": "no-store" } });
}
