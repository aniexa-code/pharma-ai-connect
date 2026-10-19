import { NextResponse } from "next/server";
import { runBilling } from "@/lib/services/billing";

/** Tâche quotidienne (Vercel Cron) : factures, retards et suspensions. Protégée par CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
  return NextResponse.json(await runBilling());
}
