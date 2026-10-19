import { NextResponse, type NextRequest } from "next/server";
import { getPharmacyUser } from "@/lib/auth";
import { stockExportRows, toCsv, toXlsx } from "@/lib/services/stock";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = await getPharmacyUser();
  if (!u) return NextResponse.redirect(new URL("/pharmacie/connexion", req.url));
  const rows = await stockExportRows(u.pharmacyId);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `stock-${u.pharmacy.slug}-${stamp}`;
  const headers = { "Cache-Control": "private, no-store" };
  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    return new NextResponse(new Uint8Array(await toXlsx(rows)), {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` },
    });
  }
  return new NextResponse(toCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
}
