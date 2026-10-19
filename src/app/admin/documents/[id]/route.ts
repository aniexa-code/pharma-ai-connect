import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

/** Pièce justificative : réservée à l'administration, jamais mise en cache ni interprétée comme une page. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return new NextResponse("Accès refusé", { status: 403 });
  const doc = await db.verificationDocument.findUnique({ where: { id: (await params).id } });
  if (!doc) return new NextResponse("Introuvable", { status: 404 });
  return new NextResponse(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
